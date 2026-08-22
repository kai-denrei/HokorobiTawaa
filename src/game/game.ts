// game.ts — the play loop: a lives pool, timed escalating waves, and win/lose.
// Pure-ish game state driven by BoardView's per-frame tick; it spawns enemies
// through the view and reacts to leak callbacks. No rendering here.

import type { BoardView } from '../render/scene';
import type { Enemy } from '../units/unit';
import { START_GOLD, STREAK_STEP, STREAK_CAP } from '../units/roster';
import { endlessWave, endlessHpScale } from './endless';

export type GameStatus = 'ready' | 'active' | 'won' | 'lost';

export type HudState = {
  lives: number;
  maxLives: number;
  gold: number;
  mult: number;
  wave: number; // 1-based; 0 before the first wave
  totalWaves: number;
  loop: number; // 1-based; increments each Continue
  score: number; // cumulative kill value (bounty × mult), never spent
  status: GameStatus;
  message: string;
  endless: boolean;
};

/** End-of-run stats for the result screen. */
export type RunStats = {
  score: number;
  kills: number;
  loop: number;
  /** enemy unit-key → count killed this run (across loops). */
  killsByType: Record<string, number>;
  reachedWave: number;
  endless: boolean;
};

export type GameCallbacks = {
  onHud: (s: HudState) => void;
  onResult: (status: 'won' | 'lost', stats: RunStats) => void;
  /** Open alternate route `index` (0 after wave 6, 1 after wave 9). No-op in
   * the view if the board has no such alternate. */
  onOpenPath?: (index: number) => void;
  /** Fires shortly BEFORE a wave begins (during the pre-wave countdown) so the UI
   * can build anticipation. `wave` is 1-based; `newEnemyKeys` are the types this
   * wave introduces for the first time (empty if none / on Continue loops). */
  onWaveApproaching?: (wave: number, newEnemyKeys: string[]) => void;
  /** Endless: a new lane frayed open — reveal sector `sectorIndex` (>=1); the
   * `reinforcement` gold has just been granted so the UI can announce it. */
  onFraying?: (sectorIndex: number, reinforcement: number) => void;
};

export type SpawnGroup = { key: string; count: number; interval: number };
type Wave = SpawnGroup[];

const START_LIVES = 15;
const START_DELAY = 8; // seconds before wave 1 (place your towers)
const BETWEEN_DELAY = 6; // seconds between waves
const ANNOUNCE_LEAD = 4; // seconds before a wave to pop the "new threats" card
// Endless fraying pace + economy. The first extra lane opens at FRAY_FIRST_WAVE,
// then every FRAY_EVERY waves (gives economy runway before each new front). Each
// opening grants reinforcement gold (base + per-wave) so the new lane can be
// staffed without gutting the others.
const FRAY_FIRST_WAVE = 8;
const FRAY_EVERY = 7;
const REINFORCE_BASE = 130;
const REINFORCE_PER_WAVE = 8;

/** Per-wave HP multiplier, applied to base enemy HP. */
const HP_SCALE = [1.0, 1.1, 1.2, 1.32, 1.44, 1.56, 1.7, 1.9, 2.1, 2.35, 2.6, 3.0];

/** Global HP multiplier compounded once per completed loop (Continue). */
const LOOP_HP_MULT = 1.6;

/** After wave `N` (1-based) clears, open alternate route `index`. */
const PATH_OPENINGS: { afterWave: number; index: number }[] = [
  { afterWave: 6, index: 0 },
  { afterWave: 9, index: 1 },
];

/** For each wave (in order), the enemy keys it introduces that no earlier wave
 * used — i.e. the "new threats" this wave adds. Pure; drives the wave animatic. */
export function newEnemyTypesByWave(waves: Wave[]): string[][] {
  const seen = new Set<string>();
  return waves.map((wave) => {
    const fresh: string[] = [];
    for (const g of wave) if (!seen.has(g.key)) { seen.add(g.key); fresh.push(g.key); }
    return fresh;
  });
}

