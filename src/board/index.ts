// src/board — public surface. PURE (no DOM). Game/render/input code imports
// only from here.

import type { Board } from './types';
import { generateCells } from './generate';
import { typeTerrain, type TerrainParams } from './terrain';

export type { Board, Cell, CellId, TerrainKey, Vec2 } from './types';
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
