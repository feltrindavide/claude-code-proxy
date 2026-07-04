import 'express-serve-static-core';
import type { ResolveRequestResult, RouteResolution } from '../types/index.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    resolvedRoute?: ResolveRequestResult;
    routeResolution?: RouteResolution | null;
    resolvedModel?: string;
    hadUpstreamError?: boolean;
  }
}
