import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const logger = createLogger();
const originalWarn = logger.warn;
logger.warn = (msg, options) => {
  // Silence harmless missing sourcemap warnings from 3rd-party node_modules (@urql/core, etc.)
  if (msg.includes('points to missing source files')) {
    return;
  }
  originalWarn(msg, options);
};

const withSelectorShim = path.resolve(
  __dirname,
  'src/shims/use-sync-external-store-with-selector.js'
);
const styleToJsShim = path.resolve(
  __dirname,
  'src/shims/style-to-js.js'
);

// https://vite.dev/config/
export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^use-sync-external-store\/shim\/with-selector(\.js)?$/,
        replacement: withSelectorShim,
      },
      {
        find: /^use-sync-external-store\/with-selector(\.js)?$/,
        replacement: withSelectorShim,
      },
      {
        find: /^style-to-js(\/.*)?$/,
        replacement: styleToJsShim,
      },
    ],
  },
  server: {
    host: true,
    port: 5173,
    hmr: true,
    warmup: {
      clientFiles: ['./src/components/LegalWorkspace.tsx'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: [
      '@copilotkit/react-core',
      '@copilotkit/react-ui',
      '@copilotkit/react-textarea',
      '@tiptap/react',
      'debug',
    ],
    esbuildOptions: {
      loader: {
        '.woff': 'dataurl',
        '.woff2': 'dataurl',
        '.ttf': 'dataurl',
        '.eot': 'dataurl',
      },
    },
  },
});
