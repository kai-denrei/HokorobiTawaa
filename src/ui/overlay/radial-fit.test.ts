import { describe, it, expect } from 'vitest';
import { fitAxis, fitShift } from './radial-fit';

describe('fitAxis', () => {
  it('no shift when the span already fits', () => {
    expect(fitAxis(20, 80, 0, 100)).toBe(0);
  });
  it('shifts right (positive) when the span pokes past the low edge', () => {
    // [-18, 42] into [0,100] → +18 to bring min to 0
    expect(fitAxis(-18, 42, 0, 100)).toBe(18);
  });
  it('shifts left (negative) when the span pokes past the high edge', () => {
    // [70, 130] into [0,100] → -30 to bring max to 100
    expect(fitAxis(70, 130, 0, 100)).toBe(-30);
  });
  it('centers (equal overflow) when the span is wider than the slot', () => {
    // span 200 into slot 100: centre both at 50 → shift = 50 - 100 = -50
    expect(fitAxis(0, 200, 0, 100)).toBe(-50);
  });
  it('is exact at the edges (touching low edge needs no shift)', () => {
    expect(fitAxis(0, 60, 0, 100)).toBe(0);
    expect(fitAxis(40, 100, 0, 100)).toBe(0);
  });
});

describe('fitShift', () => {
  it('returns per-axis shifts that bring the box inside the safe rect', () => {
    const box = { minX: -30, minY: 200, maxX: 50, maxY: 260 };
    const safe = { l: 0, t: 0, r: 300, btm: 240 };
    const { dx, dy } = fitShift(box, safe);
    expect(dx).toBe(30); // push right off the left edge
    expect(dy).toBe(-20); // pull up off the bottom edge
    // after shifting, the box is within bounds
    expect(box.minX + dx).toBeGreaterThanOrEqual(safe.l);
    expect(box.maxX + dx).toBeLessThanOrEqual(safe.r);
    expect(box.maxY + dy).toBeLessThanOrEqual(safe.btm);
  });
  it('is a no-op for a box already inside', () => {
    const box = { minX: 10, minY: 10, maxX: 90, maxY: 90 };
    const safe = { l: 0, t: 0, r: 100, btm: 100 };
    expect(fitShift(box, safe)).toEqual({ dx: 0, dy: 0 });
  });
  it('centers on both axes when the ring is larger than the safe rect (short landscape)', () => {
    // box 200x200 into a 100x120 slot offset at (0,40): split overflow evenly.
    const box = { minX: 0, minY: 0, maxX: 200, maxY: 200 };
    const safe = { l: 0, t: 40, r: 100, btm: 160 };
    const { dx, dy } = fitShift(box, safe);
    // x: centre 50 vs box centre 100 → -50 ; y: centre 100 vs box centre 100 → 0
    expect(dx).toBe(-50);
    expect(dy).toBe(0);
    // overflow is symmetric (equal past both edges), never all on one side
    expect(box.minX + dx).toBe(safe.l - 50);
    expect(box.maxX + dx).toBe(safe.r + 50);
  });
});
