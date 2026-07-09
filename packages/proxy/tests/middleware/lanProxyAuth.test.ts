/**
 * LAN proxy auth middleware tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('lanProxyAuthMiddleware', () => {
  const originalToken = process.env.PROXY_API_TOKEN;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.PROXY_API_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.PROXY_API_TOKEN;
    } else {
      process.env.PROXY_API_TOKEN = originalToken;
    }
    vi.restoreAllMocks();
  });

  async function buildApp(bindHost = '127.0.0.1') {
    const configModule = await import('../../src/services/config.js');
    const networkModule = await import('../../src/services/network.js');
    vi.spyOn(configModule.configService, 'load').mockReturnValue({
      host: bindHost,
      providers: [],
      routes: [],
    } as ReturnType<typeof configModule.configService.load>);
    vi.spyOn(networkModule, 'resolveBindHost').mockReturnValue(bindHost);

    const { lanProxyAuthMiddleware } = await import('../../src/middleware/lanProxyAuth.js');
    const app = express();
    app.post('/v1/messages', lanProxyAuthMiddleware, (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  }

  it('allows localhost POST without token', async () => {
    const app = await buildApp('127.0.0.1');
    const response = await request(app).post('/v1/messages').send({ model: 'test' });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('skips non-/v1/messages routes', async () => {
    const { lanProxyAuthMiddleware } = await import('../../src/middleware/lanProxyAuth.js');
    const app = express();
    app.get('/health', lanProxyAuthMiddleware, (_req, res) => res.json({ status: 'ok' }));
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  });

  it('requires bearer token on LAN bind when PROXY_API_TOKEN is set', async () => {
    process.env.PROXY_API_TOKEN = 'secret-token';
    const app = await buildApp('0.0.0.0');

    const unauthorized = await request(app).post('/v1/messages').send({ model: 'test' });
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer secret-token')
      .send({ model: 'test' });
    expect(authorized.status).toBe(200);
  });
});
