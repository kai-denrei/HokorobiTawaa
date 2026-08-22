import { describe, it, expect } from 'vitest';
import { generateCells } from './generate';
import { typeCentralSiege } from './terrain-central';

function centralBoard(seed: number, spawnCount = 6) {
  const cells = generateCells(seed, 300);
  return typeCentralSiege(cells, seed, { spawnCount });
}

describe('typeCentralSiege', () => {
  it('puts the base at the centre-most cell', () => {
    const b = centralBoard(1);
    const baseCell = b.cells.get(b.base)!;
    const dBase = Math.hypot(baseCell.center[0] - 0.5, baseCell.center[1] - 0.5);
    for (const c of b.cells.values()) {
      const d = Math.hypot(c.center[0] - 0.5, c.center[1] - 0.5);
      expect(dBase).toBeLessThanOrEqual(d + 1e-9);
    }
  });

  it('produces sectors, each with a route from its spawn to the base', () => {
    const b = centralBoard(2);
    expect(b.sectors!.length).toBeGreaterThanOrEqual(3);
    for (const s of b.sectors!) {
      expect(s.route[0]).toBe(s.spawn);
      expect(s.route[s.route.length - 1]).toBe(b.base);
      expect(s.route.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('exposes sector 0 as the active main path; 1+ as closed altPaths', () => {
    const b = centralBoard(3);
    expect(b.path).toEqual(b.sectors![0]!.route);
    expect(b.altPaths.length).toBe(b.sectors!.length - 1);
    // closed sectors' interiors are blocked terrain
    for (let i = 1; i < b.sectors!.length; i++) {
      for (const id of b.sectors![i]!.route.slice(1, -1)) {
        expect(['blocked', 'path']).toContain(b.cells.get(id)!.terrain);
      }
    }
  });

  it('spreads spawns around the rim (distinct, away from centre)', () => {
    const b = centralBoard(4);
    const spawns = b.sectors!.map((s) => s.spawn);
    expect(new Set(spawns).size).toBe(spawns.length); // all distinct
    for (const id of spawns) {
      const c = b.cells.get(id)!;
      expect(Math.hypot(c.center[0] - 0.5, c.center[1] - 0.5)).toBeGreaterThan(0.15);
    }
  });

  it('is deterministic', () => {
    const a = centralBoard(7);
    const b = centralBoard(7);
    expect(a.sectors!.map((s) => s.route)).toEqual(b.sectors!.map((s) => s.route));
  });

  it('is best-effort: high spawnCount never throws, just yields fewer', () => {
    expect(() => centralBoard(9, 12)).not.toThrow();
  });
});
