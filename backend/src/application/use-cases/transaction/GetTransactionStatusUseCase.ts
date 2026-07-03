import { TransactionRepository } from '../../../domain/ports/TransactionRepository';
import { NotFoundError } from '../../../domain/errors/DomainError';
import { Transaction, TransactionEvent } from '../../../domain/entities/Transaction';

export interface GetTransactionStatusInput {
  transactionId: string;
}

export interface GetTransactionStatusOutput {
  transaction: Transaction;
  events: TransactionEvent[];
}

export class GetTransactionStatusUseCase {
  constructor(private readonly repository: TransactionRepository) {}

  public async execute(
    input: GetTransactionStatusInput,
  ): Promise<GetTransactionStatusOutput> {
    const transaction = await this.repository.findById(input.transactionId);
    if (!transaction) {
      throw new NotFoundError(`Transaction not found: ${input.transactionId}`);
    }
    const events = await this.repository.listEvents(transaction.id);
    return { transaction, events };
  }
}
