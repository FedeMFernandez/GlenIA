import IORedis, { Redis } from 'ioredis';
import { Env } from '../config/env';

export type RedisConnection = Redis;

export const createRedisConnection = (env: Env): RedisConnection =>
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
