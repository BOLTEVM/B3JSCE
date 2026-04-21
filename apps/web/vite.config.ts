import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@b3js/engine': path.resolve(__dirname, '../../packages/engine/src/index.ts'),
      '@b3js/ui': path.resolve(__dirname, '../../packages/ui/src/index.tsx'),
      '@b3js/web3': path.resolve(__dirname, '../../packages/web3/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    fs: {
      strict: false,
      allow: ['..'],
    },
    proxy: {
      '/api/hardware': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
});
