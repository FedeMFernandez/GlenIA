import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeBackoffDelay,
  withRetry,
  RetryOptions,
} from '../src/shared/utils/retry';

const makeRetryOptions = (
  overrides: Partial<RetryOptions> = {},
): RetryOptions => ({
  maxAttempts: 3,
  baseDelayMs: 10,
  maxDelayMs: 1000,
  isRetryable: () => true,
  ...overrides,
});

describe('computeBackoffDelay', () => {
  it('grows exponentially with the attempt number', () => {
    const noJitter = () => 1;
    expect(computeBackoffDelay(1, 100, 10000, noJitter)).toBe(100);
    expect(computeBackoffDelay(2, 100, 10000, noJitter)).toBe(200);
    expect(computeBackoffDelay(3, 100, 10000, noJitter)).toBe(400);
    expect(computeBackoffDelay(4, 100, 10000, noJitter)).toBe(800);
  });

  it('caps the delay at maxDelayMs', () => {
    const noJitter = () => 1;
    expect(computeBackoffDelay(10, 100, 500, noJitter)).toBe(500);
  });

  it('applies jitter as a multiplier of the capped delay', () => {
    expect(computeBackoffDelay(3, 100, 10000, () => 0.5)).toBe(200);
    expect(computeBackoffDelay(3, 100, 10000, () => 0)).toBe(0);
  });
});

describe('withRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves on the first attempt without retrying', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await withRetry(fn, makeRetryOptions());
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries retryable failures then succeeds', async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('recovered');

    const promise = withRetry(fn, makeRetryOptions({ maxAttempts: 3 }));
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries up to maxAttempts then throws the last error', async () => {
    vi.useFakeTimers();
    const lastError = new Error('attempt-3');
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error('attempt-1'))
      .mockRejectedValueOnce(new Error('attempt-2'))
      .mockRejectedValueOnce(lastError);

    const promise = withRetry(fn, makeRetryOptions({ maxAttempts: 3 }));
    const assertion = expect(promise).rejects.toBe(lastError);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when isRetryable returns false and throws immediately', async () => {
    const error = new Error('permanent');
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValue(error);

    await expect(
      withRetry(fn, makeRetryOptions({ isRetryable: () => false })),
    ).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('invokes onRetry with growing delays between attempts', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValueOnce('done');

    const promise = withRetry(
      fn,
      makeRetryOptions({ maxAttempts: 3, baseDelayMs: 100, onRetry }),
    );
    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(2);
    const firstDelay = onRetry.mock.calls[0][2] as number;
    const secondDelay = onRetry.mock.calls[1][2] as number;
    expect(firstDelay).toBeLessThanOrEqual(100);
    expect(secondDelay).toBeLessThanOrEqual(200);
    expect(onRetry.mock.calls[0][1]).toBe(1);
    expect(onRetry.mock.calls[1][1]).toBe(2);
  });
});
