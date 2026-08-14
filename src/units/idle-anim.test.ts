import { describe, it, expect } from 'vitest';
import { SOLVE_MOVES, solveCycle, applyMoves } from './idle-anim';

describe('idle-anim (solving)', () => {
  it('SOLVE_MOVES is a deterministic 12-move sequence with valid axes/layers', () => {
    expect(SOLVE_MOVES.length).toBe(12);
    for (const m of SOLVE_MOVES) {
      expect([0, 1, 2]).toContain(m.axis);
      expect([-1, -1 / 3, 1 / 3]).toContain(m.lo);
      expect(Math.abs(m.ang)).toBeCloseTo(Math.PI / 2, 9);
      expect(m.hi).toBeCloseTo(m.lo + 2 / 3 + 1e-4, 9);
    }
  });

  it('solveCycle is all-zero at t=0 and loops (t == period → t=0)', () => {
    const count = SOLVE_MOVES.length;
    const slotDur = 0.42, rest = 1.2;
    const period = 2 * count * slotDur + rest;
    expect(solveCycle(0, count, slotDur, rest).every((a) => a === 0)).toBe(true);
    expect(solveCycle(period, count, slotDur, rest)).toEqual(solveCycle(0, count, slotDur, rest));
  });

  it('applyMoves is identity when all amounts are zero', () => {
    const zero = new Array(SOLVE_MOVES.length).fill(0);
    const [x, y, z] = applyMoves(0.3, -0.4, 0.5, zero);
    expect([x, y, z]).toEqual([0.3, -0.4, 0.5]);
  });

  it('applyMoves is deterministic for a given (point, amounts)', () => {
    const amt = solveCycle(1.7, SOLVE_MOVES.length, 0.42, 1.2);
    const a = applyMoves(0.2, 0.6, -0.3, amt).slice();
    const b = applyMoves(0.2, 0.6, -0.3, amt).slice();
    expect(a).toEqual(b);
  });
});
