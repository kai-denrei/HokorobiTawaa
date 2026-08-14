import { describe, it, expect } from 'vitest';
import type { Cell } from '../board';
import {
  toWorld,
  WALL_HEIGHT,
  cellRadius,
  insetPolygon,
  pointInPolygon,
  insetWorld,
  appendBlockWire,
  appendBlockSolid,
} from './coords';

// a unit square cell centered at (0.5, 0.5)
const square: Cell = {
  id: 0,
  center: [0.5, 0.5],
  polygon: [
    [0.4, 0.4],
    [0.6, 0.4],
    [0.6, 0.6],
    [0.4, 0.6],
  ],
  neighbors: [],
  terrain: 'buildable',
};

describe('coords', () => {
  it('toWorld recenters board [0,1]² to world [-0.5,0.5]² on XZ', () => {
    expect(toWorld([0, 0])).toEqual([-0.5, 0, -0.5]);
    expect(toWorld([0.5, 0.5])).toEqual([0, 0, 0]);
    expect(toWorld([1, 1])).toEqual([0.5, 0, 0.5]);
  });

  it('cellRadius is the mean center→vertex distance', () => {
    // all four verts are 0.1√2 from center
    expect(cellRadius(square)).toBeCloseTo(0.1 * Math.SQRT2, 6);
  });

  it('insetPolygon shrinks toward the centre (BLOCK_INSET)', () => {
    const inset = insetPolygon(square);
    // first vertex 0.4 → 0.5 + (0.4-0.5)*0.84 = 0.416
    expect(inset[0]![0]).toBeCloseTo(0.416, 6);
    expect(inset[0]![1]).toBeCloseTo(0.416, 6);
  });

  it('insetWorld = inset toward centre then toWorld', () => {
    const w = insetWorld(square, [0.4, 0.4]);
    expect(w[0]).toBeCloseTo(0.416 - 0.5, 6);
    expect(w[1]).toBe(0);
    expect(w[2]).toBeCloseTo(0.416 - 0.5, 6);
  });

  it('pointInPolygon: inside vs outside', () => {
    expect(pointInPolygon(0.5, 0.5, square.polygon)).toBe(true);
    expect(pointInPolygon(0.9, 0.9, square.polygon)).toBe(false);
  });

  it('appendBlockWire emits 3 line-segments (18 numbers) per edge', () => {
    const t: number[] = [];
    appendBlockWire(t, square);
    expect(t.length).toBe(square.polygon.length * 18);
    // all Y values are either 0 or WALL_HEIGHT
    for (let i = 1; i < t.length; i += 3) expect(t[i] === 0 || t[i] === WALL_HEIGHT).toBe(true);
  });

  it('appendBlockSolid emits 3 triangles (27 numbers) per edge', () => {
    const t: number[] = [];
    appendBlockSolid(t, square);
    expect(t.length).toBe(square.polygon.length * 27);
  });

  it('degenerate polygons (<3 verts) emit nothing', () => {
    const line: Cell = { ...square, polygon: [[0, 0], [1, 1]] };
    const w: number[] = [];
    const s: number[] = [];
    appendBlockWire(w, line);
    appendBlockSolid(s, line);
    expect(w.length).toBe(0);
    expect(s.length).toBe(0);
  });
});
