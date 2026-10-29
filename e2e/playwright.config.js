import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against REAL servers: the Express API (isolated MongoDB database and
// Redis DB, fresh on every run) and the Vite app. Nothing is mocked except where a test
// deliberately simulates a failure.
//
// Browser: by default Playwright's own Chromium (`npx playwright install chromium`). In
// environments that cannot download browsers, set USE_SPARTICUZ=1 to use the Chromium bundled
// in the @sparticuz/chromium package, or CHROMIUM_PATH to point at any Chromium binary.
const API_PORT = 5100;
const WEB_PORT = 5174;
let executablePath = process.env.CHROMIUM_PATH;
let args = [];
if (!executablePath && process.env.USE_SPARTICUZ === '1') {
  const sp = (await import('@sparticuz/chromium')).default;
  executablePath = await sp.executablePath();
  args = sp.args.filter((a) => a !== '--single-process' && a !== '--no-zygote');
}

export const E2E = {
  api: `http://localhost:${API_PORT}`,
  web: `http://localhost:${WEB_PORT}`,
  admin: { email: 'e2e.admin@vpmart.example', password: 'E2eAdmin2026Pass' },
};

const backendEnv = {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  MONGODB_URI: 'mongodb://127.0.0.1:27017/vpmart_e2e?replicaSet=rs0',
  REDIS_URL: 'redis://127.0.0.1:6379/14',
  CLIENT_ORIGIN: E2E.web,
  PUBLIC_API_URL: E2E.api,
  JWT_ACCESS_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-1234',
  STORAGE_DRIVER: 'local',
  UPLOAD_DIR: '/tmp/vpmart_e2e_uploads',
  BCRYPT_ROUNDS: '4',
  AUTH_RATE_LIMIT_MAX: '2000',
  API_RATE_LIMIT_PER_MIN: '20000',
  STRICT_RATE_LIMIT_PER_HOUR: '1000',
  MAIL_TRANSPORT: 'outbox',
  ADMIN_EMAIL: E2E.admin.email,
  ADMIN_PASSWORD: E2E.admin.password,
  DELIVERY_HOLIDAYS: '',
};

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.js',
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS || 1),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: E2E.web, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { executablePath, args } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, testIgnore: /mobile\.spec\.js/ },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } }, testMatch: /mobile\.spec\.js/ },
  ],
  webServer: [
    {
      // Resets the E2E database, seeds categories and the admin, then starts the API.
      command: 'node src/scripts/e2ePrepare.js && node src/index.js',
      cwd: '../backend',
      url: `${E2E.api}/api/health`,
      env: backendEnv,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: '../frontend',
      url: E2E.web,
      env: { VITE_DEV_API: E2E.api },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
