import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAdminTokenCache } from '@/lib/api';

describe('ensureAdminToken', () => {
  beforeEach(() => {
    clearAdminTokenCache();
    vi.restoreAllMocks();
  });

  it('bootstraps admin token from proxy /admin/auth/bootstrap', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'a'.repeat(64) }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ensureAdminToken } = await import('@/lib/api');
    const token = await ensureAdminToken();

    expect(token).toHaveLength(64);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/auth/bootstrap'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('caches token after first bootstrap', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'b'.repeat(64) }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ensureAdminToken } = await import('@/lib/api');
    await ensureAdminToken();
    await ensureAdminToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
