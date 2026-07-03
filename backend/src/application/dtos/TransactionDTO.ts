import { Transaction, TransactionEvent } from '../../domain/entities/Transaction';

export interface TransactionEventDTO {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  attempt: number;
  message: string | null;
  createdAt: string;
}

export interface TransactionDTO {
  id: string;
  conversationId: string | null;
  idempotencyKey: string;
  type: string;
  status: string;
  requestPayload: Record<string, unknown>;
  result: Transaction['result'];
  error: Transaction['error'];
  attempts: number;
  maxAttempts: number;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  events?: TransactionEventDTO[];
}

export const toTransactionEventDTO = (
  event: TransactionEvent,
): TransactionEventDTO => ({
  id: event.id,
  fromStatus: event.fromStatus,
  toStatus: event.toStatus,
  attempt: event.attempt,
  message: event.message,
  createdAt: event.createdAt.toISOString(),
});

export const toTransactionDTO = (
  transaction: Transaction,
  events?: TransactionEvent[],
): TransactionDTO => ({
  id: transaction.id,
  conversationId: transaction.conversationId,
  idempotencyKey: transaction.idempotencyKey,
  type: transaction.type,
  status: transaction.status,
  requestPayload: transaction.requestPayload,
  result: transaction.result,
  error: transaction.error,
  attempts: transaction.attempts,
  maxAttempts: transaction.maxAttempts,
  correlationId: transaction.correlationId,
  createdAt: transaction.createdAt.toISOString(),
  updatedAt: transaction.updatedAt.toISOString(),
  startedAt: transaction.startedAt ? transaction.startedAt.toISOString() : null,
  finishedAt: transaction.finishedAt
    ? transaction.finishedAt.toISOString()
    : null,
  events: events ? events.map(toTransactionEventDTO) : undefined,
});
