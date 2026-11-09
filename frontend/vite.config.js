import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devApi = env.VITE_DEV_API || process.env.VITE_DEV_API || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Same-origin in development so cookies and CSRF behave like a single-site deployment.
      proxy: {
        '/api': { target: devApi, changeOrigin: false },
        '/socket.io': {
          target: devApi,
          ws: true,
          changeOrigin: true,
        },
        '/uploads': {
          target: devApi,
          changeOrigin: false,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/tests/setup.js'],
      css: false,
    },
  };
});
