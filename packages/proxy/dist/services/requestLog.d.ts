/**
 * RequestLogService — JSON file ring buffer for request logging
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 *
 * Persists the last 50 request log entries at ~/.claude-code-proxy/request-log.json
 * Uses atomic write pattern (temp file + renameSync) matching ConfigService
 */
import type { RequestLogEntry } from '../types/index.js';
/**
 * RequestLogService — manages request log persistence with ring buffer
 *
 * load: reads existing entries from disk on startup
 * addEntry: appends entry, drops oldest when exceeding MAX_ENTRIES, persists
 * getAll: returns a copy of all entries
 * enrichLastEntry: merges data into the most recent entry (for post-route-resolution data)
 * persist: atomic write via temp file + renameSync
 */
export declare class RequestLogService {
    private entries;
    private logFile;
    constructor(logFile?: string);
    /**
     * Load existing log entries from disk
     * Returns empty array if file doesn't exist (graceful first-run)
     */
    load(): RequestLogEntry[];
    /**
     * Add a new log entry and persist to disk
     * Ring buffer: drops oldest entries when exceeding MAX_ENTRIES
     */
    addEntry(entry: RequestLogEntry): void;
    /**
     * Return a copy of all log entries (not a reference)
     */
    getAll(): RequestLogEntry[];
    /**
     * Enrich the most recent log entry with additional data
     * Used by proxy handler to add claudeTier/providerName/targetModel after route resolution
     */
    enrichLastEntry(update: Partial<RequestLogEntry>): void;
    /**
     * Truncate a request/response body to BODY_TRUNCATE_LIMIT chars
     * Returns JSON-stringified body, truncated with '...' suffix if over limit
     */
    truncateBody(body: unknown): string;
    /**
     * Persist entries to disk using atomic write pattern
     * Ensures directory exists, writes to temp file, renames to final path
     */
    private persist;
}
export declare const requestLogService: RequestLogService;
//# sourceMappingURL=requestLog.d.ts.map