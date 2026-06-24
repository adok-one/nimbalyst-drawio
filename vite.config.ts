import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const ROLLUP_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'lexical',
  // Resolve to the host's copies at runtime; never bundle these.
  /^@lexical\//,
  /^@nimbalyst\/runtime/,
];

export default defineConfig({
  mode: 'production',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [
    react({
      jsxRuntime: 'automatic',
      jsxImportSource: 'react',
    }),
  ],
  build: {
    lib: {
      entry: './src/index.tsx',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ROLLUP_EXTERNALS,
      output: {
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.some((n) => n.endsWith('.css'))) {
            return 'index.css';
          }
          return assetInfo.names?.[0] ?? 'asset';
        },
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
  },
});
