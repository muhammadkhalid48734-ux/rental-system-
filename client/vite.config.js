import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Fonts are served as real files (not data: URIs) so the CSP can stay font-src 'self'.
  build: { assetsInlineLimit: 0 },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Keep the browser's Host header: the API blocks writes whose Origin host differs from Host, and a rewritten
    // Host (the proxy target) made every local write fail with "Cross-origin request blocked".
    proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
  },
});
