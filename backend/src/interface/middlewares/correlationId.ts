import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppLogger } from '../../shared/logger';
import { newCorrelationId } from '../../shared/utils/ids';
import { CORRELATION_HEADER } from '../../shared/constants/config';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      logger: AppLogger;
    }
  }
}

export const createCorrelationIdMiddleware = (
  baseLogger: AppLogger,
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const headerValue = req.header(CORRELATION_HEADER);
    const correlationId = headerValue && headerValue.length
      ? headerValue
      : newCorrelationId();
    req.correlationId = correlationId;
    req.logger = baseLogger.child({ correlationId });
    res.setHeader(CORRELATION_HEADER, correlationId);
    next();
  };
};
