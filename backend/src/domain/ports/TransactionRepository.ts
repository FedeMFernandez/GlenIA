import { Transaction, TransactionEvent } from '../entities/Transaction';
import { TransactionStatus } from '../constants/transactionStatus';

export interface CreateTransactionInput {
  id: string;
  conversationId: string | null;
  idempotencyKey: string;
  type: string;
  requestPayload: Record<string, unknown>;
  maxAttempts: number;
  correlationId: string;
}

export interface CreateIfAbsentResult {
  transaction: Transaction;
  created: boolean;
}

export interface ListTransactionsFilter {
  conversationId?: string;
  status?: TransactionStatus;
  limit: number;
}

export interface UpdateStatusPatch {
  result?: Transaction['result'];
  error?: Transaction['error'];
  startedAt?: Date;
  finishedAt?: Date;
  attempts?: number;
}

export interface AppendEventInput {
  transactionId: string;
  fromStatus: TransactionStatus | null;
  toStatus: TransactionStatus;
  attempt: number;
  message: string | null;
}

export interface TransactionRepository {
  createIfAbsent(input: CreateTransactionInput): Promise<CreateIfAbsentResult>;
  findById(id: string): Promise<Transaction | null>;
  list(filter: ListTransactionsFilter): Promise<Transaction[]>;
  updateStatus(
    id: string,
    status: TransactionStatus,
    patch: UpdateStatusPatch,
  ): Promise<Transaction>;
  incrementAttempts(id: string): Promise<number>;
  appendEvent(event: AppendEventInput): Promise<void>;
  listEvents(transactionId: string): Promise<TransactionEvent[]>;
  findStalled(thresholdMs: number, limit: number): Promise<Transaction[]>;
}
