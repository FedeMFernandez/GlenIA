import { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../domain/errors/DomainError';

export type ValidationTarget = 'body' | 'query' | 'params';

export const validate = (
  schema: z.ZodTypeAny,
  target: ValidationTarget = 'body',
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[target]);
    if (!parsed.success) {
      next(
        new ValidationError('Request validation failed', {
          target,
          issues: parsed.error.issues,
        }),
      );
      return;
    }
    if (target === 'body') {
      req.body = parsed.data;
    } else {
      Object.assign(req[target] as Record<string, unknown>, parsed.data);
    }
    next();
  };
};
