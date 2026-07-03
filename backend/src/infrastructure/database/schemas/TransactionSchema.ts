import { EntitySchema } from 'typeorm';
import {
  TransactionErrorInfo,
  TransactionResult,
} from '../../../domain/entities/Transaction';

export interface TransactionRow {
  id: string;
  conversationId: string | null;
  idempotencyKey: string;
  type: string;
  status: string;
  requestPayload: Record<string, unknown>;
  result: TransactionResult | null;
  error: TransactionErrorInfo | null;
  attempts: number;
  maxAttempts: number;
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export const TransactionSchema = new EntitySchema<TransactionRow>({
  name: 'Transaction',
  tableName: 'transactions',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'gen_random_uuid()',
    },
    conversationId: {
      name: 'conversation_id',
      type: 'uuid',
      nullable: true,
    },
    idempotencyKey: {
      name: 'idempotency_key',
      type: 'text',
      nullable: false,
      unique: true,
    },
    type: {
      type: 'text',
      nullable: false,
    },
    status: {
      type: 'text',
      nullable: false,
      default: 'pending',
    },
    requestPayload: {
      name: 'request_payload',
      type: 'jsonb',
      nullable: false,
      default: {},
    },
    result: {
      type: 'jsonb',
      nullable: true,
    },
    error: {
      type: 'jsonb',
      nullable: true,
    },
    attempts: {
      type: 'int',
      nullable: false,
      default: 0,
    },
    maxAttempts: {
      name: 'max_attempts',
      type: 'int',
      nullable: false,
      default: 4,
    },
    correlationId: {
      name: 'correlation_id',
      type: 'text',
      nullable: false,
    },
    createdAt: {
      name: 'created_at',
      type: 'timestamptz',
      nullable: false,
      default: () => 'now()',
    },
    updatedAt: {
      name: 'updated_at',
      type: 'timestamptz',
      nullable: false,
      default: () => 'now()',
    },
    startedAt: {
      name: 'started_at',
      type: 'timestamptz',
      nullable: true,
    },
    finishedAt: {
      name: 'finished_at',
      type: 'timestamptz',
      nullable: true,
    },
  },
  indices: [
    {
      name: 'idx_transactions_idempotency_key',
      columns: ['idempotencyKey'],
      unique: true,
    },
    {
      name: 'idx_transactions_conversation',
      columns: ['conversationId'],
    },
    {
      name: 'idx_transactions_status',
      columns: ['status'],
    },
  ],
});
