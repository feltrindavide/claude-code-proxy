/**
 * Optional mTLS listener for /admin on a separate localhost port.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import type { Server } from 'https';
import type express from 'express';
import { configService } from './config.js';
import { logger } from '../lib/logger.js';

const DEFAULT_MTLS_PORT = 3458;

export interface AdminMtlsPaths {
  dir: string;
  ca: string;
  serverCert: string;
  serverKey: string;
  clientCert: string;
  clientKey: string;
}

export function getAdminMtlsDir(): string {
  return path.join(os.homedir(), '.claude', 'claude-code-proxy', 'data', 'certs', 'admin-mtls');
}

export function getAdminMtlsPaths(dir = getAdminMtlsDir()): AdminMtlsPaths {
  return {
    dir,
    ca: path.join(dir, 'ca.pem'),
    serverCert: path.join(dir, 'server.pem'),
    serverKey: path.join(dir, 'server-key.pem'),
    clientCert: path.join(dir, 'client.pem'),
    clientKey: path.join(dir, 'client-key.pem'),
  };
}

export function adminMtlsCertsReady(paths = getAdminMtlsPaths()): boolean {
  return (
    fs.existsSync(paths.ca) &&
    fs.existsSync(paths.serverCert) &&
    fs.existsSync(paths.serverKey)
  );
}

export function isAdminMtlsEnabled(): boolean {
  const config = configService.load();
  if (config.adminMtls?.enabled) return adminMtlsCertsReady();
  if (process.env.ADMIN_MTLS === 'true') return adminMtlsCertsReady();
  return false;
}

export function getAdminMtlsPort(): number {
  const config = configService.load();
  return config.adminMtls?.port ?? DEFAULT_MTLS_PORT;
}

let mtlsServer: Server | null = null;

export function startAdminMtlsServer(app: express.Application): Server | null {
  if (!isAdminMtlsEnabled()) return null;
  if (mtlsServer) return mtlsServer;

  const paths = getAdminMtlsPaths();
  if (!adminMtlsCertsReady(paths)) {
    logger.warn('Admin mTLS enabled but certificates missing — run scripts/generate-admin-mtls.sh');
    return null;
  }

  const tlsOptions = {
    key: fs.readFileSync(paths.serverKey),
    cert: fs.readFileSync(paths.serverCert),
    ca: fs.readFileSync(paths.ca),
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2' as const,
  };

  const port = getAdminMtlsPort();
  mtlsServer = https.createServer(tlsOptions, app);
  mtlsServer.listen(port, '127.0.0.1', () => {
    logger.info({ port }, 'Admin mTLS server listening on https://127.0.0.1');
  });

  mtlsServer.on('tlsClientError', (err) => {
    logger.warn({ err: err.message }, 'Admin mTLS client handshake failed');
  });

  return mtlsServer;
}

export function closeAdminMtlsServer(): void {
  if (mtlsServer) {
    mtlsServer.close();
    mtlsServer = null;
  }
}

export function getAdminMtlsStatus(): {
  enabled: boolean;
  ready: boolean;
  port: number;
  certDir: string;
} {
  const ready = adminMtlsCertsReady();
  const enabled = isAdminMtlsEnabled();
  return {
    enabled,
    ready,
    port: getAdminMtlsPort(),
    certDir: getAdminMtlsDir(),
  };
}
