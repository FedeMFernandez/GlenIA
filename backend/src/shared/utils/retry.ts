export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  isRetryable: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export const computeBackoffDelay = (
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number => {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, maxDelayMs);
  return Math.floor(capped * random());
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const withRetry = async <T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < options.maxAttempts && options.isRetryable(error);
      if (!canRetry) {
        throw error;
      }
      const waitMs = computeBackoffDelay(
        attempt,
        options.baseDelayMs,
        options.maxDelayMs,
      );
      options.onRetry?.(error, attempt, waitMs);
      await delay(waitMs);
    }
  }
  throw lastError;
};
