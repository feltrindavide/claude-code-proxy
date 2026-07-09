/**
 * Graceful shutdown — drain SSE streams and close resources.
 */

import type { Server } from 'http';
import type { Response } from 'express';
import { closeUpstreamAgents } from './upstream-http.js';
import { logger } from '../lib/logger.js';

function emitStreamTerminalEvents(res: Response): void {
  try {
    if (res.writableEnded) return;
    res.write(
      `event: message_delta\ndata: ${JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 0 },
      })}\n\n`,
    );
    res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
    res.end();
  } catch {
    try {
      if (!res.writableEnded) res.end();
    } catch {}
  }
}

const activeStreams = new Set<Response>();
let shuttingDown = false;

export function getActiveStreamCount(): number {
  return activeStreams.size;
}

/** @internal test helper */
export function clearActiveStreamsForTests(): void {
  activeStreams.clear();
  shuttingDown = false;
}

export function registerActiveStream(res: Response): void {
  activeStreams.add(res);
  res.on('close', () => activeStreams.delete(res));
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export interface ShutdownDeps {
  httpServer: Server;
  httpsServer?: Server | null;
  mtlsServer?: import('https').Server | null;
  onShutdown?: () => Promise<void> | void;
  drainTimeoutMs?: number;
}

export function setupGracefulShutdown(deps: ShutdownDeps): void {
  const drainTimeoutMs = deps.drainTimeoutMs ?? 10_000;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, streams: activeStreams.size }, 'Shutdown: draining active streams');

    const drainPromise = new Promise<void>((resolve) => {
      if (activeStreams.size === 0) {
        resolve();
        return;
      }
      const deadline = setTimeout(() => {
        for (const res of activeStreams) {
          try {
            if (!res.writableEnded) emitStreamTerminalEvents(res);
          } catch {}
        }
        activeStreams.clear();
        resolve();
      }, drainTimeoutMs);

      const check = () => {
        if (activeStreams.size === 0) {
          clearTimeout(deadline);
          resolve();
        }
      };
      for (const res of activeStreams) {
        res.once('close', check);
      }
    });

    await drainPromise;

    await new Promise<void>((resolve) => {
      deps.httpServer.close(() => resolve());
    });

    if (deps.httpsServer) {
      await new Promise<void>((resolve) => {
        deps.httpsServer!.close(() => resolve());
      });
    }

    if (deps.mtlsServer) {
      await new Promise<void>((resolve) => {
        deps.mtlsServer!.close(() => resolve());
      });
    }

    if (deps.onShutdown) {
      await deps.onShutdown();
    }

    await closeUpstreamAgents();
    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
