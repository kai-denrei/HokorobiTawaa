// endless.ts — procedural wave composition for Endless mode (wave 13+). PURE +
// deterministic: no RNG, derived purely from the wave index so the same depth
// always produces the same wave. Escalates total count, variety, and tempo.

import type { SpawnGroup } from './game';

/** Composition for a 0-based `waveIndex` (call for indices >= 12 → wave 13+). */
export function endlessWave(waveIndex: number, enemyKeys: string[]): SpawnGroup[] {
  if (enemyKeys.length === 0) return [];
  const depth = Math.max(0, waveIndex - 11); // 1 at wave 13, 2 at 14, ...
  // total budget grows ~linearly; variety grows slowly (up to all keys)
  const budget = 14 + depth * 4;
  const variety = Math.min(enemyKeys.length, 2 + Math.floor(depth / 2));
  // pick `variety` keys, rotating by depth so successive waves feel different
  const picks: string[] = [];
  for (let i = 0; i < variety; i++) picks.push(enemyKeys[(depth + i) % enemyKeys.length]!);

  // floor: actual count is per*variety, slightly under budget — intentional
  const per = Math.max(3, Math.floor(budget / variety));
  const interval = Math.max(0.3, 0.75 - depth * 0.015); // spawns speed up with depth
  return picks.map((key) => ({ key, count: per, interval }));
}

/** Continuing HP multiplier for Endless waves past 12 (gentle, compounding). */
export function endlessHpScale(waveIndex: number): number {
  const depth = Math.max(0, waveIndex - 11);
  return 3.0 * 1.08 ** depth; // starts where HP_SCALE[11]=3.0 leaves off
}
