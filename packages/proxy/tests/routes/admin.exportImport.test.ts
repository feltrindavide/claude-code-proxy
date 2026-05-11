/**
 * Admin export/import route tests
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-02, Task 3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('Admin export/import routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    const { default: adminRouter } = await import('../../src/routes/admin.js');

    app = express();
    app.use(express.json());
    app.use('/admin', adminRouter);
  });

  describe('GET /admin/config/export', () => {
    it('should return masked config with keyId bullet characters', async () => {
      const response = await request(app).get('/admin/config/export');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('providers');
      expect(response.body).toHaveProperty('routes');
      expect(response.body).toHaveProperty('settings');
      expect(response.body.settings.port).toBe(3456);
      // If there are providers, their keyId should be masked
      if (response.body.providers.length > 0) {
        expect(response.body.providers[0].keyId).toBe('••••');
      }
    });
  });

  describe('POST /admin/config/import', () => {
    it('should reject missing strategy', async () => {
      const response = await request(app)
        .post('/admin/config/import')
        .send({ data: {} });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('data and strategy');
    });

    it('should reject invalid strategy', async () => {
      const response = await request(app)
        .post('/admin/config/import')
        .send({ data: {}, strategy: 'delete' });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('data and strategy');
    });

    it('should accept valid data with replace strategy', async () => {
      const response = await request(app)
        .post('/admin/config/import')
        .send({
          data: {
            providers: [],
            routes: [{ claudeTier: 'opus', providerName: 'test', targetModel: 'test-model' }],
          },
          strategy: 'replace',
        });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('backupPath');
    });

    it('should reject invalid config data', async () => {
      const response = await request(app)
        .post('/admin/config/import')
        .send({
          data: { invalid: true },
          strategy: 'replace',
        });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid config');
    });
  });

  describe('POST /admin/config/diff', () => {
    it('should return current and incoming config', async () => {
      const incomingData = {
        providers: [],
        routes: [{ claudeTier: 'opus', providerName: 'new', targetModel: 'new-model' }],
      };
      const response = await request(app)
        .post('/admin/config/diff')
        .send({ data: incomingData });
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('current');
      expect(response.body).toHaveProperty('incoming');
      expect(response.body.incoming).toEqual(incomingData);
    });

    it('should reject missing data', async () => {
      const response = await request(app)
        .post('/admin/config/diff')
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('data is required');
    });
  });
});
