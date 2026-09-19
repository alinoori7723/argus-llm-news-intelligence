import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: process.env.ARGUS_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    css: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'domain-and-ui',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: { name: 'pipeline', environment: 'node', include: ['pipeline/**/*.test.ts'] },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['pipeline/**/*.ts'],
      exclude: ['pipeline/**/*.test.ts', 'pipeline/cli.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { statements: 95, branches: 80, functions: 95, lines: 95 },
    },
  },
});
