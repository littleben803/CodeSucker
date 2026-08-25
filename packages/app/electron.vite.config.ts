import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import appPackage from './package.json';

const fromConfig = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: ['@codesucker/core'] },
      rollupOptions: {
        input: {
          index: fromConfig('./src/main/index.ts'),
          'pipeline-worker': fromConfig('./src/main/workers/pipeline-worker.ts'),
          'render-worker': fromConfig('./src/main/workers/render-worker.ts'),
        },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(appPackage.version),
    },
  },
});
