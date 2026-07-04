/**
 * Admin API authentication middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { validateAdminToken } from '../services/admin-auth.js';

export function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (validateAdminToken(req)) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized — invalid or missing admin token' });
}
