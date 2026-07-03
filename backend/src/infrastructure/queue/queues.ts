import { ConnectionOptions, Queue } from 'bullmq';
import { RedisConnection } from './redisConnection';
import { Env } from '../config/env';
import { QUEUE_NAMES } from '../../shared/constants/config';

export interface ProcessTransactionJobData {
  transactionId: string;
  correlationId: string;
}

export type TransactionsQueue = Queue<ProcessTransactionJobData>;

export const createTransactionsQueue = (
  connection: RedisConnection,
): TransactionsQueue =>
  new Queue<ProcessTransactionJobData>(QUEUE_NAMES.TRANSACTIONS, {
    connection: connection as unknown as ConnectionOptions,
  });

export const enqueueTransaction = async (
  queue: TransactionsQueue,
  data: ProcessTransactionJobData,
  env: Env,
): Promise<void> => {
  await queue.add(QUEUE_NAMES.TRANSACTIONS, data, {
    jobId: data.transactionId,
    attempts: env.TRANSACTION_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: env.TRANSACTION_BACKOFF_BASE_MS },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
};
