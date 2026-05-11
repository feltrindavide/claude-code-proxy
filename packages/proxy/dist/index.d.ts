/**
 * Express Server Entry Point
 * Phase: 01-core-proxy-server
 * Plans: 01-01, 01-02, 01-03 (config loading wired in 01-03)
 * Port: 3456 (per D-02)
 */
declare const app: import("express-serve-static-core").Express;
/**
 * Start the Express server
 */
export declare function startServer(port?: number, host?: string): Promise<void>;
export { app };
//# sourceMappingURL=index.d.ts.map