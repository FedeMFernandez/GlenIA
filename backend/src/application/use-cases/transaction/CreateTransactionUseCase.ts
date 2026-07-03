import { z } from 'zod';
import { TransactionRepository } from '../../../domain/ports/TransactionRepository';
import { TransactionOrchestrator } from '../../services/TransactionOrchestrator';
import { Env } from '../../../infrastructure/config/env';
import { AppLogger } from '../../../shared/logger';
import { TRANSACTION_TYPE } from '../../../domain/constants/transactionType';
import { ValidationError } from '../../../domain/errors/DomainError';
import { deriveIdempotencyKey, newId } from '../../../shared/utils/ids';
import { Transaction } from '../../../domain/entities/Transaction';

export const createTransactionSchema = z.object({
  type: z.nativeEnum(TRANSACTION_TYPE),
  amount: z.number().positive(),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  reference: z.string().min(1).max(140).optional(),
  destination: z.string().min(1).max(140).optional(),
});

export type CreateTransactionArgs = z.infer<typeof createTransactionSchema>;

export interface CreateTransactionInput {
  args: unknown;
  conversationId: string | null;
  idempotencyKey?: string;
  correlationId: string;
}

export interface CreateTransactionOutput {
  transaction: Transaction;
  created: boolean;
}

export class CreateTransactionUseCase {
  constructor(
    private readonly repository: TransactionRepository,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly env: Env,
    private readonly logger: AppLogger,
  ) {}

  public async execute(
    input: CreateTransactionInput,
  ): Promise<CreateTransactionOutput> {
    const parsed = createTransactionSchema.safeParse(input.args);
    if (!parsed.success) {
      throw new ValidationError('Invalid transaction request', {
        issues: parsed.error.issues,
      });
    }

    const payload: Record<string, unknown> = {
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      reference: parsed.data.reference ?? null,
      destination: parsed.data.destination ?? null,
    };

    const idempotencyKey =
      input.idempotencyKey ??
      deriveIdempotencyKey('op', {
        type: parsed.data.type,
        conversationId: input.conversationId,
        payload,
      });

    const { transaction, created } = await this.repository.createIfAbsent({
      id: newId(),
      conversationId: input.conversationId,
      idempotencyKey,
      type: parsed.data.type,
      requestPayload: payload,
      maxAttempts: this.env.TRANSACTION_MAX_ATTEMPTS,
      correlationId: input.correlationId,
    });

    if (created) {
      await this.orchestrator.enqueue({
        transactionId: transaction.id,
        correlationId: input.correlationId,
      });
      this.logger.info(
        { transactionId: transaction.id, type: transaction.type },
        'Transaction created and enqueued',
      );
    } else {
      this.logger.info(
        { transactionId: transaction.id, idempotencyKey },
        'Idempotent transaction hit, reusing existing transaction',
      );
    }

    return { transaction, created };
  }
}
