/**
 * SSE broadcast for live context usage updates.
 */

import type { Response } from 'express';
import { eventBus } from './event-bus.js';
import { contextRegistry } from './context-registry.js';
import { getCurrentSessionUsage, lastContextUsage } from '../proxy.js';
import { getSessionUsage } from './session-tracker.js';

export interface ContextStreamPayload {
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  provider: string;
  tier: string;
  inflation: number;
  limit: number;
  usagePercent: number;
}

const clients = new Set<Response>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let eventUnsub: (() => void) | null = null;

function resolveLimit(tier: string, model: string, provider: string): number {
  if (tier) {
    const claudeCtx = contextRegistry.getClaudeContext(tier as 'opus' | 'sonnet' | 'haiku');
    if (claudeCtx) return claudeCtx;
  }
  const modelCtx = contextRegistry.getModelContext(model, provider);
  return modelCtx?.context ?? 200_000;
}

export function buildContextPayload(sessionId?: string): ContextStreamPayload {
  const usage = sessionId
    ? getSessionUsage(sessionId)
    : getCurrentSessionUsage() || lastContextUsage;

  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const tier = usage?.tier ?? '';
  const model = usage?.model ?? '';
  const provider = usage?.provider ?? '';
  const inflation = usage?.inflation ?? 1;
  const limit = resolveLimit(tier, model, provider);
  const usagePercent = limit > 0 ? Math.min(100, (totalTokens / limit) * 100) : 0;

  return {
    timestamp: new Date().toISOString(),
    inputTokens,
    outputTokens,
    totalTokens,
    model,
    provider,
    tier,
    inflation,
    limit,
    usagePercent: Math.round(usagePercent * 10) / 10,
  };
}

function writeEvent(res: Response, payload: ContextStreamPayload): void {
  if (res.writableEnded) return;
  res.write(`event: context\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(): void {
  const payload = buildContextPayload();
  for (const client of clients) {
    writeEvent(client, payload);
  }
}

function ensureListeners(): void {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(broadcast, 5_000);
  eventUnsub = eventBus.on('request.completed', () => broadcast());
}

function maybeStopListeners(): void {
  if (clients.size > 0) return;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (eventUnsub) {
    eventUnsub();
    eventUnsub = null;
  }
}

export function subscribeContextStream(res: Response, sessionId?: string): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  clients.add(res);
  ensureListeners();
  writeEvent(res, buildContextPayload(sessionId));

  res.on('close', () => {
    clients.delete(res);
    maybeStopListeners();
  });
}

export function closeContextStreams(): void {
  for (const client of clients) {
    if (!client.writableEnded) client.end();
  }
  clients.clear();
  maybeStopListeners();
}