/** Escalating waves that introduce the new behaviours in turn. */
export function buildWaves(): Wave[] {
  return [
    [{ key: 'butterfly', count: 10, interval: 0.5 }], // agile intro
    [{ key: 'butterfly', count: 8, interval: 0.45 }, { key: 'ghost', count: 5, interval: 0.7 }],
    [{ key: 'scoutufo', count: 8, interval: 0.55 }, { key: 'gslime', count: 3, interval: 1.2 }], // healers arrive
    [{ key: 'bslime', count: 2, interval: 1.4 }, { key: 'butterfly', count: 12, interval: 0.35 }, { key: 'drifter', count: 3, interval: 0.9 }], // aura + erratic
    [{ key: 'shell', count: 6, interval: 0.7 }, { key: 'gslime', count: 4, interval: 1.0 }], // armored + healers
    [{ key: 'barbed', count: 4, interval: 1.1 }, { key: 'scoutufo', count: 6, interval: 0.5 }], // wave 6 — alt path 0 opens after
    [{ key: 'cloud', count: 3, interval: 1.3 }, { key: 'rolling', count: 2, interval: 1.8 }, { key: 'ghost', count: 6, interval: 0.6 }], // epic tanks
    [{ key: 'knot', count: 2, interval: 1.9 }, { key: 'prime', count: 1, interval: 1 }, { key: 'barbed', count: 3, interval: 1.2 }, { key: 'bslime', count: 2, interval: 1.4 }],
    [{ key: 'drifter', count: 4, interval: 0.8 }, { key: 'barbed', count: 4, interval: 1.0 }], // wave 9 — alt path 1 opens after
    [{ key: 'scoutufo', count: 8, interval: 0.4 }, { key: 'gslime', count: 5, interval: 0.9 }, { key: 'rolling', count: 3, interval: 1.6 }],
    [{ key: 'prime', count: 2, interval: 1.8 }, { key: 'cloud', count: 4, interval: 1.1 }, { key: 'bslime', count: 3, interval: 1.2 }],
    [{ key: 'knot', count: 3, interval: 1.6 }, { key: 'prime', count: 2, interval: 1.8 }, { key: 'barbed', count: 4, interval: 1.0 }, { key: 'rolling', count: 2, interval: 1.7 }], // finale
  ];
}

export class Game {
  private waves: Wave[] = buildWaves();
  private newTypes: string[][] = newEnemyTypesByWave(this.waves);
  private lives = START_LIVES;
  private gold = START_GOLD;
  private streak = 0;
  private score = 0;
  private killsByType: Record<string, number> = {};
  private waveIndex = -1;
  private announcedWave = -1; // upcoming wave index already announced (fire-once guard)
  private loop = 1;
  private status: GameStatus = 'ready';
  private countdown = START_DELAY;
  private endless = false;
  private enemyKeys: string[] = [];
  private endlessSectors = 1; // total sectors on the endless board (1 = no extra lanes)

  // active-wave spawn cursor
  private groupIndex = 0;
  private spawnedInGroup = 0;
  private spawnTimer = 0;
  private spawningDone = false;

  constructor(
    private readonly view: BoardView,
    private readonly cb: GameCallbacks,
  ) {}

  /** Re-arm for a fresh board (new run: loop 1, full economy reset). */
  reset(): void {
    this.waves = buildWaves();
    this.newTypes = newEnemyTypesByWave(this.waves);
    this.lives = START_LIVES;
    this.gold = START_GOLD;
    this.streak = 0;
    this.score = 0;
    this.killsByType = {};
    this.waveIndex = -1;
    this.announcedWave = -1;
    this.loop = 1;
    this.status = 'ready';
    this.countdown = START_DELAY;
    this.groupIndex = 0;
    this.spawnedInGroup = 0;
    this.spawnTimer = 0;
    this.spawningDone = false;
    this.endless = false;
    this.emitHud();
  }

  /** Continue after a victory: next 12-wave loop on the SAME board. Keeps gold
   * and all placed towers, refills lives, and compounds enemy HP by
   * LOOP_HP_MULT. Alternate paths opened earlier stay open. */
  continueRun(): void {
    if (this.status !== 'won') return;
    this.loop++;
    this.lives = START_LIVES;
    this.streak = 0;
    this.waveIndex = -1;
    this.announcedWave = -1;
    this.status = 'ready';
    this.countdown = BETWEEN_DELAY;
    this.groupIndex = 0;
    this.spawnedInGroup = 0;
    this.spawnTimer = 0;
    this.spawningDone = false;
    this.emitHud();
  }

  /** Begin an Endless run: authored waves 1-12 as the ramp, procedural after,
   * never wins (result only on lives-out). `enemyKeys` seeds procedural waves. */
  startEndless(enemyKeys: string[], sectorCount = 1): void {
    this.reset();
    this.endless = true;
    this.enemyKeys = enemyKeys;
    this.endlessSectors = Math.max(1, sectorCount);
  }

