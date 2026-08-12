// hex.ts — hexagonal lattice seeder (Oskar Stålberg "Variant B"). PURE.
// Ported from STB_BruchmalysII/src/board/hex.ts. Deterministic by construction
// (no RNG). Kept for the optional 'hex' seeder; the board uses 'poisson'.

import type { Vec2 } from './types';

const SQRT3 = Math.sqrt(3);

export type HexLatticeParams = { rings: number; spacing?: number; center?: Vec2 };
export type HexLattice = { points: Vec2[]; boundary: number[] };

export function hexDistance(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

export function hexLattice({ rings, spacing = 0.1, center = [0, 0] }: HexLatticeParams): HexLattice {
  const R = rings | 0;
  if (!(R >= 1)) throw new Error(`hexLattice: rings must be an integer >= 1, got ${rings}`);

  const [cx, cy] = center;
  const e1x = spacing;
  const e1y = 0;
  const e2x = spacing / 2;
  const e2y = (spacing * SQRT3) / 2;

  const points: Vec2[] = [];
  const boundary: number[] = [];

  for (let q = -R; q <= R; q++) {
    const rLo = Math.max(-R, -q - R);
    const rHi = Math.min(R, -q + R);
    for (let r = rLo; r <= rHi; r++) {
      const x = cx + q * e1x + r * e2x;
      const y = cy + q * e1y + r * e2y;
      const idx = points.length;
      points.push([x, y]);
      if (hexDistance(q, r) === R) boundary.push(idx);
    }
  }

  return { points, boundary };
}
