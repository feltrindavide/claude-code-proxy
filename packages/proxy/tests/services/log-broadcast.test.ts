/**
 * Log broadcast WebSocket tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  broadcastLogEntry,
  _testRegisterClient,
  _testClearClients,
  getLogBroadcastClientCount,
} from '../../src/services/log-broadcast.js';

describe('log-broadcast', () => {
  beforeEach(() => {
    _testClearClients();
  });

  it('broadcasts entry to connected clients', () => {
    const send = vi.fn();
    _testRegisterClient({ readyState: WebSocket.OPEN, send });
    expect(getLogBroadcastClientCount()).toBe(1);

    broadcastLogEntry({
      timestamp: new Date().toISOString(),
      requestModel: 'claude-sonnet-4-20250514',
      status: 'success',
      durationMs: 100,
      statusCode: 200,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(send.mock.calls[0][0] as string);
    expect(payload.type).toBe('entry');
    expect(payload.entry.requestModel).toBe('claude-sonnet-4-20250514');
  });

  it('skips clients that are not open', () => {
    const send = vi.fn();
    _testRegisterClient({ readyState: WebSocket.CLOSED, send });
    broadcastLogEntry({
      timestamp: new Date().toISOString(),
      requestModel: 'test',
      status: 'error',
      durationMs: 50,
      statusCode: 500,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