  /** One enemy reached the base: lose a life and reset the kill streak. */
  leak(): void {
    if (this.status === 'won' || this.status === 'lost') return;
    this.lives = Math.max(0, this.lives - 1);
    this.streak = 0;
    if (this.lives === 0) {
      this.status = 'lost';
      this.cb.onResult('lost', this.runStats());
    }
    this.emitHud();
  }

  /** An enemy was killed: grow the streak, award bounty × multiplier (to both
   * gold and the run score), and tally the kill by enemy type. */
  onKill(e: Enemy): void {
    if (this.status === 'won' || this.status === 'lost') return;
    this.streak++;
    const award = Math.round(e.bounty * this.multiplier());
    this.gold += award;
    this.score += award;
    this.killsByType[e.def.key] = (this.killsByType[e.def.key] ?? 0) + 1;
    this.emitHud();
  }

  private runStats(): RunStats {
    let kills = 0;
    for (const k in this.killsByType) kills += this.killsByType[k]!;
    return {
      score: this.score,
      kills,
      loop: this.loop,
      killsByType: { ...this.killsByType },
      reachedWave: Math.max(0, this.waveIndex + 1),
      endless: this.endless,
    };
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
      // Pop the "new threats" card a few seconds ahead of the wave (once each),
      // building anticipation before it actually starts.
      const upcoming = this.waveIndex + 1;
      if (upcoming < this.waves.length && this.announcedWave !== upcoming && this.countdown <= ANNOUNCE_LEAD) {
        this.announcedWave = upcoming;
        const fresh = this.loop === 1 ? (this.newTypes[upcoming] ?? []) : [];
        this.cb.onWaveApproaching?.(upcoming + 1, fresh);
      }
      if (this.countdown <= 0) this.startNextWave();
      this.emitHud();
      return;
    }

    // active
    this.stepSpawning(dt);
    if (this.spawningDone && this.view.enemyCount === 0) {
      if (!this.endless && this.waveIndex >= this.waves.length - 1) {
        this.status = 'won';
        this.cb.onResult('won', this.runStats());
      } else {
        this.status = 'ready';
        this.countdown = BETWEEN_DELAY;
        const justCleared = this.waveIndex + 1; // 1-based
        for (const o of PATH_OPENINGS) {
          if (o.afterWave === justCleared) this.cb.onOpenPath?.(o.index);
        }
      }
    }
    this.emitHud();
  }

  private startNextWave(): void {
    this.waveIndex++;
    // Endless: past the 12 authored waves, generate composition procedurally.
    if (this.endless && this.waveIndex >= this.waves.length) {
      this.waves[this.waveIndex] = endlessWave(this.waveIndex, this.enemyKeys);
    }
    // Fraying: first extra lane at FRAY_FIRST_WAVE, then every FRAY_EVERY waves —
    // only for lanes that exist. Each opening grants reinforcement gold so the new
    // front can be staffed without cannibalising the others.
    const wave = this.waveIndex + 1;
    if (this.endless && wave >= FRAY_FIRST_WAVE && (wave - FRAY_FIRST_WAVE) % FRAY_EVERY === 0) {
      const sector = (wave - FRAY_FIRST_WAVE) / FRAY_EVERY + 1;
      if (sector <= this.endlessSectors - 1) {
        const reinforcement = REINFORCE_BASE + wave * REINFORCE_PER_WAVE;
        this.gold += reinforcement;
        this.cb.onFraying?.(sector, reinforcement);
      }
    }
    this.status = 'active';
    this.groupIndex = 0;
    this.spawnedInGroup = 0;
    this.spawnTimer = 0;
    this.spawningDone = false;
    // (the new-threats card is fired during the pre-wave countdown; see tick)
  }

  private stepSpawning(dt: number): void {
    if (this.spawningDone) return;
    const wave = this.waves[this.waveIndex]!;
    this.spawnTimer -= dt;
    // spawn as many as the elapsed time allows (usually one)
    let guard = 0;
    while (!this.spawningDone && this.spawnTimer <= 0 && guard++ < 64) {
      const group = wave[this.groupIndex]!;
      const hpBase = this.endless && this.waveIndex >= 12
        ? endlessHpScale(this.waveIndex)
        : (HP_SCALE[this.waveIndex] ?? 1);
      const hp = hpBase * LOOP_HP_MULT ** (this.loop - 1);
      this.view.spawnEnemy(group.key, hp);
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
      maxLives: START_LIVES,
      gold: this.gold,
      mult: this.multiplier(),
      wave: Math.max(0, this.waveIndex + 1),
      totalWaves: this.waves.length,
      loop: this.loop,
      score: this.score,
      status: this.status,
      message,
      endless: this.endless,
    });
  }
}
