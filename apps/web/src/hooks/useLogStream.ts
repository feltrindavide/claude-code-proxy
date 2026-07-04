'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useLogStore } from '@/stores/logStore';
import { ensureAdminToken, type RequestLogEntry } from '@/lib/api';

const WS_BASE = 'ws://localhost:3456/admin/logs/stream';
const FALLBACK_POLL_MS = 30_000;

export function useLogStream(): void {
  const { addEntry, setEntries, fetchLogs, setWsConnected } = useLogStore();
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    fetchLogs();
    pollRef.current = setInterval(fetchLogs, FALLBACK_POLL_MS);
  }, [fetchLogs]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      const token = await ensureAdminToken();
      const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        stopPolling();
      };

      ws.onmessage = (event) => {
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
        setWsConnected(false);
        wsRef.current = null;
        startPolling();
        setTimeout(() => void connect(), 5_000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      setWsConnected(false);
      startPolling();
    }
  }, [addEntry, setEntries, setWsConnected, startPolling, stopPolling]);

  useEffect(() => {
    void connect();
    return () => {
      stopPolling();
      wsRef.current?.close();
    };
  }, [connect, stopPolling]);
}
