import { NextFunction, Request, Response } from 'express';
import { CreateTransactionUseCase } from '../../application/use-cases/transaction/CreateTransactionUseCase';
import { GetTransactionStatusUseCase } from '../../application/use-cases/transaction/GetTransactionStatusUseCase';
import { ListTransactionsUseCase } from '../../application/use-cases/transaction/ListTransactionsUseCase';
import { toTransactionDTO } from '../../application/dtos/TransactionDTO';
import { IDEMPOTENCY_HEADER } from '../../shared/constants/config';

interface CreateTransactionBody {
  type: string;
  amount: number;
  currency: string;
  reference?: string;
  destination?: string;
  conversationId?: string;
}

interface ListTransactionsQuery {
  conversationId?: string;
  status?: string;
  limit?: number;
}

export class TransactionController {
  constructor(
    private readonly createTransaction: CreateTransactionUseCase,
    private readonly getTransactionStatus: GetTransactionStatusUseCase,
    private readonly listTransactions: ListTransactionsUseCase,
  ) {}

  public create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = req.body as CreateTransactionBody;
      const idempotencyKey = req.header(IDEMPOTENCY_HEADER) ?? undefined;
      const { transaction, created } = await this.createTransaction.execute({
        args: {
          type: body.type,
          amount: body.amount,
          currency: body.currency,
          reference: body.reference,
          destination: body.destination,
        },
        conversationId: body.conversationId ?? null,
        idempotencyKey,
        correlationId: req.correlationId,
      });
      res.status(created ? 201 : 200).json({
        created,
        transaction: toTransactionDTO(transaction),
      });
    } catch (error) {
      next(error);
    }
  };

  public get = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { transaction, events } = await this.getTransactionStatus.execute({
        transactionId: req.params.id,
      });
      res.status(200).json({ transaction: toTransactionDTO(transaction, events) });
    } catch (error) {
      next(error);
    }
  };

  public list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = req.query as ListTransactionsQuery;
      const transactions = await this.listTransactions.execute({
        conversationId: query.conversationId,
        status: query.status,
        limit: query.limit,
      });
      res.status(200).json({
        transactions: transactions.map((op) => toTransactionDTO(op)),
      });
    } catch (error) {
      next(error);
    }
  };
}
