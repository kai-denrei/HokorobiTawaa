// poisson.ts — Bridson Poisson-disk sampling in normalized [0,1]² space. PURE.
// Ported from STB_BruchmalysII/src/board/poisson.ts (from oskar-procedure).
// The PRNG is INJECTED so results are reproducible by seed. Returns [x,y]
// points, inset from the boundary by ·0.85 + 0.075.

import type { Vec2 } from './types';
import type { Rng } from './rng';
import { dist } from './vec';

export type PoissonParams = { r?: number; k?: number };

export function poissonDisk(rng: Rng, { r = 0.1, k = 30 }: PoissonParams = {}): Vec2[] {
  const cellSize = r / Math.SQRT2; // ≤1 point per cell
  const gridW = Math.ceil(1 / cellSize);
  const gridH = Math.ceil(1 / cellSize);
  const grid = new Int32Array(gridW * gridH).fill(-1);

  const points: Vec2[] = [];
  const active: number[] = [];

  const cellIndex = (x: number, y: number): number => {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    return row * gridW + col;
  };

  const x0 = rng();
  const y0 = rng();
  points.push([x0, y0]);
  grid[cellIndex(x0, y0)] = 0;
  active.push(0);

  while (active.length > 0) {
    const s = active.shift()!;
    const [sx, sy] = points[s]!;

    let found = false;
    for (let i = 0; i < k; i++) {
      const theta = rng() * Math.PI * 2;
      const rad = rng() * r + r;
      const x2 = sx + rad * Math.cos(theta);
      const y2 = sy + rad * Math.sin(theta);
      if (x2 < 0 || y2 < 0 || x2 > 1 || y2 > 1) continue;

      const col = Math.floor(x2 / cellSize);
      const row = Math.floor(y2 / cellSize);
      if (grid[row * gridW + col]! >= 0) continue;

      let tooClose = false;
      for (let jr = Math.max(0, row - 2); jr <= Math.min(gridH - 1, row + 2) && !tooClose; jr++) {
        for (let jc = Math.max(0, col - 2); jc <= Math.min(gridW - 1, col + 2); jc++) {
          const idx = grid[jr * gridW + jc]!;
          if (idx >= 0 && dist([x2, y2], points[idx]!) <= r) {
            tooClose = true;
            break;
          }
        }
      }

      if (!tooClose) {
        const newIdx = points.length;
        points.push([x2, y2]);
        grid[row * gridW + col] = newIdx;
        active.push(newIdx);
        found = true;
        break;
      }
    }

    if (found) active.unshift(s);
  }

  return points.map(([x, y]): Vec2 => [x * 0.85 + 0.075, y * 0.85 + 0.075]);
}
