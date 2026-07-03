import { Env } from '../../infrastructure/config/env';
import {
  enqueueTransaction,
  TransactionsQueue,
} from '../../infrastructure/queue/queues';
import { AppLogger } from '../../shared/logger';

export interface EnqueueInput {
  transactionId: string;
  correlationId: string;
}

export class TransactionOrchestrator {
  constructor(
    private readonly queue: TransactionsQueue,
    private readonly env: Env,
    private readonly logger: AppLogger,
  ) {}

  public async enqueue(input: EnqueueInput): Promise<void> {
    await enqueueTransaction(this.queue, input, this.env);
    this.logger.info(
      { transactionId: input.transactionId, correlationId: input.correlationId },
      'Transaction enqueued',
    );
  }
}
