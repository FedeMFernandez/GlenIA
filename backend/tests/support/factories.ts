import { vi } from 'vitest';
import { Env } from '../../src/infrastructure/config/env';
import { AppLogger } from '../../src/shared/logger';
import {
  Transaction,
  TransactionProps,
} from '../../src/domain/entities/Transaction';
import { TransactionRepository } from '../../src/domain/ports/TransactionRepository';
import { TransactionProvider } from '../../src/domain/ports/TransactionProvider';
import { TransactionOrchestrator } from '../../src/application/services/TransactionOrchestrator';
import { TRANSACTION_STATUS } from '../../src/domain/constants/transactionStatus';
import { TRANSACTION_TYPE } from '../../src/domain/constants/transactionType';

export const makeEnv = (overrides: Partial<Env> = {}): Env => ({
  PORT: 3000,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/postgres',
  DATABASE_SSL: false,
  REDIS_URL: 'redis://localhost:6379',
  OPENAI_API_KEY: 'openai-key',
  OPENAI_MODEL: 'gpt-4o-mini',
  TRANSACTION_MAX_ATTEMPTS: 4,
  TRANSACTION_TIMEOUT_MS: 8000,
  TRANSACTION_BACKOFF_BASE_MS: 500,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX: 60,
  MOCK_LATENCY_MS_MIN: 0,
  MOCK_LATENCY_MS_MAX: 0,
  MOCK_TIMEOUT_RATE: 0,
  MOCK_5XX_RATE: 0,
  MOCK_429_RATE: 0,
  MOCK_4XX_RATE: 0,
  STALLED_SWEEP_MS: 30000,
  STALLED_THRESHOLD_MS: 60000,
  ...overrides,
});

export const makeLogger = (): AppLogger => {
  const logger: Record<string, unknown> = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    level: 'silent',
  };
  logger.child = vi.fn(() => logger);
  return logger as unknown as AppLogger;
};

export const makeTransaction = (
  overrides: Partial<TransactionProps> = {},
): Transaction =>
  new Transaction({
    id: '11111111-1111-4111-8111-111111111111',
    conversationId: null,
    idempotencyKey: 'op_deadbeef',
    type: TRANSACTION_TYPE.TRANSFER,
    status: TRANSACTION_STATUS.PENDING,
    requestPayload: { amount: 100, currency: 'USD' },
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 4,
    correlationId: 'corr_test',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    startedAt: null,
    finishedAt: null,
    ...overrides,
  });

export const makeTransactionRepository = (): TransactionRepository => ({
  createIfAbsent: vi.fn(),
  findById: vi.fn(),
  list: vi.fn(),
  updateStatus: vi.fn(),
  incrementAttempts: vi.fn(),
  appendEvent: vi.fn(),
  listEvents: vi.fn(),
  findStalled: vi.fn(),
});

export const makeTransactionProvider = (): TransactionProvider => ({
  execute: vi.fn(),
});

export const makeOrchestrator = (): TransactionOrchestrator =>
  ({ enqueue: vi.fn() } as unknown as TransactionOrchestrator);
