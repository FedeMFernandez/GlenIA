import path from 'node:path';
import express, { Application, Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import { Context } from '../../shared/context';
import { CONTEXT_KEYS, CORRELATION_HEADER } from '../../shared/constants/config';
import { Env } from '../config/env';
import { AppLogger } from '../../shared/logger';
import { buildRouter } from '../../interface/routes';
import { createCorrelationIdMiddleware } from '../../interface/middlewares/correlationId';
import { createRateLimitMiddleware } from '../../interface/middlewares/rateLimit';
import { createErrorHandler } from '../../interface/middlewares/errorHandler';

const buildCorsOptions = (env: Env): CorsOptions => {
  const allowedOrigins = env.CORS_ORIGINS;

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', CORRELATION_HEADER],
    exposedHeaders: [CORRELATION_HEADER],
    credentials: false,
    maxAge: 86400,
  };
};

export const buildApp = (context: Context): Application => {
  const env = context.resolve<Env>(CONTEXT_KEYS.CONFIG);
  const logger = context.resolve<AppLogger>(CONTEXT_KEYS.LOGGER);

  const app = express();
  app.disable('x-powered-by');
  app.use(cors(buildCorsOptions(env)));
  app.use(express.json({ limit: '1mb' }));
  app.use(createCorrelationIdMiddleware(logger));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/v1', createRateLimitMiddleware(env), buildRouter(context));

  const publicDir = env.FRONTEND_DIR
    ? path.resolve(env.FRONTEND_DIR)
    : path.resolve(__dirname, '..', '..', '..', '..', 'frontend');
  app.use(express.static(publicDir));

  app.use(createErrorHandler(logger, env.NODE_ENV === 'production'));

  return app;
};
