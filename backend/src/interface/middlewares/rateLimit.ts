import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Env } from '../../infrastructure/config/env';

export const createRateLimitMiddleware = (
  env: Env,
): RateLimitRequestHandler =>
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT',
        message: 'Too many requests, please slow down.',
      },
    },
  });
