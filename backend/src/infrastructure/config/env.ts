import { config as loadDotenv } from 'dotenv';

loadDotenv();

export type NodeEnv = 'development' | 'test' | 'production';

export interface Env {
  PORT: number;
  NODE_ENV: NodeEnv;
  CORS_ORIGINS: string[];
  FRONTEND_DIR?: string;
  DATABASE_URL: string;
  DATABASE_SSL: boolean;
  REDIS_URL: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  TRANSACTION_MAX_ATTEMPTS: number;
  TRANSACTION_TIMEOUT_MS: number;
  TRANSACTION_BACKOFF_BASE_MS: number;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  MOCK_LATENCY_MS_MIN: number;
  MOCK_LATENCY_MS_MAX: number;
  MOCK_TIMEOUT_RATE: number;
  MOCK_5XX_RATE: number;
  MOCK_429_RATE: number;
  MOCK_4XX_RATE: number;
  STALLED_SWEEP_MS: number;
  STALLED_THRESHOLD_MS: number;
}

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

const isValidUrl = (value: string): boolean => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const errors: string[] = [];

  const requireString = (key: string): string => {
    const value = source[key];
    if (value === undefined || value.trim().length === 0) {
      errors.push(`- ${key}: required`);
      return '';
    }
    return value;
  };

  const numberFromEnv = (key: string, defaultValue: number): number => {
    const raw = source[key];
    if (raw === undefined) {
      return defaultValue;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      errors.push(`- ${key}: expected a number, received "${raw}"`);
      return defaultValue;
    }
    return parsed;
  };

  const rateFromEnv = (key: string, defaultValue: number): number => {
    const parsed = numberFromEnv(key, defaultValue);
    if (parsed < 0 || parsed > 1) {
      errors.push(`- ${key}: must be between 0 and 1, received ${parsed}`);
    }
    return parsed;
  };

  const boolFromEnv = (key: string, defaultValue: boolean): boolean => {
    const raw = source[key];
    if (raw === undefined) {
      return defaultValue;
    }
    const normalized = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
    errors.push(`- ${key}: expected a boolean, received "${raw}"`);
    return defaultValue;
  };

  const nodeEnvRaw = source.NODE_ENV ?? 'development';
  if (!NODE_ENVS.includes(nodeEnvRaw as NodeEnv)) {
    errors.push(
      `- NODE_ENV: must be one of ${NODE_ENVS.join(', ')}, received "${nodeEnvRaw}"`,
    );
  }

  const databaseUrl = requireString('DATABASE_URL');
  if (databaseUrl.length > 0 && !isValidUrl(databaseUrl)) {
    errors.push('- DATABASE_URL: must be a valid connection URL');
  }

  const env: Env = {
    PORT: numberFromEnv('PORT', 3000),
    NODE_ENV: nodeEnvRaw as NodeEnv,
    CORS_ORIGINS: (source.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    FRONTEND_DIR: source.FRONTEND_DIR,
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: boolFromEnv('DATABASE_SSL', true),
    REDIS_URL: requireString('REDIS_URL'),
    OPENAI_API_KEY: requireString('OPENAI_API_KEY'),
    OPENAI_MODEL: source.OPENAI_MODEL ?? 'gpt-4o-mini',
    TRANSACTION_MAX_ATTEMPTS: numberFromEnv('TRANSACTION_MAX_ATTEMPTS', 4),
    TRANSACTION_TIMEOUT_MS: numberFromEnv('TRANSACTION_TIMEOUT_MS', 8000),
    TRANSACTION_BACKOFF_BASE_MS: numberFromEnv('TRANSACTION_BACKOFF_BASE_MS', 500),
    RATE_LIMIT_WINDOW_MS: numberFromEnv('RATE_LIMIT_WINDOW_MS', 60000),
    RATE_LIMIT_MAX: numberFromEnv('RATE_LIMIT_MAX', 60),
    MOCK_LATENCY_MS_MIN: numberFromEnv('MOCK_LATENCY_MS_MIN', 100),
    MOCK_LATENCY_MS_MAX: numberFromEnv('MOCK_LATENCY_MS_MAX', 1200),
    MOCK_TIMEOUT_RATE: rateFromEnv('MOCK_TIMEOUT_RATE', 0.1),
    MOCK_5XX_RATE: rateFromEnv('MOCK_5XX_RATE', 0.15),
    MOCK_429_RATE: rateFromEnv('MOCK_429_RATE', 0.1),
    MOCK_4XX_RATE: rateFromEnv('MOCK_4XX_RATE', 0.05),
    STALLED_SWEEP_MS: numberFromEnv('STALLED_SWEEP_MS', 30000),
    STALLED_THRESHOLD_MS: numberFromEnv('STALLED_THRESHOLD_MS', 60000),
  };

  if (errors.length > 0) {
    throw new Error(
      `Invalid or missing environment variables:\n${errors.join('\n')}`,
    );
  }

  return env;
};
