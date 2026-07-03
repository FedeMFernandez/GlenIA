import { TimeoutError } from '../../domain/errors/DomainError';

export const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  }) as Promise<T>;
};
