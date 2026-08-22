import { describe, it, expect } from 'vitest';
import { dotLOD, LOD_NEAR, LOD_FAR, LOD_SIZE_MIN, LOD_BRIGHT_MIN } from './proximity';

describe('dotLOD', () => {
  it('is a no-op (factors 1) at and beyond LOD_FAR', () => {
    expect(dotLOD(LOD_FAR)).toEqual({ size: 1, bright: 1 });
    expect(dotLOD(LOD_FAR + 5)).toEqual({ size: 1, bright: 1 });
    expect(dotLOD(100)).toEqual({ size: 1, bright: 1 });
  });
  it('bottoms out at the floors at and within LOD_NEAR', () => {
    expect(dotLOD(LOD_NEAR)).toEqual({ size: LOD_SIZE_MIN, bright: LOD_BRIGHT_MIN });
    expect(dotLOD(0)).toEqual({ size: LOD_SIZE_MIN, bright: LOD_BRIGHT_MIN });
    expect(dotLOD(-1)).toEqual({ size: LOD_SIZE_MIN, bright: LOD_BRIGHT_MIN });
  });
  it('interpolates between the floor and 1 in the mid range', () => {
    const mid = dotLOD((LOD_NEAR + LOD_FAR) / 2);
    expect(mid.size).toBeGreaterThan(LOD_SIZE_MIN);
    expect(mid.size).toBeLessThan(1);
    expect(mid.bright).toBeGreaterThan(LOD_BRIGHT_MIN);
    expect(mid.bright).toBeLessThan(1);
  });
  it('is monotonic non-decreasing in distance (closer never brighter/bigger)', () => {
    let prevS = -1, prevB = -1;
    for (let d = 0; d <= LOD_FAR + 0.2; d += 0.05) {
      const { size, bright } = dotLOD(d);
      expect(size).toBeGreaterThanOrEqual(prevS);
      expect(bright).toBeGreaterThanOrEqual(prevB);
      prevS = size; prevB = bright;
    }
  });
  it('keeps all factors within (0, 1]', () => {
    for (let d = 0; d <= 3; d += 0.1) {
      const { size, bright } = dotLOD(d);
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(1);
      expect(bright).toBeGreaterThan(0);
      expect(bright).toBeLessThanOrEqual(1);
    }
  });
});
