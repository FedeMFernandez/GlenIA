import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessTransactionJob,
  ProcessTransactionInput,
} from '../src/application/jobs/ProcessTransactionJob';
import { AppendEventInput } from '../src/domain/ports/TransactionRepository';
import {
  TRANSACTION_STATUS,
  TransactionStatus,
} from '../src/domain/constants/transactionStatus';
import {
  ProviderPermanentError,
  ProviderTransientError,
  RateLimitError,
} from '../src/domain/errors/DomainError';
import { ProviderResult } from '../src/domain/ports/TransactionProvider';
import {
  makeEnv,
  makeLogger,
  makeTransaction,
  makeTransactionProvider,
  makeTransactionRepository,
} from './support/factories';

const makeJobInput = (
  overrides: Partial<ProcessTransactionInput> = {},
): ProcessTransactionInput => ({
  transactionId: '11111111-1111-4111-8111-111111111111',
  correlationId: 'corr-1',
  attemptNumber: 1,
  isLastAttempt: false,
  ...overrides,
});

const successResult: ProviderResult = {
  reference: 'PRV-ABCDEF12',
  steps: ['validate', 'reserve', 'commit'],
  finalStep: 'commit',
  amount: 100,
  currency: 'USD',
};

describe('ProcessTransactionJob', () => {
  let repository: ReturnType<typeof makeTransactionRepository>;
  let provider: ReturnType<typeof makeTransactionProvider>;
  let job: ProcessTransactionJob;

  const statusUpdates = (): TransactionStatus[] =>
    vi
      .mocked(repository.updateStatus)
      .mock.calls.map((call) => call[1] as TransactionStatus);

  const eventTransitions = (): TransactionStatus[] =>
    vi
      .mocked(repository.appendEvent)
      .mock.calls.map((call) => (call[0] as AppendEventInput).toStatus);

  beforeEach(() => {
    repository = makeTransactionRepository();
    provider = makeTransactionProvider();
    job = new ProcessTransactionJob(
      repository,
      provider,
      makeEnv({ TRANSACTION_TIMEOUT_MS: 1000 }),
      makeLogger(),
    );
  });

  it('marks the transaction processing then succeeded on a provider success', async () => {
    vi.mocked(repository.findById).mockResolvedValue(makeTransaction());
    vi.mocked(provider.execute).mockResolvedValue(successResult);

    await job.run(makeJobInput());

    expect(statusUpdates()).toEqual([
      TRANSACTION_STATUS.PROCESSING,
      TRANSACTION_STATUS.SUCCEEDED,
    ]);
    expect(eventTransitions()).toEqual([
      TRANSACTION_STATUS.PROCESSING,
      TRANSACTION_STATUS.SUCCEEDED,
    ]);
    expect(statusUpdates()).not.toContain(TRANSACTION_STATUS.FAILED);
  });

  it('drives a non-retryable provider error to a terminal failed state without throwing', async () => {
    vi.mocked(repository.findById).mockResolvedValue(makeTransaction());
    vi.mocked(provider.execute).mockRejectedValue(
      new ProviderPermanentError('rejected'),
    );

    await expect(job.run(makeJobInput())).resolves.toBeUndefined();

    expect(statusUpdates()).toEqual([
      TRANSACTION_STATUS.PROCESSING,
      TRANSACTION_STATUS.FAILED,
    ]);
    expect(eventTransitions().at(-1)).toBe(TRANSACTION_STATUS.FAILED);
  });

  it('rethrows a retryable provider error on a non-final attempt and leaves it for the queue to retry', async () => {
    vi.mocked(repository.findById).mockResolvedValue(makeTransaction());
    const error = new ProviderTransientError('temporary');
    vi.mocked(provider.execute).mockRejectedValue(error);

    await expect(
      job.run(makeJobInput({ isLastAttempt: false })),
    ).rejects.toBe(error);

    expect(statusUpdates()).toEqual([TRANSACTION_STATUS.PROCESSING]);
    expect(statusUpdates()).not.toContain(TRANSACTION_STATUS.FAILED);
  });

  it('marks failed and rethrows when a retryable error exhausts the final attempt', async () => {
    vi.mocked(repository.findById).mockResolvedValue(makeTransaction());
    const error = new RateLimitError('slow down');
    vi.mocked(provider.execute).mockRejectedValue(error);

    await expect(
      job.run(makeJobInput({ isLastAttempt: true })),
    ).rejects.toBe(error);

    expect(statusUpdates()).toEqual([
      TRANSACTION_STATUS.PROCESSING,
      TRANSACTION_STATUS.FAILED,
    ]);
  });

  it('skips processing when the transaction is already terminal', async () => {
    vi.mocked(repository.findById).mockResolvedValue(
      makeTransaction({ status: TRANSACTION_STATUS.SUCCEEDED }),
    );

    await job.run(makeJobInput());

    expect(vi.mocked(repository.updateStatus)).not.toHaveBeenCalled();
    expect(vi.mocked(provider.execute)).not.toHaveBeenCalled();
  });

  it('skips processing when the transaction does not exist', async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    await job.run(makeJobInput());

    expect(vi.mocked(repository.updateStatus)).not.toHaveBeenCalled();
    expect(vi.mocked(provider.execute)).not.toHaveBeenCalled();
  });

  it('never leaves the transaction in processing after a terminal outcome', async () => {
    vi.mocked(repository.findById).mockResolvedValue(makeTransaction());
    vi.mocked(provider.execute).mockRejectedValue(
      new ProviderPermanentError('rejected'),
    );

    await job.run(makeJobInput());

    expect(statusUpdates().at(-1)).toBe(TRANSACTION_STATUS.FAILED);
    expect(eventTransitions().at(-1)).toBe(TRANSACTION_STATUS.FAILED);
  });
});
