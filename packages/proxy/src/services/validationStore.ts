/**
 * ValidationStore — persisted validation results store for startup validation UI
 * Phase: 05-reliability-polish
 * Plan: 05-02
 *
 * Per D-70: Warning badges shown on failed providers in Providers page
 * Per D-71: Provider Health card on Status page showing "X of Y providers healthy"
 * Per D-72: Validation warnings persist until user fixes config or dismisses
 *
 * Threat mitigations:
 * - T-05-06: Atomic writes (temp + renameSync) with 0o600 permissions prevent partial writes
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import os from 'os';
import type { ValidationResult } from '../adapters/interface.js';

const VALIDATION_DIR = join(os.homedir(), '.claude-code-proxy');
const VALIDATION_FILE = join(VALIDATION_DIR, 'validation-results.json');

/**
 * ValidationStoreService — persists provider validation results to disk
 *
 * - setResults: replaces all results and persists
 * - updateResult: updates single provider result with current timestamp
 * - getResults: returns all results as plain object
 * - dismissWarning: sets dismissed flag on provider's result
 * - load/persist: atomic write pattern (temp file + renameSync)
 */
export class ValidationStoreService {
  private results: Map<string, ValidationResult & { timestamp: string; dismissed?: boolean }> = new Map();
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || VALIDATION_FILE;
    this.load();
  }

  /**
   * Replace all results and persist to disk
   */
  setResults(results: Map<string, ValidationResult & { timestamp: string }>): void {
    this.results = results as Map<string, ValidationResult & { timestamp: string; dismissed?: boolean }>;
    this.persist();
  }

  /**
   * Update a single provider's result with current timestamp and persist
   */
  updateResult(providerName: string, result: ValidationResult): void {
    this.results.set(providerName, {
      ...result,
      timestamp: new Date().toISOString(),
    });
    this.persist();
  }

  /**
   * Return all results as a plain object
   */
  getResults(): Record<string, ValidationResult & { timestamp: string; dismissed?: boolean }> {
    return Object.fromEntries(this.results);
  }

  /**
   * Set dismissed flag on a provider's warning and persist
   */
  dismissWarning(providerName: string): void {
    const existing = this.results.get(providerName);
    if (existing) {
      this.results.set(providerName, { ...existing, dismissed: true });
      this.persist();
    }
  }

  /**
   * Load results from disk
   * Returns silently if file doesn't exist (graceful first-run)
   */
  private load(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const content = readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      this.results = new Map(Object.entries(data));
    } catch (error) {
      console.error('[ValidationStore] Error loading:', error);
    }
  }

  /**
   * Persist results to disk using atomic write pattern
   * Ensures directory exists with secure permissions, writes to temp file, renames
   */
  private persist(): void {
    const dir = VALIDATION_DIR;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const tmp = `${this.filePath}.tmp`;
    const content = JSON.stringify(Object.fromEntries(this.results), null, 2);
    writeFileSync(tmp, content, { mode: 0o600 });
    renameSync(tmp, this.filePath);
  }
}

// Singleton instance
export const validationStoreService = new ValidationStoreService();
