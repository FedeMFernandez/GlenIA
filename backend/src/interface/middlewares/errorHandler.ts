import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { isDomainError } from '../../domain/errors/DomainError';
import { AppLogger } from '../../shared/logger';

export const createErrorHandler = (
  baseLogger: AppLogger,
  isProduction: boolean,
): ErrorRequestHandler => {
  return (
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    const logger: AppLogger = req.logger ?? baseLogger;

    if (isDomainError(error)) {
      logger.warn(
        { code: error.code, statusCode: error.statusCode },
        error.message,
      );
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details && !isProduction
            ? { details: error.details }
            : {}),
        },
      });
      return;
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    logger.error(
      { err: error, stack: error instanceof Error ? error.stack : undefined },
      'Unhandled error',
    );
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'Internal server error' : message,
      },
    });
  };
};
