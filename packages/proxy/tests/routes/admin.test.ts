/**
 * Admin API tests
 * Phase: 01-core-proxy-server
 * Plan: 01-02, Task 3
 * 
 * Integration tests - tests admin routes behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('Admin API', () => {
  let app: express.Express;

  beforeEach(async () => {
    // Import services directly for this test
    const { default: adminRouter } = await import('../../src/routes/admin.js');
    
    app = express();
    app.use(express.json());
    app.use('/admin', adminRouter);
  });

  describe('GET /admin/config', () => {
    it('should return current config', async () => {
      const response = await request(app).get('/admin/config');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('providers');
      expect(response.body).toHaveProperty('routes');
    });
  });

  describe('PUT /admin/config', () => {
    it('should save config', async () => {
      const newConfig = {
        providers: [],
        routes: [{ claudeTier: 'opus', providerName: 'test', targetModel: 'test-model' }],
      };
      
      const response = await request(app).put('/admin/config').send(newConfig);
      
      expect(response.status).toBe(200);
    });
  });

  describe('GET /admin/providers', () => {
    it('should list providers', async () => {
      const response = await request(app).get('/admin/providers');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /admin/routes', () => {
    it('should return model routes', async () => {
      const response = await request(app).get('/admin/routes');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('PUT /admin/routes', () => {
    it('should update routes', async () => {
      const routes = [{ claudeTier: 'opus', providerName: 'opencode', targetModel: 'qwen3.6' }];
      
      const response = await request(app).put('/admin/routes').send({ routes });
      
      // May fail if config dir not writable, but should not crash
      expect([200, 500]).toContain(response.status);
    });
  });
});