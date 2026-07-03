import { TransactionStatus } from '../constants/transactionStatus';
import { TransactionType } from '../constants/transactionType';

export interface TransactionResult {
  reference: string;
  steps: string[];
  finalStep: string;
  amount?: number;
  currency?: string;
}

export interface TransactionErrorInfo {
  code: string;
  message: string;
  failedStep?: string;
  retryable: boolean;
}

export interface TransactionProps {
  id: string;
  conversationId: string | null;
  idempotencyKey: string;
  type: TransactionType;
  status: TransactionStatus;
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

export class Transaction {
  public readonly id: string;
  public readonly conversationId: string | null;
  public readonly idempotencyKey: string;
  public readonly type: TransactionType;
  public readonly status: TransactionStatus;
  public readonly requestPayload: Record<string, unknown>;
  public readonly result: TransactionResult | null;
  public readonly error: TransactionErrorInfo | null;
  public readonly attempts: number;
  public readonly maxAttempts: number;
  public readonly correlationId: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly startedAt: Date | null;
  public readonly finishedAt: Date | null;

  constructor(props: TransactionProps) {
    this.id = props.id;
    this.conversationId = props.conversationId;
    this.idempotencyKey = props.idempotencyKey;
    this.type = props.type;
    this.status = props.status;
    this.requestPayload = props.requestPayload;
    this.result = props.result;
    this.error = props.error;
    this.attempts = props.attempts;
    this.maxAttempts = props.maxAttempts;
    this.correlationId = props.correlationId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;
  }
}

export interface TransactionEvent {
  id: string;
  transactionId: string;
  fromStatus: TransactionStatus | null;
  toStatus: TransactionStatus;
  attempt: number;
  message: string | null;
  createdAt: Date;
}
