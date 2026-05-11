/**
 * RateLimiterService — per-provider Bottleneck rate limiter with persistence
 * Phase: 05-reliability-polish
 * Plan: 05-01
 *
 * Uses Bottleneck.Group keyed by provider name for per-provider rate limiting.
 * Requests exceeding the rate limit are queued (not rejected with 429) per D-60.
 * Rate limits are configurable per provider and persisted to disk via atomic writes.
 * Default rate limit: 60 requests/minute per provider per D-62.
 */
/**
 * RateLimiterService — manages per-provider rate limiting via Bottleneck
 *
 * configureProvider: sets rate limit for a provider, persists to disk
 * schedule: queues request through Bottleneck, auto-configures with DEFAULT_RPM if not set
 * getRateLimit: returns configured or default RPM
 * getAllRateLimits: returns all configured limits as Record<string, number>
 * removeProvider: cleans up limiter and config entry
 * persist/load: atomic write pattern for config persistence
 */
export declare class RateLimiterService {
    private group;
    private config;
    constructor();
    /**
     * Set rate limit for a provider
     * Uses rpm ?? DEFAULT_RPM if not specified
     * Persists config to disk after update
     */
    configureProvider(providerName: string, rpm?: number): void;
    /**
     * Schedule a request through the Bottleneck limiter
     * Auto-configures with DEFAULT_RPM if not already configured
     * Queues requests when rate limit exceeded (does NOT reject with 429)
     */
    schedule<T>(providerName: string, fn: () => Promise<T>): Promise<T>;
    /**
     * Remove provider limiter and config entry
     * Cleans up Bottleneck key and persisted config
     */
    removeProvider(providerName: string): void;
    /**
     * Get rate limit for a provider
     * Returns configured RPM or DEFAULT_RPM if not configured
     */
    getRateLimit(providerName: string): number;
    /**
     * Get all configured rate limits
     * Returns Record<string, number> of provider name → RPM
     */
    getAllRateLimits(): Record<string, number>;
    /**
     * Load persisted config from disk
     * Reads CONFIG_FILE if exists, parses JSON, calls configureProvider for each entry
     * Graceful first-run: returns silently if file doesn't exist
     */
    private load;
    /**
     * Persist config to disk using atomic write pattern
     * Ensures directory exists with secure permissions (0o700)
     * Writes to temp file then renames to final path (atomic on POSIX)
     */
    private persist;
}
export declare const rateLimiterService: RateLimiterService;
//# sourceMappingURL=rateLimiter.d.ts.map