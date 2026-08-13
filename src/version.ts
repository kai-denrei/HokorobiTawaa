// version.ts — build/version identity. `token` and `builtAt` are rewritten by
// scripts/bump-version.mjs on each build/save. The version badge surfaces this
// so a human can confirm at a glance that the freshest build actually loaded
// (the human-visible half of cache-busting).
export const BUILD = {
  version: '0.1.0',
  token: '20260814000041',
  builtAt: '2026-08-13T15:00:41.540Z',
} as const;
