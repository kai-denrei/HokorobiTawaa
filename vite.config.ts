import { defineConfig } from 'vitest/config';

// base: './' so the built PWA works from any path (local preview, static host).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Fingerprinted asset filenames are Vite's default in prod; the cache-busting
    // layer adds an explicit build token on top (see src/version.ts + scripts/bump-version.mjs).
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
