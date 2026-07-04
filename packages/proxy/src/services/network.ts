/**
 * Network bind policy — localhost-only by default.
 */

import { logger } from '../lib/logger.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3456;

const LOCALHOST_ALIASES = new Set(['127.0.0.1', 'localhost', '::1']);

export function isAllInterfacesHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === '0.0.0.0' || h === '::' || h === '[::]';
}

export function isLocalhostHost(host: string): boolean {
  return LOCALHOST_ALIASES.has(host.trim().toLowerCase());
}

/** Normalize and enforce bind policy. Rejects 0.0.0.0 unless ALLOW_LAN_BIND=true. */
export function resolveBindHost(requested?: string): string {
  const host = (requested || DEFAULT_HOST).trim().toLowerCase();

  if (isAllInterfacesHost(host)) {
    if (process.env.ALLOW_LAN_BIND !== 'true') {
      logger.warn({ requested: host }, 'Refusing to bind on all interfaces; using 127.0.0.1');
      return DEFAULT_HOST;
    }
    return host;
  }

  if (host === 'localhost') return DEFAULT_HOST;

  if (!isLocalhostHost(host) && process.env.ALLOW_LAN_BIND !== 'true') {
    logger.warn({ requested: host }, 'Non-localhost bind blocked; using 127.0.0.1');
    return DEFAULT_HOST;
  }

  return host;
}

export function resolvePort(requested?: number): number {
  if (requested === undefined || Number.isNaN(requested)) return DEFAULT_PORT;
  if (requested < 1 || requested > 65535) return DEFAULT_PORT;
  return requested;
}

export { DEFAULT_HOST, DEFAULT_PORT };
