import { describe, it, expect } from 'vitest';
import { buildWaves, newEnemyTypesByWave } from './game';

describe('newEnemyTypesByWave', () => {
  it('returns one entry per wave', () => {
    const waves = buildWaves();
    expect(newEnemyTypesByWave(waves)).toHaveLength(waves.length);
  });

  it('matches the intended introductions (wave 1 Bacteriophage, wave 2 adds Ghost, ...)', () => {
    const n = newEnemyTypesByWave(buildWaves());
    expect(n[0]).toEqual(['butterfly']); // Bacteriophage
    expect(n[1]).toEqual(['ghost']); // Wave Ghost
    expect(n[2]).toEqual(['scoutufo', 'gslime']);
    expect(n[3]).toEqual(['bslime', 'drifter']);
    expect(n[4]).toEqual(['shell']);
    expect(n[5]).toEqual(['barbed']);
    expect(n[6]).toEqual(['cloud', 'rolling']);
    expect(n[7]).toEqual(['knot', 'prime']);
  });

  it('emits nothing once every type has been introduced (late waves)', () => {
    const n = newEnemyTypesByWave(buildWaves());
    expect(n[8]).toEqual([]); // wave 9: drifter + barbed, both already seen
    expect(n[9]).toEqual([]);
    expect(n[10]).toEqual([]);
    expect(n[11]).toEqual([]);
  });

  it('never repeats a key across waves (each type announced once)', () => {
    const all = newEnemyTypesByWave(buildWaves()).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('derives fresh keys per wave on a synthetic schedule', () => {
    const waves = [
      [{ key: 'a', count: 1, interval: 1 }],
      [{ key: 'a', count: 1, interval: 1 }, { key: 'b', count: 1, interval: 1 }],
      [{ key: 'b', count: 1, interval: 1 }],
    ];
    expect(newEnemyTypesByWave(waves)).toEqual([['a'], ['b'], []]);
  });
});
