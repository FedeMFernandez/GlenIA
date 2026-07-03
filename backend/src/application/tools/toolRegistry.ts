import { z } from 'zod';
import {
  createTransactionToolSchema,
  getTransactionStatusToolSchema,
  listTransactionsToolSchema,
  TOOL_NAMES,
  ToolName,
} from './toolSchemas';
import { CreateTransactionUseCase } from '../use-cases/transaction/CreateTransactionUseCase';
import { GetTransactionStatusUseCase } from '../use-cases/transaction/GetTransactionStatusUseCase';
import { ListTransactionsUseCase } from '../use-cases/transaction/ListTransactionsUseCase';
import { ValidationError } from '../../domain/errors/DomainError';
import { toTransactionDTO } from '../dtos/TransactionDTO';
import { Transaction } from '../../domain/entities/Transaction';

export interface ToolInvocationContext {
  conversationId: string;
  correlationId: string;
}

export interface ToolResult {
  data: Record<string, unknown>;
  transactions: Transaction[];
}

export interface ToolHandler {
  schema: z.ZodTypeAny;
  effectful: boolean;
  execute(args: unknown, context: ToolInvocationContext): Promise<ToolResult>;
}

const parseArgs = <T>(schema: z.ZodType<T>, args: unknown): T => {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    throw new ValidationError('Invalid tool arguments', {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
};

export class ToolRegistry {
  private readonly handlers: Map<ToolName, ToolHandler>;

  constructor(
    private readonly createTransaction: CreateTransactionUseCase,
    private readonly getTransactionStatus: GetTransactionStatusUseCase,
    private readonly listTransactions: ListTransactionsUseCase,
  ) {
    this.handlers = new Map<ToolName, ToolHandler>([
      [TOOL_NAMES.CREATE_TRANSACTION, this.buildCreateTransactionHandler()],
      [TOOL_NAMES.GET_TRANSACTION_STATUS, this.buildGetStatusHandler()],
      [TOOL_NAMES.LIST_TRANSACTIONS, this.buildListHandler()],
    ]);
  }

  public get(name: string): ToolHandler | undefined {
    return this.handlers.get(name as ToolName);
  }

  private buildCreateTransactionHandler(): ToolHandler {
    return {
      schema: createTransactionToolSchema,
      effectful: true,
      execute: async (args, context) => {
        const parsed = parseArgs(createTransactionToolSchema, args);
        const { transaction, created } = await this.createTransaction.execute({
          args: parsed,
          conversationId: context.conversationId,
          correlationId: context.correlationId,
        });
        return {
          data: {
            created,
            transaction: toTransactionDTO(transaction),
            note: created
              ? 'Transaction accepted and queued for asynchronous processing.'
              : 'An identical transaction already exists; returning the existing one.',
          },
          transactions: [transaction],
        };
      },
    };
  }

  private buildGetStatusHandler(): ToolHandler {
    return {
      schema: getTransactionStatusToolSchema,
      effectful: false,
      execute: async (args) => {
        const parsed = parseArgs(getTransactionStatusToolSchema, args);
        const { transaction, events } = await this.getTransactionStatus.execute({
          transactionId: parsed.transactionId,
        });
        return {
          data: { transaction: toTransactionDTO(transaction, events) },
          transactions: [transaction],
        };
      },
    };
  }

  private buildListHandler(): ToolHandler {
    return {
      schema: listTransactionsToolSchema,
      effectful: false,
      execute: async (args, context) => {
        const parsed = parseArgs(listTransactionsToolSchema, args);
        const transactions = await this.listTransactions.execute({
          conversationId: context.conversationId,
          status: parsed.status,
          limit: parsed.limit,
        });
        return {
          data: { transactions: transactions.map((op) => toTransactionDTO(op)) },
          transactions,
        };
      },
    };
  }
}
