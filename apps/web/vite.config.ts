import { defineConfig } from 'vite';
import path from 'path';
import { readFileSync } from 'fs';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('/three/examples/') || id.includes('\\three\\examples\\')) return 'vendor-three-examples';
          if (id.includes('/three/') || id.includes('\\three\\')) return 'vendor-three';
          if (id.includes('three-pathfinding')) return 'vendor-pathfinding';
          if (id.includes('/cannon-es/') || id.includes('\\cannon-es\\')) return 'vendor-physics';
          if (id.includes('/ethers/') || id.includes('\\ethers\\')) return 'vendor-web3';
          if (id.includes('@noble') || id.includes('@scure') || id.includes('aes-js') || id.includes('uuid')) return 'vendor-crypto';
          if (id.includes('/spacetimedb/') || id.includes('\\spacetimedb\\')) return 'vendor-spacetime';
          if (id.includes('/webjsx/') || id.includes('\\webjsx\\') || id.includes('/nanostores/') || id.includes('\\nanostores\\')) return 'vendor-ui';
          if (id.includes('cbor2') || id.includes('bson') || id.includes('fast-png') || id.includes('iobuffer') || id.includes('fflate') || id.includes('@cto.af')) return 'vendor-codecs';
          if (id.includes('roslib') || id.includes('eventemitter3')) return 'vendor-robotics';
          if (id.includes('/snarkjs/') || id.includes('\\\\snarkjs\\\\') || id.includes('circomlibjs') || id.includes('ffjavascript')) return 'vendor-zk';

          return 'vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@b3js/engine': path.resolve(__dirname, '../../packages/engine/src/index.ts'),
      '@b3js/ui': path.resolve(__dirname, '../../packages/ui/src/index.tsx'),
      '@b3js/web3': path.resolve(__dirname, '../../packages/web3/src/index.ts'),
      '@b3js/zk': path.resolve(__dirname, '../../packages/zk/src/index.ts'),
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
        ws: true,
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
