import axios from 'axios';

function resolveBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL?.trim();
  if (!envUrl) return '/api';
  const clean = envUrl.replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

const baseURL = resolveBaseUrl();
const SAFE = new Set(['get', 'head', 'options']);
// A tiny non-secret hint that this browser has signed in. It only decides whether a silent
// refresh is worth attempting; the real session lives in HttpOnly cookies the page cannot read.
const HINT = 'vp_session';
export const sessionHint = {
  has() {
    try {
      return localStorage.getItem(HINT) === '1';
    } catch {
      return true; // storage unavailable: fall back to asking the server
    }
  },
  set() {
    try {
      localStorage.setItem(HINT, '1');
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(HINT);
    } catch {
      /* ignore */
    }
  },
};
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

export const api = axios.create({ baseURL, withCredentials: true, timeout: 15000 });

// The CSRF token lives in memory only. The API returns it in response bodies, so this also
// works when the SPA and the API are on different domains (document.cookie cannot be used there).
let csrfToken = null;
let csrfPending = null;
export const setCsrfToken = (t) => {
  csrfToken = t || null;
};

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  csrfPending ??= axios
    .get(`${baseURL}/auth/csrf`, { withCredentials: true, adapter: api.defaults.adapter })
    .then((r) => {
      csrfToken = r.data.csrfToken;
      return csrfToken;
    })
    .finally(() => {
      csrfPending = null;
    });
  return csrfPending;
}

api.interceptors.request.use(async (config) => {
  if (!SAFE.has((config.method || 'get').toLowerCase())) {
    config.headers['x-csrf-token'] = await ensureCsrf();
  }
  return config;
});

let refreshPending = null;
function refreshSession() {
  refreshPending ??= api
    .post('/auth/refresh', {}, { _skipRefresh: true })
    .then((r) => {
      setCsrfToken(r.data.csrfToken);
      sessionHint.set();
    })
    .finally(() => {
      refreshPending = null;
    });
  return refreshPending;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { config, response } = error;
    if (!config || !response) return Promise.reject(error);
    const code = response.data?.error?.code;

    if (response.status === 403 && code === 'CSRF_INVALID' && !config._csrfRetried) {
      config._csrfRetried = true;
      setCsrfToken(null);
      return api(config);
    }

    const refreshable = ['UNAUTHENTICATED', 'TOKEN_INVALID'].includes(code);
    const skip = config._skipRefresh || NO_REFRESH.some((p) => config.url?.startsWith(p));
    if (
      response.status === 401 &&
      refreshable &&
      !skip &&
      !config._refreshed &&
      sessionHint.has()
    ) {
      config._refreshed = true;
      try {
        await refreshSession();
        return api(config);
      } catch {
        sessionHint.clear();
        window.dispatchEvent(new Event('vp:auth-expired'));
      }
    }
    return Promise.reject(error);
  },
);

// Turns any failure into { message, code, fields } for forms and toasts.
export function normalizeError(err) {
  const data = err?.response?.data?.error;
  if (data) return { message: data.message, code: data.code, fields: data.details || {} };
  if (err?.code === 'ECONNABORTED')
    return { message: 'The request timed out. Please try again.', code: 'TIMEOUT', fields: {} };
  return {
    message: 'Cannot reach the server. Check your connection and try again.',
    code: 'NETWORK',
    fields: {},
  };
}
