import { DataSource, LessThan, Repository, FindOptionsWhere } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  Transaction,
  TransactionEvent,
} from '../../../domain/entities/Transaction';
import {
  TransactionStatus,
  TRANSACTION_STATUS,
} from '../../../domain/constants/transactionStatus';
import { TransactionType } from '../../../domain/constants/transactionType';
import {
  AppendEventInput,
  CreateIfAbsentResult,
  CreateTransactionInput,
  ListTransactionsFilter,
  TransactionRepository,
  UpdateStatusPatch,
} from '../../../domain/ports/TransactionRepository';
import { TransactionSchema, TransactionRow } from '../schemas/TransactionSchema';
import {
  TransactionEventSchema,
  TransactionEventRow,
} from '../schemas/TransactionEventSchema';

const UNIQUE_VIOLATION = '23505';

const isUniqueViolation = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const e = err as { code?: string; driverError?: { code?: string } };
  return e.code === UNIQUE_VIOLATION || e.driverError?.code === UNIQUE_VIOLATION;
};

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'unknown error';

const toTransaction = (row: TransactionRow): Transaction =>
  new Transaction({
    id: row.id,
    conversationId: row.conversationId,
    idempotencyKey: row.idempotencyKey,
    type: row.type as TransactionType,
    status: row.status as TransactionStatus,
    requestPayload: row.requestPayload,
    result: row.result,
    error: row.error,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    correlationId: row.correlationId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    startedAt: row.startedAt ? new Date(row.startedAt) : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
  });

const toTransactionEvent = (row: TransactionEventRow): TransactionEvent => ({
  id: row.id,
  transactionId: row.transactionId,
  fromStatus: (row.fromStatus as TransactionStatus) ?? null,
  toStatus: row.toStatus as TransactionStatus,
  attempt: row.attempt,
  message: row.message,
  createdAt: new Date(row.createdAt),
});

export class TypeOrmTransactionRepository implements TransactionRepository {
  private readonly transactions: Repository<TransactionRow>;
  private readonly events: Repository<TransactionEventRow>;

  constructor(dataSource: DataSource) {
    this.transactions = dataSource.getRepository(TransactionSchema);
    this.events = dataSource.getRepository(TransactionEventSchema);
  }

  public async createIfAbsent(
    input: CreateTransactionInput,
  ): Promise<CreateIfAbsentResult> {
    const values: Partial<TransactionRow> = {
      id: input.id,
      conversationId: input.conversationId,
      idempotencyKey: input.idempotencyKey,
      type: input.type,
      status: TRANSACTION_STATUS.PENDING,
      requestPayload: input.requestPayload,
      attempts: 0,
      maxAttempts: input.maxAttempts,
      correlationId: input.correlationId,
    };
    try {
      await this.transactions.insert(
        values as unknown as QueryDeepPartialEntity<TransactionRow>,
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.findByIdempotencyKey(input.idempotencyKey);
        if (existing) {
          return { transaction: existing, created: false };
        }
      }
      throw new Error(`Failed to create transaction: ${errorMessage(err)}`);
    }

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error('Failed to create transaction: row missing after insert');
    }
    return { transaction: created, created: true };
  }

  public async findById(id: string): Promise<Transaction | null> {
    const row = await this.transactions.findOne({ where: { id } });
    return row ? toTransaction(row) : null;
  }

  public async list(filter: ListTransactionsFilter): Promise<Transaction[]> {
    const where: FindOptionsWhere<TransactionRow> = {};
    if (filter.conversationId) {
      where.conversationId = filter.conversationId;
    }
    if (filter.status) {
      where.status = filter.status;
    }
    const rows = await this.transactions.find({
      where,
      order: { createdAt: 'DESC' },
      take: filter.limit,
    });
    return rows.map(toTransaction);
  }

  public async updateStatus(
    id: string,
    status: TransactionStatus,
    patch: UpdateStatusPatch,
  ): Promise<Transaction> {
    const update: QueryDeepPartialEntity<TransactionRow> = {
      status,
      updatedAt: new Date(),
    };
    if (patch.result !== undefined) {
      update.result = patch.result;
    }
    if (patch.error !== undefined) {
      update.error = patch.error;
    }
    if (patch.attempts !== undefined) {
      update.attempts = patch.attempts;
    }
    if (patch.startedAt !== undefined) {
      update.startedAt = patch.startedAt;
    }
    if (patch.finishedAt !== undefined) {
      update.finishedAt = patch.finishedAt;
    }

    await this.transactions.update({ id }, update);
    const row = await this.transactions.findOne({ where: { id } });
    if (!row) {
      throw new Error('Failed to update transaction status: not found');
    }
    return toTransaction(row);
  }

  public async incrementAttempts(id: string): Promise<number> {
    const current = await this.findById(id);
    if (!current) {
      throw new Error(`Transaction not found: ${id}`);
    }
    const nextAttempts = current.attempts + 1;
    await this.transactions.update(
      { id },
      { attempts: nextAttempts, updatedAt: new Date() },
    );
    return nextAttempts;
  }

  public async appendEvent(event: AppendEventInput): Promise<void> {
    await this.events.insert({
      transactionId: event.transactionId,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      attempt: event.attempt,
      message: event.message,
    });
  }

  public async listEvents(transactionId: string): Promise<TransactionEvent[]> {
    const rows = await this.events.find({
      where: { transactionId },
      order: { createdAt: 'ASC' },
    });
    return rows.map(toTransactionEvent);
  }

  public async findStalled(
    thresholdMs: number,
    limit: number,
  ): Promise<Transaction[]> {
    const cutoff = new Date(Date.now() - thresholdMs);
    const rows = await this.transactions.find({
      where: {
        status: TRANSACTION_STATUS.PROCESSING,
        startedAt: LessThan(cutoff),
      },
      take: limit,
    });
    return rows.map(toTransaction);
  }

  private async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    const row = await this.transactions.findOne({
      where: { idempotencyKey: key },
    });
    return row ? toTransaction(row) : null;
  }
}
