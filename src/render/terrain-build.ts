// terrain-build.ts — pure geometry assembly for the board terrain.
//
// Turns a Board into batched position arrays (one per material): raised
// buildable platforms + blocked walls (wire or solid) and the low path/spawn/
// base hallway outline. No Three.js, no scene state — BoardView feeds these into
// its LineSegments / Mesh builders. Pure, so it's cheap to re-run on the
// wire/solid toggle and unit-testable.

import type { Board } from '../board';
import { toWorld, appendBlockWire, appendBlockSolid } from './coords';

export type TerrainGeometry = {
  floorSegs: number[]; // path/spawn/base outlines (line segments)
  buildWire: number[]; // buildable platforms, wireframe
  buildTris: number[]; // buildable platforms, solid
  blockWire: number[]; // blocked walls, wireframe
  blockTris: number[]; // blocked walls, solid
};

/** Assemble batched terrain geometry. `solid` picks solid vs wireframe blocks. */
export function buildBoardGeometry(board: Board, solid: boolean): TerrainGeometry {
  const floorSegs: number[] = [];
  const buildWire: number[] = [];
  const buildTris: number[] = [];
  const blockWire: number[] = [];
  const blockTris: number[] = [];

  for (const cell of board.cells.values()) {
    if (cell.terrain === 'buildable') {
      if (solid) appendBlockSolid(buildTris, cell);
      else appendBlockWire(buildWire, cell);
    } else if (cell.terrain === 'blocked') {
      if (solid) appendBlockSolid(blockTris, cell);
      else appendBlockWire(blockWire, cell);
    } else {
      // path / spawn / base — low floor outline (the hallway enemies walk)
      const poly = cell.polygon;
      for (let i = 0; i < poly.length; i++) {
        const a = toWorld(poly[i]!);
        const b = toWorld(poly[(i + 1) % poly.length]!);
        floorSegs.push(a[0], 0, a[2], b[0], 0, b[2]);
      }
    }
  }

  return { floorSegs, buildWire, buildTris, blockWire, blockTris };
}
