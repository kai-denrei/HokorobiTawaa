import { describe, it, expect } from 'vitest';
import { generateBoard, bfsPath } from './index';
import type { Board, TerrainKey } from './index';

const SEEDS = [7, 42, 1337];
const TERRAINS: TerrainKey[] = ['blocked', 'path', 'buildable', 'spawn', 'base'];

function boards(): Board[] {
  return SEEDS.map((s) => generateBoard(s, { targetCells: 120 }));
}

describe('board generation', () => {
  it('produces a non-trivial cell count', () => {
    for (const b of boards()) {
      // ±40% tolerance around targetCells (mesh granularity is approximate)
      expect(b.cells.size).toBeGreaterThan(60);
      expect(b.cells.size).toBeLessThan(220);
    }
  });

  it('assigns every cell exactly one valid terrain', () => {
    for (const b of boards()) {
      for (const cell of b.cells.values()) {
        expect(TERRAINS).toContain(cell.terrain);
      }
    }
  });

  it('adjacency is symmetric and self-free', () => {
    for (const b of boards()) {
      for (const cell of b.cells.values()) {
        expect(cell.neighbors).not.toContain(cell.id);
        for (const n of cell.neighbors) {
          const other = b.cells.get(n);
          expect(other, `neighbor ${n} of ${cell.id} exists`).toBeDefined();
          expect(other!.neighbors).toContain(cell.id);
        }
      }
    }
  });

  it('has exactly one base and at least one spawn', () => {
    for (const b of boards()) {
      const bases = [...b.cells.values()].filter((c) => c.terrain === 'base');
      const spawns = [...b.cells.values()].filter((c) => c.terrain === 'spawn');
      expect(bases.length).toBe(1);
      expect(spawns.length).toBeGreaterThanOrEqual(1);
      expect(b.base).toBe(bases[0]!.id);
      expect(b.spawns).toContain(spawns[0]!.id);
    }
  });

  it('path connects spawn to base along adjacent cells', () => {
    for (const b of boards()) {
      const path = b.path;
      expect(path[0]).toBe(b.spawns[0]);
      expect(path[path.length - 1]).toBe(b.base);
      // consecutive path cells are adjacent
      for (let i = 1; i < path.length; i++) {
        expect(b.cells.get(path[i - 1]!)!.neighbors).toContain(path[i]!);
      }
      // interior path cells are terrain 'path'; endpoints are spawn/base
      for (let i = 1; i < path.length - 1; i++) {
        expect(b.cells.get(path[i]!)!.terrain).toBe('path');
      }
    }
  });

  it('base is reachable from spawn ignoring terrain', () => {
    for (const b of boards()) {
      expect(bfsPath(b.cells, b.spawns[0]!, b.base)).not.toBeNull();
    }
  });

  it('generates 0–2 alternate routes, each a distinct valid corridor', () => {
    for (const b of boards()) {
      expect(b.altPaths.length).toBeGreaterThanOrEqual(0);
      expect(b.altPaths.length).toBeLessThanOrEqual(2);
      const mainInterior = new Set(b.path.slice(1, -1));
      for (const alt of b.altPaths) {
        expect(alt[0]).toBe(b.spawns[0]);
        expect(alt[alt.length - 1]).toBe(b.base);
        expect(alt.length).toBeGreaterThanOrEqual(4);
        for (let i = 1; i < alt.length; i++) {
          expect(b.cells.get(alt[i - 1]!)!.neighbors).toContain(alt[i]!);
        }
        for (const id of alt.slice(1, -1)) expect(mainInterior.has(id)).toBe(false);
      }
      if (b.altPaths.length === 2) {
        const a0 = new Set(b.altPaths[0]!.slice(1, -1));
        for (const id of b.altPaths[1]!.slice(1, -1)) expect(a0.has(id)).toBe(false);
      }
    }
  });

  it('is deterministic: same seed => identical board', () => {
    for (const s of SEEDS) {
      const a = generateBoard(s, { targetCells: 120 });
      const c = generateBoard(s, { targetCells: 120 });
      expect(serialize(a)).toBe(serialize(c));
    }
  });
});

function serialize(b: Board): string {
  const ids = [...b.cells.keys()].sort((x, y) => x - y);
  return JSON.stringify({
    seed: b.seed,
    base: b.base,
    spawns: b.spawns,
    path: b.path,
    cells: ids.map((id) => {
      const c = b.cells.get(id)!;
      return [id, c.terrain, c.neighbors, c.center.map((v) => +v.toFixed(6))];
    }),
  });
}
