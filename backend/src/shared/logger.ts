import pino, { Logger } from 'pino';

export type AppLogger = Logger;

export const createLogger = (level: string, pretty: boolean): AppLogger => {
  if (pretty) {
    return pino({
      level,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    });
  }
  return pino({ level });
};

export const childLogger = (
  logger: AppLogger,
  bindings: Record<string, unknown>,
): AppLogger => logger.child(bindings);
