import { TransactionType } from '../constants/transactionType';

export interface ProviderExecuteInput {
  transactionId: string;
  type: TransactionType;
  payload: Record<string, unknown>;
  correlationId: string;
}

export interface ProviderResult {
  reference: string;
  steps: string[];
  finalStep: string;
  amount?: number;
  currency?: string;
}

export interface TransactionProvider {
  execute(input: ProviderExecuteInput): Promise<ProviderResult>;
}
