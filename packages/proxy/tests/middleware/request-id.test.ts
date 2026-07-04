/**
 * Request ID middleware tests
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';

describe('requestIdMiddleware', () => {
  it('generates X-Request-Id when missing', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/test', (req, res) => {
      res.json({ requestId: req.requestId });
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('propagates incoming X-Request-Id', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/test', (req, res) => {
      res.json({ requestId: req.requestId });
    });

    const res = await request(app)
      .get('/test')
      .set('X-Request-Id', 'test-id-123');
    expect(res.body.requestId).toBe('test-id-123');
  });
});
