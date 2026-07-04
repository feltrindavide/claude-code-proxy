/**
 * Watch config.json for changes and hot-reload without restart.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { reloadRuntimeConfig } from './runtime-config.js';
import { logger } from '../lib/logger.js';

const CONFIG_FILE = path.join(os.homedir(), '.claude', 'claude-code-proxy', 'config.json');

let watcher: fs.FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function startConfigWatcher(): void {
  if (watcher) return;

  const configDir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }

  try {
    watcher = fs.watch(CONFIG_FILE, { persistent: false }, (eventType) => {
      if (eventType !== 'change' && eventType !== 'rename') return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!fs.existsSync(CONFIG_FILE)) return;
        try {
          reloadRuntimeConfig();
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'Config hot-reload failed',
          );
        }
      }, 500);
    });

    logger.info({ path: CONFIG_FILE }, 'Config file watcher started');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Could not watch config file',
    );
  }
}

export function stopConfigWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
