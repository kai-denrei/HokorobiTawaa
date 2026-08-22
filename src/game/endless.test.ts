import { describe, it, expect } from 'vitest';
import { endlessWave, endlessHpScale } from './endless';

const KEYS = ['butterfly', 'ghost', 'scoutufo', 'gslime', 'shell', 'barbed'];

describe('endlessWave', () => {
  it('draws only from the provided enemy keys', () => {
    const groups = endlessWave(15, KEYS);
    for (const g of groups) expect(KEYS).toContain(g.key);
  });

  it('grows total enemy count with depth', () => {
    const total = (w: number) => endlessWave(w, KEYS).reduce((n, g) => n + g.count, 0);
    expect(total(20)).toBeGreaterThan(total(13));
    expect(total(40)).toBeGreaterThan(total(20));
  });

  it('adds variety (more distinct groups) as it deepens', () => {
    const variety = (w: number) => new Set(endlessWave(w, KEYS).map((g) => g.key)).size;
    expect(variety(30)).toBeGreaterThanOrEqual(variety(13));
  });

  it('is deterministic', () => {
    expect(endlessWave(25, KEYS)).toEqual(endlessWave(25, KEYS));
  });

  it('endlessHpScale increases monotonically past wave 12', () => {
    expect(endlessHpScale(20)).toBeGreaterThan(endlessHpScale(13));
    expect(endlessHpScale(13)).toBeGreaterThanOrEqual(1);
  });
});
