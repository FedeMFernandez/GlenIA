export interface DomainErrorJSON {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
  details?: unknown;
}

export abstract class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly details?: unknown;

  protected constructor(
    code: string,
    message: string,
    statusCode: number,
    retryable: boolean,
    details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): DomainErrorJSON {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, false, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('NOT_FOUND', message, 404, false, details);
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('IDEMPOTENCY_CONFLICT', message, 409, false, details);
  }
}

export class RateLimitError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('RATE_LIMIT', message, 429, true, details);
  }
}

export class ProviderTransientError extends DomainError {
  constructor(message: string, statusCode = 503, details?: unknown) {
    super('PROVIDER_TRANSIENT', message, statusCode, true, details);
  }
}

export class ProviderPermanentError extends DomainError {
  constructor(message: string, statusCode = 422, details?: unknown) {
    super('PROVIDER_PERMANENT', message, statusCode, false, details);
  }
}

export class TimeoutError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('TIMEOUT', message, 504, true, details);
  }
}

export const isDomainError = (error: unknown): error is DomainError =>
  error instanceof DomainError;

export const isRetryableError = (error: unknown): boolean =>
  isDomainError(error) && error.retryable;
