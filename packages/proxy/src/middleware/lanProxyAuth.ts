/**
 * Optional proxy token for non-localhost binds (ALLOW_LAN_BIND=true).
 * Set PROXY_API_TOKEN env var to require Authorization: Bearer <token> on /v1/messages.
 */

import type { Request, Response, NextFunction } from 'express';
import { configService } from '../services/config.js';
import { resolveBindHost, isLocalhostHost } from '../services/network.js';

export function lanProxyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path !== '/v1/messages' || req.method !== 'POST') {
    return next();
  }

  const cfg = configService.load();
  const bindHost = resolveBindHost(cfg.host);
  const isLocalOnly = isLocalhostHost(bindHost);

  if (isLocalOnly) {
    return next();
  }

  const requiredToken = process.env.PROXY_API_TOKEN;
  if (!requiredToken) {
    res.status(503).json({
      type: 'error',
      error: {
        type: 'configuration_error',
        message: 'LAN bind is enabled but PROXY_API_TOKEN is not configured',
      },
    });
    return;
  }

  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token !== requiredToken) {
    res.status(401).json({
      type: 'error',
      error: { type: 'authentication_error', message: 'Invalid or missing proxy API token' },
    });
    return;
  }

  next();
}
