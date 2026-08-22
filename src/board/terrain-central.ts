// terrain-central.ts — central-siege terrain pass (Endless mode). PURE.
// Base at the board centroid; up to `spawnCount` rim spawns spread by angle,
// each with a distinct BFS route to the base (accumulating `avoid`, exactly like
// typeTerrain's alt-paths). Sector 0 is the active start; 1+ start closed
// (interiors 'blocked') and open one per fraying milestone via openPath.

import type { Board, Cell, CellId, Sector } from './types';
import { bfsPath, cellsWithin } from './geometry';
import { mulberry32 } from './rng';

export type CentralParams = {
  spawnCount?: number;
  buildableRadius?: number;
  mountainFraction?: number;
};

const DEFAULTS: Required<CentralParams> = {
  spawnCount: 6,
  buildableRadius: 3,
  mountainFraction: 0.07,
};

export function typeCentralSiege(
  cells: Map<CellId, Cell>,
  seed: number,
  params: CentralParams = {},
): Board {
  const { spawnCount, buildableRadius, mountainFraction } = { ...DEFAULTS, ...params };
  if (cells.size < 8) throw new Error('typeCentralSiege: board too small (need >= 8 cells)');
  const rng = mulberry32((seed ^ 0x85ebca6b) >>> 0);

  // base = cell nearest the board centroid (0.5, 0.5)
  let base = -1;
  let bestD = Infinity;
  for (const c of cells.values()) {
    const d = (c.center[0] - 0.5) ** 2 + (c.center[1] - 0.5) ** 2;
    if (d < bestD) { bestD = d; base = c.id; }
  }

  // one candidate spawn per angular bucket: the rim-most cell in that wedge
  const buckets: { id: CellId; r: number }[][] = Array.from({ length: spawnCount }, () => []);
  for (const c of cells.values()) {
    if (c.id === base) continue;
    const dx = c.center[0] - 0.5;
    const dy = c.center[1] - 0.5;
    let ang = Math.atan2(dy, dx);
    if (ang < 0) ang += Math.PI * 2;
    const bkt = Math.min(spawnCount - 1, Math.floor((ang / (Math.PI * 2)) * spawnCount));
    buckets[bkt]!.push({ id: c.id, r: Math.hypot(dx, dy) });
  }
  const candidates: CellId[] = [];
  for (const bucket of buckets) {
    if (!bucket.length) continue;
    bucket.sort((a, b) => b.r - a.r || a.id - b.id);
    candidates.push(bucket[0]!.id);
  }

  // distinct BFS routes spawn->base (accumulating avoid, like typeTerrain alts)
  const sectors: Sector[] = [];
  const avoid = new Set<CellId>();
  for (const spawn of candidates) {
    const route = bfsPath(cells, spawn, base, avoid);
    if (!route || route.length < 3) continue;
    sectors.push({ spawn, route });
    for (const id of route.slice(1, -1)) avoid.add(id);
  }
  if (sectors.length === 0) throw new Error('typeCentralSiege: no spawn route to base');

  // paint terrain: default blocked, buildable band around ALL routes, then paths
  const mainRoute = sectors[0]!.route;
  const pathSet = new Set(mainRoute);
  const buildableSet = new Set<CellId>();
  for (const s of sectors) {
    for (const p of s.route) {
      for (const c of cellsWithin(cells, p, buildableRadius)) {
        if (!pathSet.has(c)) buildableSet.add(c);
      }
    }
  }
  for (const cell of cells.values()) cell.terrain = 'blocked';
  for (const id of buildableSet) cells.get(id)!.terrain = 'buildable';
  for (const id of pathSet) cells.get(id)!.terrain = 'path';

  // mountain scatter (deterministic, id-sorted)
  for (const id of [...buildableSet].sort((a, b) => a - b)) {
    if (rng() < mountainFraction) cells.get(id)!.terrain = 'blocked';
  }

  // sectors 1+ start CLOSED: interiors blocked; exposed as altPaths for openPath
  const altPaths: CellId[][] = [];
  for (let i = 1; i < sectors.length; i++) {
    for (const id of sectors[i]!.route.slice(1, -1)) cells.get(id)!.terrain = 'blocked';
    altPaths.push(sectors[i]!.route);
  }

  // spawn/base overwrite endpoints
  for (const s of sectors) cells.get(s.spawn)!.terrain = 'spawn';
  cells.get(base)!.terrain = 'base';

  return { cells, seed, spawns: sectors.map((s) => s.spawn), base, path: mainRoute, altPaths, sectors };
}
