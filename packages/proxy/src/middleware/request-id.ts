/**
 * Request ID middleware — propagates X-Request-Id for log correlation.
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const HEADER = 'x-request-id';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[HEADER];
  const requestId =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
