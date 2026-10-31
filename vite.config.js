import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { appendFileSync } from 'node:fs';

// The e2e suite's preview runs with ASPIRANT_E2E=1 (playwright.config.ts,
// #9234). The /api proxy below forwards to localhost:8081, and on the cell that
// is the production aspirant-server, so a call no spec stubbed used to reach
// prod: its answer decided the spec, and an unauthenticated write
// (POST /api/logout, a public form) would have landed. Under ASPIRANT_E2E=1
// every /api call that reaches the server gets a local 503 instead. A stubbed
// call never gets here: page.route answers it in the browser. No spec reads a
// live backend, so there is no opt-in lane. ASPIRANT_E2E_REFUSED_LOG=<path>
// tallies each refused `METHOD url`, for finding which stub a red spec lacks.
export const E2E_ENV = 'ASPIRANT_E2E';
// The same test as the proxy key below: Vite proxies any URL that starts with
// '/api' (so `/apihealth` too), and the gate must refuse exactly that set.
const PROXIED = (url) => url.startsWith('/api');

export function e2eUnstubbedGate(req, res, next) {
  if (process.env[E2E_ENV] !== '1' || !PROXIED(req.url ?? '')) return next();
  const log = process.env.ASPIRANT_E2E_REFUSED_LOG;
  if (log) {
    try {
      appendFileSync(log, `${req.method} ${req.url}\n`);
    } catch {
      // A tally is a diagnostic; the refusal stands either way.
    }
  }
  res.statusCode = 503;
  res.setHeader('Content-Type', 'text/plain');
  res.end(`e2e: unstubbed ${req.method} ${req.url} refused; stub it with page.route (#9234)`);
}

// Registered directly (not returned), so it runs before Vite's own proxy
// middleware, in both `vite` and `vite preview`.
function e2eFailClosed() {
  return {
    name: 'aspirant-e2e-fail-closed',
    configureServer(server) {
      server.middlewares.use(e2eUnstubbedGate);
    },
    configurePreviewServer(server) {
      server.middlewares.use(e2eUnstubbedGate);
    },
  };
}

export default defineConfig({
  plugins: [vue(), e2eFailClosed()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || '8081'}`,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        },
      },
    },
  },
});
