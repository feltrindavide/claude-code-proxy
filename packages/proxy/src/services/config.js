"use strict";
/**
 * ConfigService — JSON persistence for proxy configuration
 * Phase: 01-core-proxy-server
 * Plan: 01-02, Task 1
 *
 * Stores config at ~/.claude-code-proxy/config.json
 * Per D-13: Config stores keyId (Keychain account name), never the actual key
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configService = exports.ConfigService = exports.proxyConfigSchema = void 0;
var fs_1 = require("fs");
var path_1 = require("path");
var os_1 = require("os");
var zod_1 = require("zod");
// Config directory and file paths
var CONFIG_DIR = (0, path_1.join)(os_1.default.homedir(), '.claude-code-proxy');
var CONFIG_FILE = (0, path_1.join)(CONFIG_DIR, 'config.json');
// Zod validation schemas (per RESEARCH security domain — V5 Input Validation)
// Provider name: alphanumeric, dash, underscore only
var providerNameSchema = zod_1.z.string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Provider name must be alphanumeric with dashes/underscores');
// URL schema: https required, localhost allowed
var urlSchema = zod_1.z.string()
    .url()
    .refine(function (url) { return url.startsWith('https://') || url.includes('localhost') || url.includes('127.0.0.1'); }, 'URL must be HTTPS or localhost');
// Model name schema: no injection chars
var modelNameSchema = zod_1.z.string()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9/:._-]+$/, 'Invalid model name characters');
// LLMProvider schema (per D-14: keyId stored, not actual key)
var llmProviderSchema = zod_1.z.object({
    name: providerNameSchema,
    baseUrl: urlSchema,
    keyId: providerNameSchema, // Keychain account name (D-14)
    models: zod_1.z.array(modelNameSchema),
    enabled: zod_1.z.boolean(),
    priority: zod_1.z.number().int().min(0).max(100),
});
// ModelRoute schema
var modelRouteSchema = zod_1.z.object({
    claudeTier: zod_1.z.enum(['opus', 'sonnet', 'haiku']),
    providerName: providerNameSchema,
    targetModel: modelNameSchema,
});
// ProxyConfig schema
exports.proxyConfigSchema = zod_1.z.object({
    providers: zod_1.z.array(llmProviderSchema),
    routes: zod_1.z.array(modelRouteSchema),
    subagentModel: zod_1.z.string().optional(),
});
/**
 * ConfigService — manages proxy configuration persistence
 *
 * Load: reads from ~/.claude-code-proxy/config.json
 * Save: atomic write with temp file + rename
 */
