// game.ts — the play loop: a lives pool, timed escalating waves, and win/lose.
// Pure-ish game state driven by BoardView's per-frame tick; it spawns enemies
// through the view and reacts to leak callbacks. No rendering here.

import type { BoardView } from '../render/scene';
import type { Enemy } from '../units/unit';
import { START_GOLD, STREAK_STEP, STREAK_CAP } from '../units/roster';

export type GameStatus = 'ready' | 'active' | 'won' | 'lost';

export type HudState = {
  lives: number;
  gold: number;
  mult: number;
  wave: number; // 1-based; 0 before the first wave
  totalWaves: number;
  status: GameStatus;
  message: string;
};

export type GameCallbacks = {
  onHud: (s: HudState) => void;
  onResult: (status: 'won' | 'lost') => void;
};

type SpawnGroup = { key: string; count: number; interval: number };
type Wave = SpawnGroup[];

const START_LIVES = 15;
const START_DELAY = 8; // seconds before wave 1 (place your towers)
const BETWEEN_DELAY = 6; // seconds between waves

/** Per-wave HP multiplier (waves 1–6), applied to base enemy HP. */
const HP_SCALE = [1.0, 1.12, 1.25, 1.4, 1.55, 1.75];

/** Escalating waves; two deliberate "spike" waves force tower-type diversity. */
function buildWaves(): Wave[] {
  return [
    [{ key: 'butterfly', count: 10, interval: 0.55 }],
    [{ key: 'butterfly', count: 10, interval: 0.5 }, { key: 'shell', count: 4, interval: 0.9 }],
    [{ key: 'shell', count: 8, interval: 0.7 }, { key: 'cloud', count: 3, interval: 1.3 }], // spike: tanky
    [{ key: 'butterfly', count: 14, interval: 0.4 }, { key: 'ghost', count: 6, interval: 0.8 }],
    [{ key: 'knot', count: 3, interval: 1.6 }, { key: 'shell', count: 8, interval: 0.7 }], // spike: elites
    [
      { key: 'butterfly', count: 10, interval: 0.45 },
      { key: 'cloud', count: 4, interval: 1.2 },
      { key: 'ghost', count: 5, interval: 0.8 },
      { key: 'knot', count: 3, interval: 1.7 },
    ], // boss wave
  ];
}

export class Game {
  private waves: Wave[] = buildWaves();
  private lives = START_LIVES;
  private gold = START_GOLD;
  private streak = 0;
  private waveIndex = -1;
  private status: GameStatus = 'ready';
  private countdown = START_DELAY;

  // active-wave spawn cursor
  private groupIndex = 0;
  private spawnedInGroup = 0;
  private spawnTimer = 0;
  private spawningDone = false;

  constructor(
    private readonly view: BoardView,
    private readonly cb: GameCallbacks,
  ) {}

  /** Re-arm for a fresh board. */
  reset(): void {
    this.waves = buildWaves();
    this.lives = START_LIVES;
    this.gold = START_GOLD;
    this.streak = 0;
    this.waveIndex = -1;
    this.status = 'ready';
    this.countdown = START_DELAY;
    this.groupIndex = 0;
    this.spawnedInGroup = 0;
    this.spawnTimer = 0;
    this.spawningDone = false;
    this.emitHud();
  }

  /** One enemy reached the base: lose a life and reset the kill streak. */
  leak(): void {
    if (this.status === 'won' || this.status === 'lost') return;
    this.lives = Math.max(0, this.lives - 1);
    this.streak = 0;
    if (this.lives === 0) {
      this.status = 'lost';
      this.cb.onResult('lost');
    }
    this.emitHud();
  }

  /** An enemy was killed: grow the streak and award bounty × multiplier. */
  onKill(e: Enemy): void {
    if (this.status === 'won' || this.status === 'lost') return;
    this.streak++;
    this.gold += Math.round(e.bounty * this.multiplier());
    this.emitHud();
  }

  multiplier(): number {
    return Math.min(STREAK_CAP, 1 + STREAK_STEP * this.streak);
  }

  canAfford(cost: number): boolean {
    return this.gold >= cost;
  }

  /** Deduct `cost` if affordable; returns success. */
  spend(cost: number): boolean {
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.emitHud();
    return true;
  }

  addGold(n: number): void {
    this.gold += n;
    this.emitHud();
  }

  get goldNow(): number {
    return this.gold;
  }

  tick(dt: number): void {
    if (this.status === 'won' || this.status === 'lost') return;

    if (this.status === 'ready') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startNextWave();
      this.emitHud();
      return;
    }

    // active
    this.stepSpawning(dt);
    if (this.spawningDone && this.view.enemyCount === 0) {
      if (this.waveIndex >= this.waves.length - 1) {
        this.status = 'won';
        this.cb.onResult('won');
      } else {
        this.status = 'ready';
        this.countdown = BETWEEN_DELAY;
      }
    }
    this.emitHud();
  }

  private startNextWave(): void {
    this.waveIndex++;
    this.status = 'active';
    this.groupIndex = 0;
    this.spawnedInGroup = 0;
    this.spawnTimer = 0;
    this.spawningDone = false;
  }

  private stepSpawning(dt: number): void {
    if (this.spawningDone) return;
    const wave = this.waves[this.waveIndex]!;
    this.spawnTimer -= dt;
    // spawn as many as the elapsed time allows (usually one)
    let guard = 0;
    while (!this.spawningDone && this.spawnTimer <= 0 && guard++ < 64) {
      const group = wave[this.groupIndex]!;
      this.view.spawnEnemy(group.key, HP_SCALE[this.waveIndex] ?? 1);
      this.spawnedInGroup++;
      this.spawnTimer += group.interval;
      if (this.spawnedInGroup >= group.count) {
        this.groupIndex++;
        this.spawnedInGroup = 0;
        if (this.groupIndex >= wave.length) this.spawningDone = true;
      }
    }
  }

  private emitHud(): void {
    let message = '';
    if (this.status === 'ready') {
      const nextWave = Math.min(this.waveIndex + 2, this.waves.length);
      message = `Next wave ${nextWave} in ${Math.ceil(Math.max(0, this.countdown))}s`;
    } else if (this.status === 'active') {
      message = 'Wave in progress';
    } else if (this.status === 'won') {
      message = 'Victory';
    } else {
      message = 'Defeat';
    }
    this.cb.onHud({
      lives: this.lives,
      gold: this.gold,
      mult: this.multiplier(),
      wave: Math.max(0, this.waveIndex + 1),
      totalWaves: this.waves.length,
      status: this.status,
      message,
    });
  }
}
