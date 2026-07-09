/**
 * Admin auth service and middleware tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';

describe('AdminAuth', () => {
  let tempHome: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'ccp-admin-auth-'));
    process.env.HOME = tempHome;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('bootstrap returns token for localhost', async () => {
    const { default: adminRouter } = await import('../../src/routes/admin.js');
    const app = express();
    app.use('/admin', adminRouter);

    const response = await request(app).get('/admin/auth/bootstrap');
    expect(response.status).toBe(200);
    expect(response.body.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('protected route rejects missing token', async () => {
    const { default: adminRouter } = await import('../../src/routes/admin.js');
    const app = express();
    app.use('/admin', adminRouter);

    const response = await request(app).get('/admin/config');
    expect(response.status).toBe(401);
  });

  it('protected route accepts valid token', async () => {
    const { default: adminRouter } = await import('../../src/routes/admin.js');
    const app = express();
    app.use('/admin', adminRouter);

    const bootstrap = await request(app).get('/admin/auth/bootstrap');
    const token = bootstrap.body.token;

    const response = await request(app)
      .get('/admin/config')
      .set('X-Admin-Token', token);
    expect(response.status).toBe(200);
  });
});

describe('adminAuthMiddleware', () => {
  let tempHome: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'ccp-admin-mw-'));
    process.env.HOME = tempHome;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('accepts Bearer token and rejects query token', async () => {
    const { ensureAdminToken } = await import('../../src/services/admin-auth.js');
    const { adminAuthMiddleware } = await import('../../src/middleware/adminAuth.js');
    const token = ensureAdminToken();

    const app = express();
    app.get('/secure', adminAuthMiddleware, (_req, res) => res.json({ ok: true }));

    const header = await request(app).get('/secure').set('Authorization', `Bearer ${token}`);
    expect(header.status).toBe(200);

    const query = await request(app).get('/secure').query({ token });
    expect(query.status).toBe(401);
  });

  it('validateAdminToken rejects query token', async () => {
    const { ensureAdminToken, validateAdminToken } = await import('../../src/services/admin-auth.js');
    const token = ensureAdminToken();

    const req = {
      headers: {},
      query: { token },
    } as Parameters<typeof validateAdminToken>[0];

    expect(validateAdminToken(req)).toBe(false);
  });

  it('validateAdminTokenFromString matches disk token', async () => {
    const { ensureAdminToken, validateAdminTokenFromString } = await import('../../src/services/admin-auth.js');
    const token = ensureAdminToken();
    expect(validateAdminTokenFromString(token)).toBe(true);
    expect(validateAdminTokenFromString('wrong')).toBe(false);
  });

  it('isLocalhostRequest detects loopback addresses', async () => {
    const { isLocalhostRequest } = await import('../../src/services/admin-auth.js');
    const req = { socket: { remoteAddress: '127.0.0.1' } } as Parameters<typeof isLocalhostRequest>[0];
    expect(isLocalhostRequest(req)).toBe(true);

    const lan = { socket: { remoteAddress: '192.168.1.10' } } as Parameters<typeof isLocalhostRequest>[0];
    expect(isLocalhostRequest(lan)).toBe(false);
  });
});
