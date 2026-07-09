'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useLogStore } from '@/stores/logStore';
import { ensureAdminToken, type RequestLogEntry } from '@/lib/api';
import { getProxyWsBase } from '@/lib/proxyBase';

const FALLBACK_POLL_MS = 30_000;
const RECONNECT_MS = 5_000;

export function useLogStream(): void {
  const { addEntry, setEntries, fetchLogs, setWsConnected } = useLogStore();
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearReconnect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current || !mountedRef.current) return;
    void fetchLogs();
    pollRef.current = setInterval(() => {
      if (mountedRef.current) void fetchLogs();
    }, FALLBACK_POLL_MS);
  }, [fetchLogs]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;
    clearReconnect();

    try {
      const token = await ensureAdminToken();
      if (!mountedRef.current) return;

      const ws = new WebSocket(`${getProxyWsBase()}/admin/logs/stream?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        setWsConnected(true);
        stopPolling();
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data) as {
            type: string;
            entry?: RequestLogEntry;
            entries?: RequestLogEntry[];
          };
          if (msg.type === 'snapshot' && msg.entries) {
            setEntries(msg.entries);
          } else if (msg.type === 'entry' && msg.entry) {
            addEntry(msg.entry);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setWsConnected(false);
        wsRef.current = null;
        startPolling();
        reconnectRef.current = setTimeout(() => {
          if (mountedRef.current) void connect();
        }, RECONNECT_MS);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      if (!mountedRef.current) return;
      setWsConnected(false);
      startPolling();
    }
  }, [addEntry, setEntries, setWsConnected, startPolling, stopPolling, clearReconnect]);

  useEffect(() => {
    mountedRef.current = true;
    void connect();
    return () => {
      mountedRef.current = false;
      clearReconnect();
      stopPolling();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, stopPolling, clearReconnect]);
}
