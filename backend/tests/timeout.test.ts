import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../src/shared/utils/timeout';
import { TimeoutError } from '../src/domain/errors/DomainError';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the value when the promise settles before the deadline', async () => {
    const result = await withTimeout(Promise.resolve('value'), 1000, 'fast');
    expect(result).toBe('value');
  });

  it('rejects with a TimeoutError when the promise exceeds the deadline', async () => {
    vi.useFakeTimers();
    const pending = new Promise<string>(() => undefined);

    const promise = withTimeout(pending, 50, 'slow');
    const assertion = expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it('includes the label and duration in the TimeoutError message', async () => {
    vi.useFakeTimers();
    const pending = new Promise<string>(() => undefined);

    const promise = withTimeout(pending, 200, 'provider call');
    const assertion = expect(promise).rejects.toThrowError(
      'provider call timed out after 200ms',
    );
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
  });

  it('propagates rejection of the wrapped promise', async () => {
    const failure = new Error('boom');
    await expect(
      withTimeout(Promise.reject(failure), 1000, 'rejecting'),
    ).rejects.toBe(failure);
  });
});
