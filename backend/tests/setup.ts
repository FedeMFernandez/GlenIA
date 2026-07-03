process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/postgres';
process.env.DATABASE_SSL = process.env.DATABASE_SSL ?? 'false';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'openai-key';
