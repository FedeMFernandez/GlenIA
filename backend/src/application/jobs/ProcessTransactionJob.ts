import { TransactionRepository } from '../../domain/ports/TransactionRepository';
import { TransactionProvider } from '../../domain/ports/TransactionProvider';
import { Env } from '../../infrastructure/config/env';
import { AppLogger } from '../../shared/logger';
import { withTimeout } from '../../shared/utils/timeout';
import {
  DomainError,
  isRetryableError,
} from '../../domain/errors/DomainError';
import {
  isTerminalStatus,
  TRANSACTION_STATUS,
} from '../../domain/constants/transactionStatus';
import { TransactionErrorInfo } from '../../domain/entities/Transaction';

export interface ProcessTransactionInput {
  transactionId: string;
  correlationId: string;
  attemptNumber: number;
  isLastAttempt: boolean;
}

const toErrorInfo = (error: unknown): TransactionErrorInfo => {
  if (error instanceof DomainError) {
    const details = error.details as { failedStep?: string } | undefined;
    return {
      code: error.code,
      message: error.message,
      failedStep: details?.failedStep,
      retryable: error.retryable,
    };
  }
  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Unknown error',
    retryable: false,
  };
};

export class ProcessTransactionJob {
  constructor(
    private readonly repository: TransactionRepository,
    private readonly provider: TransactionProvider,
    private readonly env: Env,
    private readonly logger: AppLogger,
  ) {}

  public async run(input: ProcessTransactionInput): Promise<void> {
    const log = this.logger.child({
      transactionId: input.transactionId,
      correlationId: input.correlationId,
      attempt: input.attemptNumber,
    });

    const transaction = await this.repository.findById(input.transactionId);
    if (!transaction) {
      log.warn('Transaction not found, skipping job');
      return;
    }
    if (isTerminalStatus(transaction.status)) {
      log.info({ status: transaction.status }, 'Transaction already terminal, skipping');
      return;
    }

    await this.repository.updateStatus(
      transaction.id,
      TRANSACTION_STATUS.PROCESSING,
      { startedAt: transaction.startedAt ?? new Date(), attempts: input.attemptNumber },
    );
    await this.repository.appendEvent({
      transactionId: transaction.id,
      fromStatus: transaction.status,
      toStatus: TRANSACTION_STATUS.PROCESSING,
      attempt: input.attemptNumber,
      message: 'Processing started',
    });

    try {
      const result = await withTimeout(
        this.provider.execute({
          transactionId: transaction.id,
          type: transaction.type,
          payload: transaction.requestPayload,
          correlationId: input.correlationId,
        }),
        this.env.TRANSACTION_TIMEOUT_MS,
        `transaction ${transaction.id}`,
      );

      await this.repository.updateStatus(
        transaction.id,
        TRANSACTION_STATUS.SUCCEEDED,
        { result, finishedAt: new Date(), error: null },
      );
      await this.repository.appendEvent({
        transactionId: transaction.id,
        fromStatus: TRANSACTION_STATUS.PROCESSING,
        toStatus: TRANSACTION_STATUS.SUCCEEDED,
        attempt: input.attemptNumber,
        message: `Completed at step ${result.finalStep}`,
      });
      log.info({ reference: result.reference }, 'Transaction succeeded');
    } catch (error) {
      await this.handleFailure(transaction.id, input, error, log);
    }
  }

  private async handleFailure(
    transactionId: string,
    input: ProcessTransactionInput,
    error: unknown,
    log: AppLogger,
  ): Promise<void> {
    const retryable = isRetryableError(error);
    const errorInfo = toErrorInfo(error);

    if (retryable && !input.isLastAttempt) {
      await this.repository.appendEvent({
        transactionId,
        fromStatus: TRANSACTION_STATUS.PROCESSING,
        toStatus: TRANSACTION_STATUS.PROCESSING,
        attempt: input.attemptNumber,
        message: `Retryable failure (${errorInfo.code}): ${errorInfo.message}`,
      });
      log.warn({ err: errorInfo }, 'Retryable failure, will retry');
      throw error;
    }

    await this.repository.updateStatus(transactionId, TRANSACTION_STATUS.FAILED, {
      error: errorInfo,
      finishedAt: new Date(),
    });
    await this.repository.appendEvent({
      transactionId,
      fromStatus: TRANSACTION_STATUS.PROCESSING,
      toStatus: TRANSACTION_STATUS.FAILED,
      attempt: input.attemptNumber,
      message: `Terminal failure (${errorInfo.code}): ${errorInfo.message}`,
    });

    if (retryable) {
      log.error({ err: errorInfo }, 'Retries exhausted, transaction failed');
      throw error;
    }
    log.error({ err: errorInfo }, 'Non-retryable failure, transaction failed');
  }
}
