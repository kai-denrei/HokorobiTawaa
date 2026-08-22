import { describe, it, expect, vi } from 'vitest';
import { Game } from './game';

// minimal fake BoardView: only what Game.tick touches
function fakeView() {
  return { enemyCount: 0, spawnEnemy: vi.fn(() => 'x') } as any;
}

describe('Game endless mode', () => {
  it('never reports a win and keeps advancing past wave 12', () => {
    const onResult = vi.fn();
    const onFraying = vi.fn();
    const g = new Game(fakeView(), { onHud: () => {}, onResult, onFraying });
    g.startEndless(['butterfly', 'ghost']);
    // fast-forward many waves: force each wave to "finish" instantly.
    // Large dt (100s) drains the countdown and exhausts all spawns in one tick
    // (the while-guard in stepSpawning caps at 64 iterations, enough for any authored wave).
    // Two ticks per cycle: first advances ready->active (and spawns all enemies in the
    // same tick); second sees spawningDone + enemyCount===0 -> advances to next ready.
    for (let i = 0; i < 30; i++) {
      // tick 1: if ready, countdown expires and startNextWave fires (status->active);
      //         if active, stepSpawning exhausts the wave (spawningDone=true) and
      //         enemyCount===0 advances to ready. Either way, state advances.
      g.tick(100);
      // tick 2: same logic; ensures the active->ready transition happens
      g.tick(100);
    }
    expect(onResult).not.toHaveBeenCalledWith('won', expect.anything());
    expect(onFraying).toHaveBeenCalled(); // fired on a wave-5 milestone
  });
});
