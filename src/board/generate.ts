// generate.ts — mesh → game-facing cells. PURE and deterministic.
// Adapted from STB_BruchmalysII/src/board/generate.ts. The mesh pipeline is
// ported verbatim; the terrain typing pass (terrain.ts) runs on top.
//
// Cell ids are stable: index in generation order (= ascending primary-vertex
// index of the dual extraction).

import type { Cell, CellId, Vec2 } from './types';
import type { Mesh } from './grid';
import { generateMesh, relax } from './grid';
import { buildHalfEdge } from './halfedge';
import { extractDualCells } from './dual';

/** Empirical: dualCellCount ≈ CELL_DENSITY / r² (measured in oskar-procedure). */
const CELL_DENSITY = 2.45;
const SIDE_LENGTH_FACTOR = 0.6;
const RELAX_ITERS = 100;

export function poissonRadiusFor(targetCells: number): number {
  if (!Number.isFinite(targetCells) || targetCells < 4) {
    throw new Error(`generate: targetCells must be a number >= 4, got ${targetCells}`);
  }
  return Math.sqrt(CELL_DENSITY / targetCells);
}

/**
 * Extract game-facing cells from a finalized (relaxed) mesh.
 * - One cell per interior primary vertex (≥3 incident quads).
 * - polygon = incident quad centroids (CCW).
 * - Adjacency: EDGE-only — cells whose primary vertices share a quad edge (i.e.
 *   whose dual polygons share a full edge). Corner-only (diagonal) neighbours
 *   are deliberately NOT linked, so units can't cut through corners and every
 *   BFS path is a continuous open corridor (consecutive cells share an edge).
 * - terrain defaults to 'buildable'; terrain.ts overwrites it.
 */
export function extractCells(mesh: Mesh): Map<CellId, Cell> {
  const halfEdge = buildHalfEdge(mesh);
  const { cells: dualCells } = extractDualCells(mesh, halfEdge);

  const idByVertex = new Map<number, CellId>();
  dualCells.forEach((dc, i) => idByVertex.set(dc.vertexIndex, i));

  const neighborSets: Set<CellId>[] = dualCells.map(() => new Set<CellId>());

  // Edge adjacency ONLY: any quad edge (a,b) with both endpoints interior.
  for (const q of mesh.quads) {
    for (let i = 0; i < 4; i++) {
      const a = q[i as 0 | 1 | 2 | 3];
      const b = q[((i + 1) % 4) as 0 | 1 | 2 | 3];
      const ca = idByVertex.get(a);
      const cb = idByVertex.get(b);
      if (ca === undefined || cb === undefined || ca === cb) continue;
      neighborSets[ca]!.add(cb);
      neighborSets[cb]!.add(ca);
    }
  }

  const cells = new Map<CellId, Cell>();
  dualCells.forEach((dc, i) => {
    cells.set(i, {
      id: i,
      center: [...dc.center] as Vec2,
      polygon: dc.centroids.map((p) => [...p] as Vec2),
      neighbors: [...neighborSets[i]!].sort((x, y) => x - y),
      terrain: 'buildable',
    });
  });
  return cells;
}

/** Generate + relax mesh, extract game-facing cells (all 'buildable'). */
export function generateCells(seed: number, targetCells: number): Map<CellId, Cell> {
  const r = poissonRadiusFor(targetCells);
  const mesh = generateMesh({ seed, r });
  relax(mesh, { n_iters: RELAX_ITERS, SIDE_LENGTH: SIDE_LENGTH_FACTOR * r });
  return extractCells(mesh);
}
