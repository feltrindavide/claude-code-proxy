'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ensureAdminToken, type ContextStreamPayload } from '@/lib/api';
import { getProxyHttpBase } from '@/lib/proxyBase';

const MAX_BACKOFF_MS = 30_000;

export function useContextStream(): {
  context: ContextStreamPayload | null;
  connected: boolean;
  error: string | null;
  retry: () => void;
} {
  const [context, setContext] = useState<ContextStreamPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const backoffRef = useRef(5_000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decoderRef = useRef<TextDecoder | null>(null);
  const lineBufferRef = useRef('');

  const scheduleReconnect = useCallback((connectFn: () => Promise<void>) => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      void connectFn();
    }, backoffRef.current);
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
  }, []);

  const connect = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!decoderRef.current) decoderRef.current = new TextDecoder();
    lineBufferRef.current = '';

    try {
      const token = await ensureAdminToken();
      const response = await fetch(
        `${getProxyHttpBase()}/admin/context/stream?token=${encodeURIComponent(token)}`,
        {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        setConnected(false);
        setError(`Stream unavailable (${response.status})`);
        scheduleReconnect(connect);
        return;
      }

      setError(null);
      const reader = response.body.getReader();
      let receivedChunk = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!receivedChunk) {
          setConnected(true);
          backoffRef.current = 5_000;
          receivedChunk = true;
        }

        lineBufferRef.current += decoderRef.current.decode(value, { stream: true });
        const parts = lineBufferRef.current.split('\n\n');
        lineBufferRef.current = parts.pop() || '';

        for (const part of parts) {
          const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine.slice(6)) as ContextStreamPayload;
            setContext(payload);
          } catch {
            // ignore malformed chunks
          }
        }
      }

      setConnected(false);
      scheduleReconnect(connect);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setConnected(false);
      setError(err instanceof Error ? err.message : 'Stream error');
      scheduleReconnect(connect);
    }
  }, [scheduleReconnect]);

  useEffect(() => {
    void connect();
    return () => {
      abortRef.current?.abort();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  const retry = useCallback(() => {
    backoffRef.current = 5_000;
    void connect();
  }, [connect]);

  return { context, connected, error, retry };
}
