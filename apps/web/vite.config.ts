import { defineConfig } from 'vite';
import path from 'path';
import { readFileSync } from 'fs';

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
  plugins: [
    {
      name: 'serve-monorepo-assets',
      configureServer(server) {
        const assetsDir = path.resolve(__dirname, '../../assets');
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/models/') || req.url?.startsWith('/assets/')) {
            const relativePath = req.url.replace(/^\/assets\//, '').replace(/^\/models\//, 'models/');
            const filePath = path.join(assetsDir, relativePath);
            try {
              const data = readFileSync(filePath);
              res.end(data);
            } catch {
              res.statusCode = 404;
              res.end('Not found');
            }
            return;
          }
          next();
        });
      },
    },
  ],
});
