import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // React/react-dom/react-router-dom/Firebase almost never change
        // between deploys, but the app's own code changes on every one -
        // without this they're all one chunk, so every deploy busts the
        // cache for the framework/SDK code too and everyone re-downloads
        // it. Splitting them into their own chunk means a routine deploy
        // only costs visitors the (much smaller) app-code chunk; the
        // vendor chunk stays cached across deploys until a dependency
        // actually changes.
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
