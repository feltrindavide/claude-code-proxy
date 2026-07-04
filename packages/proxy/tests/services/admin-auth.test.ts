/**
 * Admin auth tests
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
