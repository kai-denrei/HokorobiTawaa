import { describe, it, expect, vi } from 'vitest';
import { Game } from './game';

// minimal fake BoardView: only what Game.tick touches
function fakeView() {
  return { enemyCount: 0, spawnEnemy: vi.fn(() => 'x') } as any;
}

describe('Game endless mode', () => {
  it('never wins, advances past wave 12, and frays lanes with reinforcement gold', () => {
    const onResult = vi.fn();
    const onFraying = vi.fn();
    const hudWaves: number[] = [];
    const g = new Game(fakeView(), {
      onHud: (s) => hudWaves.push(s.wave),
      onResult,
      onFraying,
    });
    // 6 sectors → 5 fray-able lanes.
    g.startEndless(['butterfly', 'ghost', 'scoutufo'], 6);
    // Fast-forward many waves. Large dt (100s) drains the countdown and exhausts
    // all spawns in one tick; two ticks per cycle advance ready->active->ready.
    for (let i = 0; i < 40; i++) {
      g.tick(100);
      g.tick(100);
    }

    // no win; procedural sourcing engaged past wave 12
    expect(onResult).not.toHaveBeenCalledWith('won', expect.anything());
    expect(Math.max(...hudWaves)).toBeGreaterThan(12);

    // fraying fired at least twice, first lane is sector 1 (i.e. at wave 8 given
    // the FRAY_FIRST_WAVE=8 / FRAY_EVERY=7 schedule)
    const calls = onFraying.mock.calls as [number, number][];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]![0]).toBe(1);

    // every fraying granted reinforcement gold, rising with depth
    expect(calls.every(([, gold]) => gold > 0)).toBe(true);
    expect(calls[calls.length - 1]![1]).toBeGreaterThan(calls[0]![1]);

    // capped at the 5 fray-able lanes — no infinite free gold after all open
    expect(calls.length).toBeLessThanOrEqual(5);
    const sectors = calls.map((c) => c[0]);
    expect(sectors).toEqual([...sectors].sort((a, b) => a - b)); // open in order
    expect(new Set(sectors).size).toBe(sectors.length); // each opens once
  });

  it('frays no lanes when the board has a single sector', () => {
    const onFraying = vi.fn();
    const g = new Game(fakeView(), { onHud: () => {}, onResult: vi.fn(), onFraying });
    g.startEndless(['butterfly'], 1);
    for (let i = 0; i < 30; i++) { g.tick(100); g.tick(100); }
    expect(onFraying).not.toHaveBeenCalled();
  });
});
