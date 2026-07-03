import { describe, expect, it } from 'vitest';
import {
  DomainError,
  IdempotencyConflictError,
  NotFoundError,
  ProviderPermanentError,
  ProviderTransientError,
  RateLimitError,
  TimeoutError,
  ValidationError,
  isDomainError,
  isRetryableError,
} from '../src/domain/errors/DomainError';

interface ErrorExpectation {
  create: () => DomainError;
  code: string;
  statusCode: number;
  retryable: boolean;
}

const expectations: Record<string, ErrorExpectation> = {
  ValidationError: {
    create: () => new ValidationError('invalid'),
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    retryable: false,
  },
  NotFoundError: {
    create: () => new NotFoundError('missing'),
    code: 'NOT_FOUND',
    statusCode: 404,
    retryable: false,
  },
  IdempotencyConflictError: {
    create: () => new IdempotencyConflictError('conflict'),
    code: 'IDEMPOTENCY_CONFLICT',
    statusCode: 409,
    retryable: false,
  },
  RateLimitError: {
    create: () => new RateLimitError('slow down'),
    code: 'RATE_LIMIT',
    statusCode: 429,
    retryable: true,
  },
  ProviderTransientError: {
    create: () => new ProviderTransientError('temporary'),
    code: 'PROVIDER_TRANSIENT',
    statusCode: 503,
    retryable: true,
  },
  ProviderPermanentError: {
    create: () => new ProviderPermanentError('rejected'),
    code: 'PROVIDER_PERMANENT',
    statusCode: 422,
    retryable: false,
  },
  TimeoutError: {
    create: () => new TimeoutError('too slow'),
    code: 'TIMEOUT',
    statusCode: 504,
    retryable: true,
  },
};

describe('DomainError subclasses', () => {
  for (const [name, expectation] of Object.entries(expectations)) {
    describe(name, () => {
      it('exposes the expected code, statusCode and retryable flag', () => {
        const error = expectation.create();
        expect(error.code).toBe(expectation.code);
        expect(error.statusCode).toBe(expectation.statusCode);
        expect(error.retryable).toBe(expectation.retryable);
      });

      it('is an instance of Error and DomainError with a matching name', () => {
        const error = expectation.create();
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(DomainError);
        expect(error.name).toBe(name);
      });

      it('produces a safe toJSON payload', () => {
        const error = expectation.create();
        expect(error.toJSON()).toEqual({
          code: expectation.code,
          message: error.message,
          statusCode: expectation.statusCode,
          retryable: expectation.retryable,
          details: undefined,
        });
      });
    });
  }

  it('allows overriding provider status codes', () => {
    expect(new ProviderTransientError('x', 500).statusCode).toBe(500);
    expect(new ProviderPermanentError('x', 400).statusCode).toBe(400);
  });

  it('carries details through toJSON', () => {
    const error = new ValidationError('invalid', { field: 'amount' });
    expect(error.toJSON().details).toEqual({ field: 'amount' });
  });
});

describe('isDomainError', () => {
  it('returns true for domain errors and false otherwise', () => {
    expect(isDomainError(new TimeoutError('t'))).toBe(true);
    expect(isDomainError(new Error('plain'))).toBe(false);
    expect(isDomainError('string')).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('is true only for retryable domain errors', () => {
    expect(isRetryableError(new RateLimitError('r'))).toBe(true);
    expect(isRetryableError(new ProviderTransientError('t'))).toBe(true);
    expect(isRetryableError(new TimeoutError('t'))).toBe(true);
    expect(isRetryableError(new ValidationError('v'))).toBe(false);
    expect(isRetryableError(new ProviderPermanentError('p'))).toBe(false);
    expect(isRetryableError(new Error('plain'))).toBe(false);
  });
});
