// geometry.ts — graph/BFS helpers over the cell adjacency graph. PURE.
// Pathing (enemy movement) and the lightning tower's chain both run as BFS over
// this graph, never over assumed grid coordinates. Adjacency is first-class.

import type { Cell, CellId } from './types';

export type CellMap = Map<CellId, Cell>;

function neighborsOf(cells: CellMap, id: CellId): CellId[] {
  const c = cells.get(id);
  if (!c) throw new Error(`geometry: unknown cell id ${id}`);
  return c.neighbors;
}

/**
 * BFS hop distance from `a` to every reachable cell (0 to self). Optionally
 * restrict traversal to cells for which `passable` returns true (the source is
 * always allowed as a start).
 */
export function bfsDistances(
  cells: CellMap,
  a: CellId,
  passable?: (id: CellId) => boolean,
): Map<CellId, number> {
  const dist = new Map<CellId, number>([[a, 0]]);
  let frontier: CellId[] = [a];
  while (frontier.length > 0) {
    const next: CellId[] = [];
    for (const id of frontier) {
      const d = dist.get(id)!;
      for (const n of neighborsOf(cells, id)) {
        if (dist.has(n)) continue;
        if (passable && !passable(n)) continue;
        dist.set(n, d + 1);
        next.push(n);
      }
    }
    frontier = next;
  }
  return dist;
}

/** BFS hop count a→b, or Infinity if unreachable. */
export function bfsDistance(cells: CellMap, a: CellId, b: CellId): number {
  if (a === b) return 0;
  const d = bfsDistances(cells, a);
  return d.has(b) ? d.get(b)! : Infinity;
}

/**
 * Shortest path a→b as an ordered [a, ..., b] cell list (parent-pointer
 * reconstruction), or null if unreachable. Neighbor iteration is id-sorted
 * (neighbors are pre-sorted), so the path is deterministic.
 */
export function bfsPath(cells: CellMap, a: CellId, b: CellId, avoid?: Set<CellId>): CellId[] | null {
  if (a === b) return [a];
  const parent = new Map<CellId, CellId>([[a, a]]);
  let frontier: CellId[] = [a];
  while (frontier.length > 0) {
    const next: CellId[] = [];
    for (const id of frontier) {
      for (const n of neighborsOf(cells, id)) {
        if (parent.has(n)) continue;
        if (avoid && n !== b && avoid.has(n)) continue;
        parent.set(n, id);
        if (n === b) {
          const path: CellId[] = [b];
          let cur = b;
          while (cur !== a) {
            cur = parent.get(cur)!;
            path.push(cur);
          }
          return path.reverse();
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

/** The two cells at (approximately) the graph diameter: double-BFS endpoints. */
export function diameterEndpoints(cells: CellMap, start: CellId): [CellId, CellId] {
  const far = (from: CellId): CellId => {
    const d = bfsDistances(cells, from);
    let best = from;
    let bestD = -1;
    // id-sorted iteration for determinism on ties
    for (const id of [...d.keys()].sort((x, y) => x - y)) {
      const dv = d.get(id)!;
      if (dv > bestD) {
        bestD = dv;
        best = id;
      }
    }
    return best;
  };
  const a = far(start);
  const b = far(a);
  return [a, b];
}

/** All cells within `hops` BFS steps of `from` (inclusive), id-sorted. */
export function cellsWithin(cells: CellMap, from: CellId, hops: number): CellId[] {
  const dist = new Map<CellId, number>([[from, 0]]);
  let frontier: CellId[] = [from];
  for (let d = 1; d <= hops && frontier.length > 0; d++) {
    const next: CellId[] = [];
    for (const id of frontier) {
      for (const n of neighborsOf(cells, id)) {
        if (dist.has(n)) continue;
        dist.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return [...dist.keys()].sort((x, y) => x - y);
}
