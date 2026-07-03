import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockTransactionProvider } from '../src/infrastructure/gateway/MockTransactionProvider';
import { ProviderExecuteInput } from '../src/domain/ports/TransactionProvider';
import {
  ProviderPermanentError,
  ProviderTransientError,
  RateLimitError,
  TimeoutError,
} from '../src/domain/errors/DomainError';
import { TRANSACTION_TYPE } from '../src/domain/constants/transactionType';
import { makeEnv, makeLogger } from './support/factories';

const makeExecuteInput = (
  overrides: Partial<ProviderExecuteInput> = {},
): ProviderExecuteInput => ({
  transactionId: 'abcdef12-3456-4789-8abc-def012345678',
  type: TRANSACTION_TYPE.TRANSFER,
  payload: { amount: 250, currency: 'EUR' },
  correlationId: 'corr-1',
  ...overrides,
});

const constantRandom = (value: number) => () => value;

describe('MockTransactionProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a schema-valid result when all failure rates are zero', async () => {
    const provider = new MockTransactionProvider(
      makeEnv(),
      makeLogger(),
      constantRandom(0.5),
    );

    const result = await provider.execute(makeExecuteInput());

    expect(result.reference).toBe('PRV-ABCDEF12');
    expect(result.steps).toEqual(['validate', 'reserve', 'commit']);
    expect(result.finalStep).toBe('commit');
    expect(result.amount).toBe(250);
    expect(result.currency).toBe('EUR');
  });

  it('throws a RateLimitError when the 429 rate is forced to 1.0', async () => {
    const provider = new MockTransactionProvider(
      makeEnv({ MOCK_429_RATE: 1 }),
      makeLogger(),
      constantRandom(0),
    );

    await expect(provider.execute(makeExecuteInput())).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('throws a ProviderTransientError when the 5xx rate is forced to 1.0', async () => {
    const provider = new MockTransactionProvider(
      makeEnv({ MOCK_429_RATE: 0, MOCK_5XX_RATE: 1 }),
      makeLogger(),
      constantRandom(0),
    );

    await expect(provider.execute(makeExecuteInput())).rejects.toBeInstanceOf(
      ProviderTransientError,
    );
  });

  it('throws a ProviderPermanentError when the 4xx rate is forced to 1.0', async () => {
    const provider = new MockTransactionProvider(
      makeEnv({ MOCK_429_RATE: 0, MOCK_5XX_RATE: 0, MOCK_4XX_RATE: 1 }),
      makeLogger(),
      constantRandom(0),
    );

    await expect(provider.execute(makeExecuteInput())).rejects.toBeInstanceOf(
      ProviderPermanentError,
    );
  });

  it('throws a TimeoutError when the timeout rate is forced to 1.0', async () => {
    vi.useFakeTimers();
    const provider = new MockTransactionProvider(
      makeEnv({ MOCK_TIMEOUT_RATE: 1, TRANSACTION_TIMEOUT_MS: 10 }),
      makeLogger(),
      constantRandom(0),
    );

    const promise = provider.execute(makeExecuteInput());
    const assertion = expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('omits amount and currency when the payload does not provide them', async () => {
    const provider = new MockTransactionProvider(
      makeEnv(),
      makeLogger(),
      constantRandom(0.5),
    );

    const result = await provider.execute(
      makeExecuteInput({ payload: {} }),
    );

    expect(result.amount).toBeUndefined();
    expect(result.currency).toBeUndefined();
  });
});
