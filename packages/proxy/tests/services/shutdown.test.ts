/**
 * Graceful shutdown stream tracker tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  registerActiveStream,
  getActiveStreamCount,
  clearActiveStreamsForTests,
} from '../../src/services/shutdown.js';
import type { Response } from 'express';

function mockResponse(): Response {
  const emitter = new EventEmitter();
  return {
    writableEnded: false,
    end: vi.fn(),
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    emit: emitter.emit.bind(emitter),
  } as unknown as Response;
}

describe('shutdown stream tracker', () => {
  beforeEach(() => {
    clearActiveStreamsForTests();
  });

  it('tracks active streams and removes on close', () => {
    const res = mockResponse();
    expect(getActiveStreamCount()).toBe(0);
    registerActiveStream(res);
    expect(getActiveStreamCount()).toBe(1);
    (res as unknown as EventEmitter).emit('close');
    expect(getActiveStreamCount()).toBe(0);
  });
});
