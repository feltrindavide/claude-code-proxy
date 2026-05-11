/**
 * ConfigService — JSON persistence for proxy configuration
 * Phase: 01-core-proxy-server
 * Plan: 01-02, Task 1
 *
 * Stores config at ~/.claude-code-proxy/config.json
 * Per D-13: Config stores keyId (Keychain account name), never the actual key
 */
import { z } from 'zod';
export declare const proxyConfigSchema: z.ZodObject<{
    providers: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        baseUrl: z.ZodEffects<z.ZodString, string, string>;
        keyId: z.ZodString;
        models: z.ZodArray<z.ZodString, "many">;
        enabled: z.ZodBoolean;
        priority: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        models: string[];
        enabled: boolean;
        name: string;
        baseUrl: string;
        keyId: string;
        priority: number;
    }, {
        models: string[];
        enabled: boolean;
        name: string;
        baseUrl: string;
        keyId: string;
        priority: number;
    }>, "many">;
    routes: z.ZodArray<z.ZodObject<{
        claudeTier: z.ZodEnum<["opus", "sonnet", "haiku"]>;
        providerName: z.ZodString;
        targetModel: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        targetModel: string;
        claudeTier: "opus" | "sonnet" | "haiku";
        providerName: string;
    }, {
        targetModel: string;
        claudeTier: "opus" | "sonnet" | "haiku";
        providerName: string;
    }>, "many">;
    subagentModel: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    providers: {
        models: string[];
        enabled: boolean;
        name: string;
        baseUrl: string;
        keyId: string;
        priority: number;
    }[];
    routes: {
        targetModel: string;
        claudeTier: "opus" | "sonnet" | "haiku";
        providerName: string;
    }[];
    subagentModel?: string | undefined;
}, {
    providers: {
        models: string[];
        enabled: boolean;
        name: string;
        baseUrl: string;
        keyId: string;
        priority: number;
    }[];
    routes: {
        targetModel: string;
        claudeTier: "opus" | "sonnet" | "haiku";
        providerName: string;
    }[];
    subagentModel?: string | undefined;
}>;
export type AppConfig = z.infer<typeof proxyConfigSchema>;
/**
 * ConfigService — manages proxy configuration persistence
 *
 * Load: reads from ~/.claude-code-proxy/config.json
 * Save: atomic write with temp file + rename
 */
export declare class ConfigService {
    private configPath;
    private configDir;
    constructor(configPath?: string);
    /**
     * Load configuration from disk
     * Returns defaults if file doesn't exist (graceful first-run)
     */
    load(): AppConfig;
    /**
     * Save configuration to disk
     * Uses atomic write pattern: temp file + rename
     */
    save(config: AppConfig): void;
    /**
     * Get default configuration per D-07
     */
    getDefaults(): AppConfig;
    /**
     * Validate a provider config (for admin API input validation)
     */
    validateProvider(provider: unknown): {
        valid: boolean;
        error?: string;
    };
    /**
     * Validate route config (for admin API input validation)
     */
    validateRoute(route: unknown): {
        valid: boolean;
        error?: string;
    };
    /**
     * Export current config with all provider keyId values masked (D-50)
     * Returns { providers, routes, settings } — never exposes actual API keys
     */
    exportConfig(): {
        providers: unknown[];
        routes: unknown[];
        settings: {
            port: number;
        };
    };
    /**
     * Import config data with strict zod validation (D-52)
     * Strategy 'merge': combines providers (dedup by name, incoming wins), replaces routes
     * Strategy 'replace': returns validated data directly
     */
    importConfig(data: unknown, strategy: 'merge' | 'replace'): AppConfig;
    /**
     * Create a timestamped backup of the current config (D-53)
     * Returns the backup file path
     */
    createBackup(): string;
}
export declare const configService: ConfigService;
//# sourceMappingURL=config.d.ts.map