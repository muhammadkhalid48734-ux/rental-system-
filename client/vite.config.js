import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Fonts are served as real files (not data: URIs) so the CSP can stay font-src 'self'.
  build: { assetsInlineLimit: 0 },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
