/**
 * KeychainService — secure API key storage via macOS Keychain
 * Phase: 01-core-proxy-server
 * Plan: 01-02, Task 2
 *
 * Per D-08: API keys stored in macOS Keychain via keytar
 * Per D-09: Keys never appear in config files or logs
 */
/**
 * Custom error for Keychain operations
 */
export declare class ProxyKeychainError extends Error {
    constructor(message: string);
}
/**
 * KeychainService — wraps keytar for secure API key storage
 */
export declare class KeychainService {
    /**
     * Store API key in macOS Keychain
     * Provider name serves as the account name
     */
    setKey(providerName: string, apiKey: string): Promise<void>;
    /**
     * Retrieve API key from macOS Keychain
     * Returns null if not found
     */
    getKey(providerName: string): Promise<string | null>;
    /**
     * Delete API key from macOS Keychain
     * Returns true if deleted, false if not found
     */
    deleteKey(providerName: string): Promise<boolean>;
    /**
     * Check if API key exists in Keychain
     */
    hasKey(providerName: string): Promise<boolean>;
    /**
     * Mask API key for display (AUTH-03 requirement)
     * Returns format: first 4 chars + ... + last 4 chars
     * Examples:
     *   - 'sk-ant-api-key-12345' → 'sk-an...2345'
     *   - 'short' → '****'
     */
    maskKey(apiKey: string): string;
}
export declare const keychainService: KeychainService;
//# sourceMappingURL=keychain.d.ts.map