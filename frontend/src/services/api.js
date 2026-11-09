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

// Access and refresh tokens for environments where third-party cookies are restricted
const TOKEN_KEY = 'vp_access_token';
const REFRESH_KEY = 'vp_refresh_token';

let inMemoryToken = null;
let inMemoryRefreshToken = null;

export const setAccessToken = (t) => {
  inMemoryToken = t || null;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

export const getAccessToken = () => {
  if (inMemoryToken) return inMemoryToken;
  try {
    inMemoryToken = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  return inMemoryToken;
};

export const setRefreshToken = (t) => {
  inMemoryRefreshToken = t || null;
  try {
    if (t) localStorage.setItem(REFRESH_KEY, t);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
};

export const getRefreshToken = () => {
  if (inMemoryRefreshToken) return inMemoryRefreshToken;
  try {
    inMemoryRefreshToken = localStorage.getItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
  return inMemoryRefreshToken;
};

export const clearTokens = () => {
  setAccessToken(null);
  setRefreshToken(null);
  setCsrfToken(null);
  sessionHint.clear();
};

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
  const token = getAccessToken();
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  if (!SAFE.has((config.method || 'get').toLowerCase())) {
    config.headers['x-csrf-token'] = await ensureCsrf();
  }
  return config;
});

let refreshPending = null;
function refreshSession() {
  const rfToken = getRefreshToken();
  refreshPending ??= api
    .post('/auth/refresh', rfToken ? { refreshToken: rfToken } : {}, { _skipRefresh: true })
    .then((r) => {
      setCsrfToken(r.data.csrfToken);
      if (r.data.accessToken) setAccessToken(r.data.accessToken);
      if (r.data.refreshToken) setRefreshToken(r.data.refreshToken);
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
        clearTokens();
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
