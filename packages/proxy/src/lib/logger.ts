/**
 * Structured logging with Pino.
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }
    : {}),
});

export function createRequestLogger(
  requestId: string,
  fields?: Record<string, unknown>,
): pino.Logger {
  return logger.child({ reqId: requestId, ...fields });
}
