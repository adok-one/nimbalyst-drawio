import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The suite runs in jsdom because almost nothing here is reachable without a `window`:
 * the extension talks to draw.io through an iframe and `postMessage`, resolves asset URLs
 * against `window.__workspacePath`, and reads files through `window.electronAPI`. Only the
 * two format modules (`drawio/templates`, `drawio/fileKind`) are pure, and running those in
 * jsdom too costs nothing.
 *
 * `restoreMocks` matters more than usual: several modules under test hold module-level
 * state (the preview singleton, the editor registry, the pending upload name), and a stub
 * left standing would be read by the next file rather than by the one that installed it.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The host provides this at runtime and `vite.config.ts` externalises it, so there is
      // no copy on disk to import. `tests/stubs/nimbalyst-runtime.ts` is what the suite
      // loads instead; see the note at the top of that file.
      '@nimbalyst/runtime': fileURLToPath(new URL('./tests/stubs/nimbalyst-runtime.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
    globals: false,
    coverage: {
      // Only the extension's own code. The build scripts have their own gate
      // (`validate:pack` opens the archive they produced), and files that are nothing but
      // types report 0% forever and drown out the number that means something.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/types/**', 'src/drawio/types.ts', 'src/**/index.ts'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 85,
        lines: 90,
      },
    },
  },
});
