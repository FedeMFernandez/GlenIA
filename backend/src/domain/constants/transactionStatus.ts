export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

export type TransactionStatus =
  (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];

export const TERMINAL_STATUSES: readonly TransactionStatus[] = [
  TRANSACTION_STATUS.SUCCEEDED,
  TRANSACTION_STATUS.FAILED,
  TRANSACTION_STATUS.CANCELED,
];

export const isTerminalStatus = (status: TransactionStatus): boolean =>
  TERMINAL_STATUSES.includes(status);
