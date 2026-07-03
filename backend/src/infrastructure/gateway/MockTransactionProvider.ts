import { z } from 'zod';
import { Env } from '../config/env';
import { AppLogger } from '../../shared/logger';
import {
  TransactionProvider,
  ProviderExecuteInput,
  ProviderResult,
} from '../../domain/ports/TransactionProvider';
import {
  ProviderPermanentError,
  ProviderTransientError,
  RateLimitError,
  TimeoutError,
} from '../../domain/errors/DomainError';

const PROVIDER_STEPS = ['validate', 'reserve', 'commit'] as const;

const providerResponseSchema = z.object({
  reference: z.string().min(1),
  steps: z.array(z.string()).min(1),
  finalStep: z.string().min(1),
  amount: z.number().optional(),
  currency: z.string().optional(),
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class MockTransactionProvider implements TransactionProvider {
  constructor(
    private readonly env: Env,
    private readonly logger: AppLogger,
    private readonly random: () => number = Math.random,
  ) {}

  public async execute(input: ProviderExecuteInput): Promise<ProviderResult> {
    const log = this.logger.child({
      transactionId: input.transactionId,
      correlationId: input.correlationId,
      provider: 'mock',
    });

    await this.simulateLatency();

    if (this.random() < this.env.MOCK_TIMEOUT_RATE) {
      await sleep(this.env.TRANSACTION_TIMEOUT_MS + 1000);
      throw new TimeoutError('Provider did not respond in time', {
        failedStep: PROVIDER_STEPS[0],
      });
    }

    const completedSteps: string[] = [];
    for (const step of PROVIDER_STEPS) {
      this.maybeFailAtStep(step, completedSteps, log);
      completedSteps.push(step);
    }

    const response = {
      reference: `PRV-${input.transactionId.slice(0, 8).toUpperCase()}`,
      steps: completedSteps,
      finalStep: completedSteps[completedSteps.length - 1],
      amount:
        typeof input.payload.amount === 'number'
          ? input.payload.amount
          : undefined,
      currency:
        typeof input.payload.currency === 'string'
          ? input.payload.currency
          : undefined,
    };

    const parsed = providerResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ProviderPermanentError(
        'Provider returned an unexpected response shape',
        422,
        { issues: parsed.error.issues },
      );
    }
    return parsed.data;
  }

  private maybeFailAtStep(
    step: string,
    completedSteps: string[],
    log: AppLogger,
  ): void {
    const roll = this.random();
    if (roll < this.env.MOCK_429_RATE) {
      log.warn({ step }, 'Provider rate limited');
      throw new RateLimitError('Provider rate limit exceeded', {
        failedStep: step,
        completedSteps,
      });
    }
    if (roll < this.env.MOCK_429_RATE + this.env.MOCK_5XX_RATE) {
      log.warn({ step }, 'Provider transient failure');
      throw new ProviderTransientError('Provider temporarily unavailable', 503, {
        failedStep: step,
        completedSteps,
      });
    }
    if (
      roll <
      this.env.MOCK_429_RATE + this.env.MOCK_5XX_RATE + this.env.MOCK_4XX_RATE
    ) {
      log.warn({ step }, 'Provider rejected the request');
      throw new ProviderPermanentError('Provider rejected the transaction', 422, {
        failedStep: step,
        completedSteps,
      });
    }
  }

  private async simulateLatency(): Promise<void> {
    const min = this.env.MOCK_LATENCY_MS_MIN;
    const max = Math.max(min, this.env.MOCK_LATENCY_MS_MAX);
    const latency = Math.floor(min + this.random() * (max - min));
    await sleep(latency);
  }
}