var ConfigService = /** @class */ (function () {
    function ConfigService(configPath) {
        this.configDir = CONFIG_DIR;
        this.configPath = configPath || CONFIG_FILE;
    }
    /**
     * Load configuration from disk
     * Returns defaults if file doesn't exist (graceful first-run)
     */
    ConfigService.prototype.load = function () {
        try {
            if (!(0, fs_1.existsSync)(this.configPath)) {
                return this.getDefaults();
            }
            var content = (0, fs_1.readFileSync)(this.configPath, 'utf-8');
            var parsed = JSON.parse(content);
            // Validate with zod
            var result = exports.proxyConfigSchema.safeParse(parsed);
            if (!result.success) {
                console.error('[Config] Invalid config, using defaults:', result.error);
                return this.getDefaults();
            }
            return result.data;
        }
        catch (error) {
            console.error('[Config] Error loading config:', error);
            return this.getDefaults();
        }
    };
    /**
     * Save configuration to disk
     * Uses atomic write pattern: temp file + rename
     */
    ConfigService.prototype.save = function (config) {
        // Validate before saving
        var result = exports.proxyConfigSchema.safeParse(config);
        if (!result.success) {
            throw new Error("Invalid config: ".concat(result.error));
        }
        // Ensure directory exists
        if (!(0, fs_1.existsSync)(this.configDir)) {
            (0, fs_1.mkdirSync)(this.configDir, { recursive: true, mode: 448 });
        }
        // Atomic write: temp file + rename
        var tempPath = "".concat(this.configPath, ".tmp");
        var content = JSON.stringify(config, null, 2);
        (0, fs_1.writeFileSync)(tempPath, content, { mode: 384 });
        // Rename to final location (atomic on POSIX)
        (0, fs_1.renameSync)(tempPath, this.configPath);
    };
    /**
     * Get default configuration per D-07
     */
    ConfigService.prototype.getDefaults = function () {
        return {
            providers: [],
            routes: [
                { claudeTier: 'opus', providerName: 'opencode', targetModel: 'qwen3.6' },
                { claudeTier: 'sonnet', providerName: 'openrouter', targetModel: 'mimo-v2-flash' },
                { claudeTier: 'haiku', providerName: 'opencode', targetModel: 'nvidia/nemotron-3-super-120b-a12b:free' },
            ],
        };
    };
    /**
     * Validate a provider config (for admin API input validation)
     */
    ConfigService.prototype.validateProvider = function (provider) {
        var result = llmProviderSchema.safeParse(provider);
        if (!result.success) {
            return { valid: false, error: result.error.errors.map(function (e) { return e.message; }).join(', ') };
        }
        return { valid: true };
    };
    /**
     * Validate route config (for admin API input validation)
     */
    ConfigService.prototype.validateRoute = function (route) {
        var result = modelRouteSchema.safeParse(route);
        if (!result.success) {
            return { valid: false, error: result.error.errors.map(function (e) { return e.message; }).join(', ') };
        }
        return { valid: true };
    };
    /**
     * Export current config with all provider keyId values masked (D-50)
     * Returns { providers, routes, settings } — never exposes actual API keys
     */
    ConfigService.prototype.exportConfig = function () {
        var config = this.load();
        return {
            providers: config.providers.map(function (p) { return (__assign(__assign({}, p), { keyId: '••••' })); }),
            routes: config.routes,
            settings: { port: 3456 },
        };
    };
    /**
     * Import config data with strict zod validation (D-52)
     * Strategy 'merge': combines providers (dedup by name, incoming wins), replaces routes
     * Strategy 'replace': returns validated data directly
     */
    ConfigService.prototype.importConfig = function (data, strategy) {
        var result = exports.proxyConfigSchema.safeParse(data);
        if (!result.success) {
            throw new Error("Invalid config: ".concat(result.error.errors.map(function (e) { return "".concat(e.path.join('.'), ": ").concat(e.message); }).join('; ')));
        }
        if (strategy === 'replace') {
            return result.data;
        }
        // Merge strategy: combine providers (dedup by name, incoming wins), replace routes
        var current = this.load();
        var providerMap = new Map();
        // Add current providers first
        for (var _i = 0, _a = current.providers; _i < _a.length; _i++) {
            var p = _a[_i];
            providerMap.set(p.name, p);
        }
        // Incoming providers overwrite existing ones with same name
        for (var _b = 0, _c = result.data.providers; _b < _c.length; _b++) {
            var p = _c[_b];
            providerMap.set(p.name, p);
        }
        return {
            providers: Array.from(providerMap.values()),
            routes: result.data.routes,
        };
    };
    /**
     * Create a timestamped backup of the current config (D-53)
     * Returns the backup file path
     */
    ConfigService.prototype.createBackup = function () {
        var config = this.load();
        var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        var backupPath = (0, path_1.join)(this.configDir, "config-backup-".concat(timestamp, ".json"));
        // Ensure directory exists
        if (!(0, fs_1.existsSync)(this.configDir)) {
            (0, fs_1.mkdirSync)(this.configDir, { recursive: true, mode: 448 });
        }
        (0, fs_1.writeFileSync)(backupPath, JSON.stringify(config, null, 2), { mode: 384 });
        return backupPath;
    };
    return ConfigService;
}());
exports.ConfigService = ConfigService;
// Singleton instance
exports.configService = new ConfigService();
