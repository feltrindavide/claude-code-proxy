/**
 * Registry for the local discovery service (set at startup).
 */

import type { LocalDiscoveryService } from './local-discovery.js';

let discoveryService: LocalDiscoveryService | null = null;

export function setDiscoveryService(service: LocalDiscoveryService): void {
  discoveryService = service;
}

export function getDiscoveryService(): LocalDiscoveryService | null {
  return discoveryService;
}
