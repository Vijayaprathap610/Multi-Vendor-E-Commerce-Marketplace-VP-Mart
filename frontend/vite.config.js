import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in development so cookies and CSRF behave like a single-site deployment.
    proxy: {
      '/api': { target: process.env.VITE_DEV_API || 'http://localhost:5000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
    css: false,
  },
});
