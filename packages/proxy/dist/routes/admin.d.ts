/**
 * Admin API routes
 * Phase: 01-core-proxy-server
 * Plan: 01-02, Task 3
 *
 * Per D-05: Admin endpoints:
 *   - GET /admin/config → return config (keys masked)
 *   - PUT /admin/config → save config
 *   - GET /admin/providers → list providers (keys masked)
 *   - POST /admin/providers → add provider
 *   - DELETE /admin/providers/:id → remove provider
 *   - GET /admin/routes → list routes
 *   - PUT /admin/routes → update routes
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=admin.d.ts.map