/**
 * Optional dedicated HTTP listener for /admin only (reduces attack surface on inference port).
 */

import express from 'express';
import cors from 'cors';
import type { Server } from 'http';
import adminRouter from '../routes/admin.js';
import { logger } from '../lib/logger.js';

let adminHttpServer: Server | null = null;

export function createAdminOnlyApp(): express.Application {
  const adminApp = express();
  adminApp.use(cors({
    origin: [
      'http://localhost:3457',
      'http://127.0.0.1:3457',
      'tauri://localhost',
      'http://tauri.localhost',
    ],
  }));
  adminApp.use(express.json({ limit: '32mb' }));
  adminApp.use('/admin', adminRouter);
  adminApp.get('/health', (_req, res) => {
    res.json({ status: 'ok', adminOnly: true });
  });
  return adminApp;
}

export function startAdminHttpServer(app: express.Application, port: number, host: string): Server | null {
  if (adminHttpServer) return adminHttpServer;

  adminHttpServer = app.listen(port, host, () => {
    logger.info({ host, port }, 'Admin-only HTTP listener started');
  });
  return adminHttpServer;
}

export function closeAdminHttpServer(): void {
  if (adminHttpServer) {
    adminHttpServer.close();
    adminHttpServer = null;
  }
}

export function getAdminHttpServer(): Server | null {
  return adminHttpServer;
}
