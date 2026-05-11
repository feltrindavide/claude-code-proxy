/**
 * TypeScript type definitions for the Claude Code Proxy
 * Phase: 01-core-proxy-server
 * Plan: 01-01
 */
export type ClaudeTier = 'opus' | 'sonnet' | 'haiku';
export interface LLMProvider {
    name: string;
    baseUrl: string;
    keyId: string;
    providerType?: string;
    models: string[];
    enabled: boolean;
    priority: number;
}
export interface AdapterConfig {
    providerType: string;
    timeouts?: {
        streaming?: number;
        nonStreaming?: number;
    };
}
export interface ModelRoute {
    claudeTier: ClaudeTier;
    providerName: string;
    targetModel: string;
}
export interface ProxyConfig {
    port: number;
    host: string;
    providers: LLMProvider[];
    routes: ModelRoute[];
    subagentModel?: string;
}
export interface RouteResolution {
    provider: LLMProvider;
    targetModel: string;
    originalModel: string;
    claudeTier?: ClaudeTier;
}
/**
 * Request log entry — captured for every POST /v1/messages request
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 */
export interface RequestLogEntry {
    timestamp: string;
    requestModel: string;
    claudeTier?: ClaudeTier;
    providerName?: string;
    targetModel?: string;
    status: 'success' | 'error';
    durationMs: number;
    statusCode: number;
    requestBodyPreview?: string;
    responsePreview?: string;
    retryCount?: number;
}
//# sourceMappingURL=index.d.ts.map