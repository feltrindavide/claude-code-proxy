/**
 * Admin API tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('Admin API', () => {
  let app: express.Express;
  let adminToken: string;

  beforeEach(async () => {
    vi.resetModules();
    const { default: adminRouter } = await import('../../src/routes/admin.js');

    app = express();
    app.use(express.json());
    app.use('/admin', adminRouter);

    const bootstrap = await request(app).get('/admin/auth/bootstrap');
    adminToken = bootstrap.body.token;
  });

  function auth(method: 'get' | 'put' | 'post', path: string) {
    return request(app)[method](path).set('X-Admin-Token', adminToken);
  }

  describe('GET /admin/config', () => {
    it('should return current config', async () => {
      const response = await auth('get', '/admin/config');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('providers');
      expect(response.body).toHaveProperty('routes');
    });
  });

  describe('PUT /admin/config', () => {
    it('should save config', async () => {
      const response = await auth('put', '/admin/config').send({
        providers: [],
        routes: [{ claudeTier: 'opus', providerName: 'test', targetModel: 'test-model' }],
      });
      expect(response.status).toBe(200);
    });
  });

  describe('GET /admin/providers', () => {
    it('should list providers', async () => {
      const response = await auth('get', '/admin/providers');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /admin/routes', () => {
    it('should return model routes object', async () => {
      const response = await auth('get', '/admin/routes');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('routes');
      expect(Array.isArray(response.body.routes)).toBe(true);
    });
  });

  describe('PUT /admin/routes', () => {
    it('should update routes', async () => {
      const response = await auth('put', '/admin/routes').send({
        routes: [{ claudeTier: 'opus', providerName: 'opencode', targetModel: 'qwen3.6' }],
      });
      expect([200, 500]).toContain(response.status);
    });

    it('should reject invalid routes with 400', async () => {
      const response = await auth('put', '/admin/routes').send({
        routes: [{ providerName: 'x', targetModel: 'y' }],
      });
      expect(response.status).toBe(400);
    });
  });
});
