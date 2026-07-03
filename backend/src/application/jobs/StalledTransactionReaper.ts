import { TransactionRepository } from '../../domain/ports/TransactionRepository';
import { Env } from '../../infrastructure/config/env';
import { AppLogger } from '../../shared/logger';
import { TRANSACTION_STATUS } from '../../domain/constants/transactionStatus';

export class StalledTransactionReaper {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: TransactionRepository,
    private readonly env: Env,
    private readonly logger: AppLogger,
  ) {}

  public start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.sweep();
    }, this.env.STALLED_SWEEP_MS);
    this.logger.info(
      { intervalMs: this.env.STALLED_SWEEP_MS },
      'Stalled transaction reaper started',
    );
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async sweep(): Promise<number> {
    try {
      const stalled = await this.repository.findStalled(
        this.env.STALLED_THRESHOLD_MS,
        50,
      );
      for (const transaction of stalled) {
        await this.repository.updateStatus(
          transaction.id,
          TRANSACTION_STATUS.FAILED,
          {
            error: {
              code: 'STALLED',
              message: 'Transaction exceeded processing threshold',
              retryable: false,
            },
            finishedAt: new Date(),
          },
        );
        await this.repository.appendEvent({
          transactionId: transaction.id,
          fromStatus: TRANSACTION_STATUS.PROCESSING,
          toStatus: TRANSACTION_STATUS.FAILED,
          attempt: transaction.attempts,
          message: 'Marked as failed by stalled transaction reaper',
        });
        this.logger.warn(
          { transactionId: transaction.id },
          'Reaped stalled transaction',
        );
      }
      return stalled.length;
    } catch (error) {
      this.logger.error({ err: error }, 'Stalled transaction sweep failed');
      return 0;
    }
  }
}
