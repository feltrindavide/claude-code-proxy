/**
 * Route resolver middleware — resolves model route once per request.
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveRequest } from '../services/route-resolver.js';

export function routeResolverMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path !== '/v1/messages' || req.method !== 'POST') {
    return next();
  }

  const body = (req.body as Record<string, unknown>) || {};
  const result = resolveRequest(body);

  req.resolvedRoute = result;
  req.routeResolution = result.resolution;
  req.resolvedModel = result.modelName;

  next();
}
