import { beforeEach, describe, expect, it } from 'vitest';
import { api, normalizeError, sessionHint, setCsrfToken } from '../services/api.js';

// A scripted adapter stands in for the network so the interceptor logic itself is what runs.
function script(handler) {
  const calls = [];
  api.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, headers: { ...config.headers } });
    const out = handler(config, calls);
    if (out.status >= 400) {
      const err = new Error('fail');
      err.config = config;
      err.response = { status: out.status, data: out.data, config };
      throw err;
    }
    return { status: out.status, data: out.data, headers: {}, config };
  };
  return calls;
}

beforeEach(() => {
  setCsrfToken(null);
  sessionHint.set();
});

describe('api client', () => {
  it('fetches a CSRF token once and sends it on unsafe requests only', async () => {
    const calls = script((c) =>
      c.url.endsWith('/auth/csrf')
        ? { status: 200, data: { csrfToken: 'tok1' } }
        : { status: 200, data: { ok: true } },
    );
    await api.post('/x', {});
    await api.post('/y', {});
    await api.get('/z');
    const posts = calls.filter((c) => c.method === 'post');
    expect(posts.every((c) => c.headers['x-csrf-token'] === 'tok1')).toBe(true);
    expect(calls.filter((c) => c.url.endsWith('/auth/csrf'))).toHaveLength(1);
    expect(
      calls.find((c) => c.method === 'get' && c.url === '/z').headers['x-csrf-token'],
    ).toBeUndefined();
  });

  it('refreshes the session once on an expired token and retries the request', async () => {
    let first = true;
    const calls = script((c) => {
      if (c.url.endsWith('/auth/csrf')) return { status: 200, data: { csrfToken: 't' } };
      if (c.url === '/auth/refresh') return { status: 200, data: { csrfToken: 't2' } };
      if (c.url === '/orders' && first) {
        first = false;
        return { status: 401, data: { error: { code: 'TOKEN_INVALID' } } };
      }
      return { status: 200, data: { ok: true } };
    });
    setCsrfToken('already-have-one');
    const res = await api.get('/orders');
    expect(res.data.ok).toBe(true);
    expect(calls.map((c) => c.url)).toEqual(['/orders', '/auth/refresh', '/orders']);
  });

  it('does not loop when refresh itself fails, and announces the expired session', async () => {
    let expired = false;
    window.addEventListener('vp:auth-expired', () => (expired = true), { once: true });
    script((c) => {
      if (c.url.endsWith('/auth/csrf')) return { status: 200, data: { csrfToken: 't' } };
      return {
        status: 401,
        data: {
          error: { code: c.url === '/auth/refresh' ? 'REFRESH_INVALID' : 'UNAUTHENTICATED' },
        },
      };
    });
    await expect(api.get('/orders')).rejects.toBeTruthy();
    expect(expired).toBe(true);
  });

  it('does not try to refresh after a failed login', async () => {
    const calls = script((c) =>
      c.url.endsWith('/auth/csrf')
        ? { status: 200, data: { csrfToken: 't' } }
        : { status: 401, data: { error: { code: 'INVALID_CREDENTIALS' } } },
    );
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();
    expect(calls.some((c) => c.url === '/auth/refresh')).toBe(false);
  });

  it('refetches the CSRF token and retries once when it is rejected', async () => {
    let n = 0;
    const calls = script((c) => {
      if (c.url.endsWith('/auth/csrf')) return { status: 200, data: { csrfToken: `t${++n}` } };
      return c.headers['x-csrf-token'] === 't1'
        ? { status: 403, data: { error: { code: 'CSRF_INVALID' } } }
        : { status: 200, data: { ok: true } };
    });
    const res = await api.post('/things', {});
    expect(res.data.ok).toBe(true);
    expect(calls.filter((c) => c.url === '/things')).toHaveLength(2);
  });
});

describe('session hint', () => {
  it('does not attempt a silent refresh for visitors who never signed in', async () => {
    sessionHint.clear();
    const calls = script((c) =>
      c.url.endsWith('/auth/csrf')
        ? { status: 200, data: { csrfToken: 't' } }
        : { status: 401, data: { error: { code: 'UNAUTHENTICATED' } } },
    );
    await expect(api.get('/orders')).rejects.toBeTruthy();
    expect(calls.some((c) => c.url === '/auth/refresh')).toBe(false);
  });

  it('forgets the hint when refresh fails, so later requests stop retrying', async () => {
    script((c) => {
      if (c.url.endsWith('/auth/csrf')) return { status: 200, data: { csrfToken: 't' } };
      return {
        status: 401,
        data: { error: { code: c.url === '/auth/refresh' ? 'REFRESH_INVALID' : 'TOKEN_INVALID' } },
      };
    });
    await expect(api.get('/orders')).rejects.toBeTruthy();
    expect(sessionHint.has()).toBe(false);
  });

  it('skips the /auth/me call entirely when this browser has never signed in', async () => {
    const { authService } = await import('../services/authService.js');
    sessionHint.clear();
    const calls = script(() => ({ status: 200, data: {} }));
    await expect(authService.me()).rejects.toMatchObject({ response: { status: 401 } });
    expect(calls).toHaveLength(0);
  });
});

describe('normalizeError', () => {
  it('extracts server messages and field errors', () => {
    const e = {
      response: {
        data: { error: { code: 'VALIDATION_ERROR', message: 'Fix it', details: { email: 'bad' } } },
      },
    };
    expect(normalizeError(e)).toEqual({
      message: 'Fix it',
      code: 'VALIDATION_ERROR',
      fields: { email: 'bad' },
    });
  });
  it('describes network failures and timeouts', () => {
    expect(normalizeError(new Error('x')).code).toBe('NETWORK');
    expect(normalizeError({ code: 'ECONNABORTED' }).code).toBe('TIMEOUT');
  });
});
