// terrain.ts — terrain typing pass (board.md). PURE and deterministic.
// Runs on top of the ported mesh: assigns each cell exactly one terrain type.
//
//   1. spawn & base = graph-diameter endpoints (far apart).
//   2. path = BFS shortest route spawn→base (these cells become 'path').
//   3. buildable = cells within BUILDABLE_RADIUS hops of any path cell.
//   4. blocked = everything else (mountains), plus a seeded scatter of mountains
//      carved out of the buildable band for variety.
//   5. spawn/base cells overwrite their path endpoints.
//
// V1 uses a FIXED path (no tower-blocking maze), so blocked cells never affect
// enemy routing — they only gate tower placement and add terrain silhouette.

import type { Board, Cell, CellId } from './types';
import { bfsPath, cellsWithin, diameterEndpoints } from './geometry';
import { mulberry32 } from './rng';

export type TerrainParams = {
  /** Hops from the path that stay buildable. */
  buildableRadius?: number;
  /** Fraction of buildable cells randomly converted to blocked mountains. */
  mountainFraction?: number;
};

const DEFAULTS: Required<TerrainParams> = {
  buildableRadius: 2,
  mountainFraction: 0.18,
};

/**
 * Assign terrain to a freshly-extracted cell map (all 'buildable') and return a
 * finished Board. Mutates `cells` in place (terrain fields) and returns the
 * Board wrapper with spawns/base/path resolved.
 *
 * Determinism: same (cells, seed) → same terrain. Uses its own rng stream
 * derived from the board seed so it doesn't disturb mesh generation.
 */
export function typeTerrain(
  cells: Map<CellId, Cell>,
  seed: number,
  params: TerrainParams = {},
): Board {
  const { buildableRadius, mountainFraction } = { ...DEFAULTS, ...params };
  if (cells.size < 4) throw new Error('typeTerrain: board too small (need >= 4 cells)');

  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

  // Start diameter search from the lowest id present (deterministic).
  const startId = [...cells.keys()].sort((a, b) => a - b)[0]!;
  const [spawn, base] = diameterEndpoints(cells, startId);

  const path = bfsPath(cells, spawn, base);
  if (!path || path.length < 2) {
    throw new Error('typeTerrain: no path between spawn and base (disconnected board)');
  }

  const pathSet = new Set(path);

  // buildable band around the path
  const buildableSet = new Set<CellId>();
  for (const p of path) {
    for (const c of cellsWithin(cells, p, buildableRadius)) {
      if (!pathSet.has(c)) buildableSet.add(c);
    }
  }

  // everything: default to blocked, then paint path / buildable
  for (const cell of cells.values()) cell.terrain = 'blocked';
  for (const id of buildableSet) cells.get(id)!.terrain = 'buildable';
  for (const id of pathSet) cells.get(id)!.terrain = 'path';

  // seeded mountain scatter carved out of buildable cells (id-sorted for determinism)
  const buildableSorted = [...buildableSet].sort((a, b) => a - b);
  for (const id of buildableSorted) {
    if (rng() < mountainFraction) cells.get(id)!.terrain = 'blocked';
  }

  // spawn/base overwrite their path endpoints
  cells.get(spawn)!.terrain = 'spawn';
  cells.get(base)!.terrain = 'base';

  return { cells, seed, spawns: [spawn], base, path };
}
