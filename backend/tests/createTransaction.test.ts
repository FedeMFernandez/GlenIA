import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CreateTransactionUseCase,
  CreateTransactionInput,
} from '../src/application/use-cases/transaction/CreateTransactionUseCase';
import { CreateTransactionInput as RepoCreateInput } from '../src/domain/ports/TransactionRepository';
import { ValidationError } from '../src/domain/errors/DomainError';
import { TRANSACTION_TYPE } from '../src/domain/constants/transactionType';
import {
  makeEnv,
  makeLogger,
  makeTransaction,
  makeTransactionRepository,
  makeOrchestrator,
} from './support/factories';

const makeInput = (
  overrides: Partial<CreateTransactionInput> = {},
): CreateTransactionInput => ({
  args: { type: TRANSACTION_TYPE.TRANSFER, amount: 100, currency: 'usd' },
  conversationId: 'conv-1',
  correlationId: 'corr-1',
  ...overrides,
});

describe('CreateTransactionUseCase', () => {
  let repository: ReturnType<typeof makeTransactionRepository>;
  let orchestrator: ReturnType<typeof makeOrchestrator>;
  let useCase: CreateTransactionUseCase;

  beforeEach(() => {
    repository = makeTransactionRepository();
    orchestrator = makeOrchestrator();
    useCase = new CreateTransactionUseCase(
      repository,
      orchestrator,
      makeEnv(),
      makeLogger(),
    );
  });

  it('rejects invalid arguments with a ValidationError before touching the repository', async () => {
    await expect(
      useCase.execute(makeInput({ args: { type: 'transfer', amount: -5 } })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(vi.mocked(repository.createIfAbsent)).not.toHaveBeenCalled();
    expect(vi.mocked(orchestrator.enqueue)).not.toHaveBeenCalled();
  });

  it('creates and enqueues on first call', async () => {
    const transaction = makeTransaction();
    vi.mocked(repository.createIfAbsent).mockResolvedValue({
      transaction,
      created: true,
    });

    const output = await useCase.execute(makeInput());

    expect(output.created).toBe(true);
    expect(output.transaction).toBe(transaction);
    expect(vi.mocked(repository.createIfAbsent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(orchestrator.enqueue)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(orchestrator.enqueue)).toHaveBeenCalledWith({
      transactionId: transaction.id,
      correlationId: 'corr-1',
    });
  });

  it('normalizes payload and derives a stable idempotency key from type, conversation and payload', async () => {
    const transaction = makeTransaction();
    vi.mocked(repository.createIfAbsent).mockResolvedValue({
      transaction,
      created: true,
    });

    await useCase.execute(makeInput());
    await useCase.execute(makeInput());

    const firstArgs = vi.mocked(repository.createIfAbsent).mock
      .calls[0][0] as RepoCreateInput;
    const secondArgs = vi.mocked(repository.createIfAbsent).mock
      .calls[1][0] as RepoCreateInput;

    expect(firstArgs.idempotencyKey).toBe(secondArgs.idempotencyKey);
    expect(firstArgs.idempotencyKey).toMatch(/^op_[0-9a-f]{32}$/);
    expect(firstArgs.requestPayload).toEqual({
      amount: 100,
      currency: 'USD',
      reference: null,
      destination: null,
    });
    expect(firstArgs.type).toBe(TRANSACTION_TYPE.TRANSFER);
    expect(firstArgs.maxAttempts).toBe(4);
  });

  it('returns the existing transaction without enqueuing again on an idempotent replay', async () => {
    const transaction = makeTransaction();
    vi.mocked(repository.createIfAbsent)
      .mockResolvedValueOnce({ transaction, created: true })
      .mockResolvedValueOnce({ transaction, created: false });

    const first = await useCase.execute(makeInput());
    const second = await useCase.execute(makeInput());

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.transaction).toBe(transaction);
    expect(vi.mocked(repository.createIfAbsent)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(orchestrator.enqueue)).toHaveBeenCalledTimes(1);
  });

  it('honors an explicit idempotency key over the derived one', async () => {
    const transaction = makeTransaction();
    vi.mocked(repository.createIfAbsent).mockResolvedValue({
      transaction,
      created: true,
    });

    await useCase.execute(makeInput({ idempotencyKey: 'explicit-key' }));

    const args = vi.mocked(repository.createIfAbsent).mock
      .calls[0][0] as RepoCreateInput;
    expect(args.idempotencyKey).toBe('explicit-key');
  });

  it('derives different keys for different conversations', async () => {
    const transaction = makeTransaction();
    vi.mocked(repository.createIfAbsent).mockResolvedValue({
      transaction,
      created: true,
    });

    await useCase.execute(makeInput({ conversationId: 'conv-a' }));
    await useCase.execute(makeInput({ conversationId: 'conv-b' }));

    const keyA = (
      vi.mocked(repository.createIfAbsent).mock.calls[0][0] as RepoCreateInput
    ).idempotencyKey;
    const keyB = (
      vi.mocked(repository.createIfAbsent).mock.calls[1][0] as RepoCreateInput
    ).idempotencyKey;
    expect(keyA).not.toBe(keyB);
  });
});
