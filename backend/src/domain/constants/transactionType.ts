export const TRANSACTION_TYPE = {
  TRANSFER: 'transfer',
  PAYOUT: 'payout',
  REFUND: 'refund',
} as const;

export type TransactionType =
  (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const TRANSACTION_TYPES: readonly TransactionType[] = Object.values(
  TRANSACTION_TYPE,
);

export const isTransactionType = (value: string): value is TransactionType =>
  (TRANSACTION_TYPES as readonly string[]).includes(value);
