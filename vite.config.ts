import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5180,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8800',
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8800',
        ws: true,
      },
      '/models': {
        target: 'http://127.0.0.1:8800',
        changeOrigin: true,
      },
      '/audio': {
        target: 'http://127.0.0.1:8800',
        changeOrigin: true,
      },
    },
  },
  // the Cubism framework is vendored as TypeScript source rather than a package,
  // so it is compiled alongside our own code
  optimizeDeps: { exclude: ['@framework'] },
  build: { target: 'es2020' },
});
