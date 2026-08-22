// src/board — public surface. PURE (no DOM). Game/render/input code imports
// only from here.

import type { Board } from './types';
import { generateCells } from './generate';
import { typeTerrain, type TerrainParams } from './terrain';
import { typeCentralSiege } from './terrain-central';

export type { Board, Cell, CellId, TerrainKey, Vec2, Sector } from './types';
export {
  bfsDistance,
  bfsDistances,
  bfsPath,
  cellsWithin,
  diameterEndpoints,
} from './geometry';
export type { CellMap } from './geometry';
export { generateCells, extractCells, poissonRadiusFor } from './generate';
export { typeTerrain } from './terrain';
export type { TerrainParams } from './terrain';
export { mulberry32 } from './rng';
export { typeCentralSiege } from './terrain-central';
export type { CentralParams } from './terrain-central';

export type GenerateBoardParams = TerrainParams & { targetCells?: number };

/**
 * One call: procedural organic mesh → adjacency graph → terrain typing → Board.
 * Deterministic: same (seed, params) → identical Board.
 */
export function generateBoard(seed: number, params: GenerateBoardParams = {}): Board {
  const { targetCells = 120, ...terrain } = params;
  const cells = generateCells(seed, targetCells);
  return typeTerrain(cells, seed, terrain);
}

/** Central-siege board for Endless mode: heart at centre, rim spawns, sectors. */
export function generateEndlessBoard(
  seed: number,
  params: { targetCells?: number; spawnCount?: number } = {},
): Board {
  const { targetCells = 300, spawnCount = 6 } = params;
  const cells = generateCells(seed, targetCells);
  return typeCentralSiege(cells, seed, { spawnCount });
}
