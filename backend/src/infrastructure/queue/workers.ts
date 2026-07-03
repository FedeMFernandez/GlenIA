import { ConnectionOptions, Job, Worker } from 'bullmq';
import { Context } from '../../shared/context';
import { CONTEXT_KEYS, QUEUE_NAMES } from '../../shared/constants/config';
import { Env } from '../config/env';
import { AppLogger } from '../../shared/logger';
import { TransactionRepository } from '../../domain/ports/TransactionRepository';
import { TransactionProvider } from '../../domain/ports/TransactionProvider';
import { ProcessTransactionJob } from '../../application/jobs/ProcessTransactionJob';
import { ProcessTransactionJobData } from './queues';
import { createRedisConnection, RedisConnection } from './redisConnection';
import {
  isTerminalStatus,
  TRANSACTION_STATUS,
} from '../../domain/constants/transactionStatus';

export interface WorkersHandle {
  close(): Promise<void>;
}

const ensureTerminalFailure = async (
  repository: TransactionRepository,
  transactionId: string,
  reason: string,
  logger: AppLogger,
): Promise<void> => {
  const transaction = await repository.findById(transactionId);
  if (!transaction || isTerminalStatus(transaction.status)) {
    return;
  }
  await repository.updateStatus(transactionId, TRANSACTION_STATUS.FAILED, {
    error: { code: 'JOB_FAILED', message: reason, retryable: false },
    finishedAt: new Date(),
  });
  await repository.appendEvent({
    transactionId,
    fromStatus: transaction.status,
    toStatus: TRANSACTION_STATUS.FAILED,
    attempt: transaction.attempts,
    message: `Terminal state enforced by worker: ${reason}`,
  });
  logger.warn({ transactionId, reason }, 'Enforced terminal failure state');
};

export const initWorkers = (context: Context): WorkersHandle => {
  const env = context.resolve<Env>(CONTEXT_KEYS.CONFIG);
  const logger = context.resolve<AppLogger>(CONTEXT_KEYS.LOGGER);
  const repository = context.resolve<TransactionRepository>(
    CONTEXT_KEYS.TRANSACTION_REPOSITORY,
  );
  const provider = context.resolve<TransactionProvider>(
    CONTEXT_KEYS.TRANSACTION_PROVIDER,
  );

  const connection: RedisConnection = createRedisConnection(env);
  const job = new ProcessTransactionJob(repository, provider, env, logger);

  const worker = new Worker<ProcessTransactionJobData>(
    QUEUE_NAMES.TRANSACTIONS,
    async (bullJob: Job<ProcessTransactionJobData>) => {
      const attemptNumber = bullJob.attemptsMade + 1;
      const maxAttempts = bullJob.opts.attempts ?? env.TRANSACTION_MAX_ATTEMPTS;
      await job.run({
        transactionId: bullJob.data.transactionId,
        correlationId: bullJob.data.correlationId,
        attemptNumber,
        isLastAttempt: attemptNumber >= maxAttempts,
      });
    },
    { connection: connection as unknown as ConnectionOptions, concurrency: 5 },
  );

  worker.on('failed', (bullJob, error) => {
    if (!bullJob) {
      return;
    }
    const maxAttempts = bullJob.opts.attempts ?? env.TRANSACTION_MAX_ATTEMPTS;
    if (bullJob.attemptsMade >= maxAttempts) {
      void ensureTerminalFailure(
        repository,
        bullJob.data.transactionId,
        error.message,
        logger,
      );
    }
  });

  worker.on('stalled', (jobId) => {
    void ensureTerminalFailure(
      repository,
      jobId,
      'Job stalled in queue',
      logger,
    );
  });

  worker.on('error', (error) => {
    logger.error({ err: error }, 'Transactions worker error');
  });

  logger.info('Transactions worker initialized');

  return {
    close: async () => {
      await worker.close();
      await connection.quit();
    },
  };
};
