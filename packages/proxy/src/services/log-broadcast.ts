/**
 * WebSocket broadcast for live routing logs.
 */

import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { RequestLogEntry } from '../types/index.js';
import { requestLogService, redactLogEntry } from './requestLog.js';
import { validateAdminTokenFromString } from './admin-auth.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

function parseToken(req: IncomingMessage): string | null {
  return null;
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function attachLogWebSocket(server: Server): void {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname !== '/admin/logs/stream') {
      return;
    }

    wss!.handleUpgrade(req, socket, head, (ws) => {
      wss!.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    let authed = false;

    ws.on('message', (raw) => {
      if (authed) return;
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; token?: string };
        if (msg.type === 'auth' && msg.token && validateAdminTokenFromString(msg.token)) {
          authed = true;
          clients.add(ws);
          send(ws, { type: 'snapshot', entries: requestLogService.getAll().map(redactLogEntry) });
        } else {
          send(ws, { type: 'error', message: 'Unauthorized' });
          ws.close(4401, 'Unauthorized');
        }
      } catch {
        ws.close(4400, 'Bad request');
      }
    });

    if (!authed) {
      const authTimeout = setTimeout(() => {
        if (!authed && ws.readyState === WebSocket.OPEN) {
          ws.close(4401, 'Auth timeout');
        }
      }, 5000);
      ws.on('close', () => clearTimeout(authTimeout));
    }

    ws.on('close', () => clients.delete(ws));
  });
}

export function getLogBroadcastClientCount(): number {
  return clients.size;
}

/** @internal test helper — inject a mock WebSocket client */
export function _testRegisterClient(ws: Pick<WebSocket, 'readyState' | 'send'>): void {
  clients.add(ws as WebSocket);
}

/** @internal test helper */
export function _testClearClients(): void {
  clients.clear();
}

export function broadcastLogEntry(entry: RequestLogEntry): void {
  const payload = JSON.stringify({ type: 'entry', entry: redactLogEntry(entry) });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function closeLogWebSocket(): void {
  for (const ws of clients) {
    ws.close();
  }
  clients.clear();
  wss?.close();
  wss = null;
}
