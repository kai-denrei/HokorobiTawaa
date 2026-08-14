// idle-anim.ts — the 'solving' idle: a Rubik band-turn engine ported from
// Braille "Primitives". A fixed sequence of axis-slab quarter-turns is applied
// and un-applied in a loop, so a point cloud reads as a cube being solved. Pure
// + deterministic (seeded by a hash, no Date/Math.random), so it lives apart
// from the Unit render class and is unit-testable.

type CubeMove = { axis: number; lo: number; hi: number; ang: number };

function hashD(a: number, b: number): number {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function makeCubeMoves(count: number): CubeMove[] {
  const layers = [-1, -1 / 3, 1 / 3];
  const moves: CubeMove[] = [];
  for (let i = 0; i < count; i++) {
    const axis = Math.min(2, Math.floor(hashD(i, 2.3) * 3));
    const lo = layers[Math.min(2, Math.floor(hashD(i, 5.9) * 3))]!;
    const dir = hashD(i, 7.7) < 0.5 ? 1 : -1;
    moves.push({ axis, lo, hi: lo + 2 / 3 + 1e-4, ang: (dir * Math.PI) / 2 });
  }
  return moves;
}

/** The fixed 12-move sequence the 'solving' idle plays. */
export const SOLVE_MOVES = makeCubeMoves(12);

/** Per-move turn amounts at time `time`: ramp each move in, hold, then ramp out. */
export function solveCycle(time: number, count: number, slotDur: number, rest: number): number[] {
  const cyc = 2 * count * slotDur + rest;
  const tc = ((time % cyc) + cyc) % cyc;
  const amount = new Array<number>(count).fill(0);
  if (tc < 2 * count * slotDur) {
    const slot = Math.floor(tc / slotDur);
    const p = (tc - slot * slotDur) / slotDur;
    const cl = Math.min(1, p / 0.7);
    const ep = 1 - (1 - cl) ** 3;
    if (slot < count) {
      for (let i = 0; i < slot; i++) amount[i] = 1;
      amount[slot] = ep;
    } else {
      const u = 2 * count - 1 - slot;
      for (let i = 0; i < u; i++) amount[i] = 1;
      amount[u] = 1 - ep;
    }
  }
  return amount;
}

// Reused output tuple — the caller reads x/y/z immediately, so sharing it avoids
// an allocation per point per frame.
const SOLVE_OUT: [number, number, number] = [0, 0, 0];

/** Apply the active band-turns to one point. Returns a SHARED tuple (read it
 * before the next call). */
export function applyMoves(x: number, y: number, z: number, amount: number[]): [number, number, number] {
  for (let i = 0; i < SOLVE_MOVES.length; i++) {
    const a0 = amount[i]!;
    if (a0 <= 0) continue;
    const mv = SOLVE_MOVES[i]!;
    const coord = mv.axis === 0 ? x : mv.axis === 1 ? y : z;
    if (coord < mv.lo || coord >= mv.hi) continue;
    const a = mv.ang * a0;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (mv.axis === 0) { const y2 = y * ca - z * sa; z = y * sa + z * ca; y = y2; }
    else if (mv.axis === 1) { const x2 = x * ca + z * sa; z = -x * sa + z * ca; x = x2; }
    else { const x2 = x * ca - y * sa; y = x * sa + y * ca; x = x2; }
  }
  SOLVE_OUT[0] = x; SOLVE_OUT[1] = y; SOLVE_OUT[2] = z;
  return SOLVE_OUT;
}
