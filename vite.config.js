import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import stateHandler from './api/state.js';

function localStateApi() {
  return {
    name: 'local-state-api',
    configureServer(server) {
      server.middlewares.use('/api/state', (req, res, next) => {
        Promise.resolve(stateHandler(req, res)).catch(next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localStateApi()],
  optimizeDeps: { exclude: ['mongodb'] },
  ssr: { external: ['mongodb'] },
});
