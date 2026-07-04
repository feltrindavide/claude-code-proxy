/**
 * Hot-reload runtime config from disk without full process restart.
 */

import { configService } from './config.js';
import { providerService } from './provider.js';
import { contextRegistry } from './context-registry.js';
import { responseCache } from './response-cache.js';
import { prewarmAdaptersForProviders } from '../adapters/index.js';
import { writeModelEnvFile } from './modelEnv.js';
import { eventBus } from './event-bus.js';
import { logger } from '../lib/logger.js';
import { rateLimiterService } from './rateLimiter.js';
import { providerValidatorService } from './provider-validator.js';
import { validationStoreService } from './validationStore.js';

export function reloadRuntimeConfig(): void {
  configService.invalidateCache();
  const config = configService.load();

  responseCache.reconfigure(config.responseCache ?? {});
  providerService.reload(config.providers, config.routes);

  for (const provider of config.providers) {
    rateLimiterService.configureProvider(provider.name);
  }

  writeModelEnvFile();
  prewarmAdaptersForProviders(config.providers);
  contextRegistry.syncFromConfig(config.providers);

  void (async () => {
    const results = await providerValidatorService.validateAllProviders();
    const stamped = new Map<string, { valid: boolean; error?: string; timestamp: string }>();
    for (const [name, result] of results) {
      stamped.set(name, { ...result, timestamp: new Date().toISOString() });
    }
    validationStoreService.setResults(stamped);
  })().catch((err) => {
    logger.warn({ err }, 'Provider validation failed during hot reload');
  });

  eventBus.emit('config.reloaded', { timestamp: new Date().toISOString() });
  eventBus.emit('config.invalidate', {});
  logger.info(
    { providers: config.providers.length, routes: config.routes.length },
    'Runtime config reloaded',
  );
}
