// radial-fit.ts — pure geometry that keeps the radial action ring on-screen.
//
// The ring's buttons sit at a fixed radius around the tap point, so near a
// screen edge the outer buttons overflow (the tap point itself can be in-bounds
// while a button 100px away is not). We lay the ring out at the tap, measure the
// union box of the buttons, then shift the WHOLE ring by the smallest offset
// that pulls that box inside the safe viewport rect. Shifting the ring (rather
// than clamping the centre) keeps every button reachable without distorting the
// circle. These helpers are the unit-tested core of that shift.

/** Smallest 1-D translation that moves the interval [min,max] inside [lo,hi].
 * If the interval is wider than the slot it can't fit — centre it so the
 * overflow is split evenly and nothing is cut off more than necessary. */
export function fitAxis(min: number, max: number, lo: number, hi: number): number {
  if (max - min > hi - lo) return (lo + hi) / 2 - (min + max) / 2; // too big: centre
  if (min < lo) return lo - min; // poking past the low edge → push in
  if (max > hi) return hi - max; // poking past the high edge → pull in
  return 0;
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number };
export type SafeRect = { l: number; t: number; r: number; btm: number };

/** The (dx,dy) that brings union box `b` inside safe rect `s`, per axis. */
export function fitShift(b: Box, s: SafeRect): { dx: number; dy: number } {
  return {
    dx: fitAxis(b.minX, b.maxX, s.l, s.r),
    dy: fitAxis(b.minY, b.maxY, s.t, s.btm),
  };
}
