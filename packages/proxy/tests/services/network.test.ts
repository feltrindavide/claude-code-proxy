import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveBindHost,
  resolvePort,
  isAllInterfacesHost,
  isLocalhostHost,
} from '../../src/services/network.js';

describe('network bind policy', () => {
  const originalLan = process.env.ALLOW_LAN_BIND;

  afterEach(() => {
    if (originalLan === undefined) delete process.env.ALLOW_LAN_BIND;
    else process.env.ALLOW_LAN_BIND = originalLan;
  });

  it('defaults to 127.0.0.1', () => {
    expect(resolveBindHost()).toBe('127.0.0.1');
    expect(resolveBindHost(undefined)).toBe('127.0.0.1');
  });

  it('normalizes localhost', () => {
    expect(resolveBindHost('localhost')).toBe('127.0.0.1');
  });

  it('blocks 0.0.0.0 without ALLOW_LAN_BIND', () => {
    delete process.env.ALLOW_LAN_BIND;
    expect(resolveBindHost('0.0.0.0')).toBe('127.0.0.1');
    expect(isAllInterfacesHost('0.0.0.0')).toBe(true);
  });

  it('allows 0.0.0.0 with ALLOW_LAN_BIND=true', () => {
    process.env.ALLOW_LAN_BIND = 'true';
    expect(resolveBindHost('0.0.0.0')).toBe('0.0.0.0');
  });

  it('blocks non-localhost without ALLOW_LAN_BIND', () => {
    delete process.env.ALLOW_LAN_BIND;
    expect(resolveBindHost('192.168.1.10')).toBe('127.0.0.1');
  });

  it('recognizes localhost aliases', () => {
    expect(isLocalhostHost('127.0.0.1')).toBe(true);
    expect(isLocalhostHost('::1')).toBe(true);
  });

  it('resolvePort clamps invalid values', () => {
    expect(resolvePort()).toBe(3456);
    expect(resolvePort(8080)).toBe(8080);
    expect(resolvePort(0)).toBe(3456);
    expect(resolvePort(99999)).toBe(3456);
  });
});
