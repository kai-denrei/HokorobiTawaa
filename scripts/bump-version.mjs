#!/usr/bin/env node
// bump-version.mjs — cache-busting build token.
// Rewrites BUILD.token / BUILD.builtAt in src/version.ts and CACHE_VERSION in
// public/sw.js to a fresh timestamp token, so every build invalidates stale
// caches and the in-app version badge reflects the newest build.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const token = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const builtAt = now.toISOString();

const versionPath = join(root, 'src/version.ts');
let v = readFileSync(versionPath, 'utf8');
v = v.replace(/token:\s*'[^']*'/, `token: '${token}'`);
v = v.replace(/builtAt:\s*'[^']*'/, `builtAt: '${builtAt}'`);
writeFileSync(versionPath, v);

const swPath = join(root, 'public/sw.js');
let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_VERSION = '[^']*'/, `const CACHE_VERSION = 'hk-${token}'`);
writeFileSync(swPath, sw);

console.log(`bumped build token -> ${token} (${builtAt})`);
