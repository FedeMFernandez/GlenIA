import { TransactionRepository } from '../../../domain/ports/TransactionRepository';
import { Transaction } from '../../../domain/entities/Transaction';
import {
  TransactionStatus,
  TRANSACTION_STATUS,
} from '../../../domain/constants/transactionStatus';
import { ValidationError } from '../../../domain/errors/DomainError';
import { DEFAULT_LIST_LIMIT } from '../../../shared/constants/config';

export interface ListTransactionsInput {
  conversationId?: string;
  status?: string;
  limit?: number;
}

const isValidStatus = (value: string): value is TransactionStatus =>
  Object.values(TRANSACTION_STATUS).includes(value as TransactionStatus);

export class ListTransactionsUseCase {
  constructor(private readonly repository: TransactionRepository) {}

  public async execute(input: ListTransactionsInput): Promise<Transaction[]> {
    if (input.status && !isValidStatus(input.status)) {
      throw new ValidationError(`Invalid status filter: ${input.status}`);
    }
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIST_LIMIT, 1), 100);
    return this.repository.list({
      conversationId: input.conversationId,
      status: input.status as TransactionStatus | undefined,
      limit,
    });
  }
}
