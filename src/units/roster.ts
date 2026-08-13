// roster.ts — which ported shapes are towers vs enemies, with per-unit colour,
// orientation, and idle animation. Towers are static (dots = mechanical actor);
// enemies idle-animate and walk the path (dots = organic actor).

export type Family = 'tower' | 'enemy';
export type Idle = 'none' | 'spin' | 'breathe' | 'flutter' | 'bob';
/** Tower attack pattern. beam = instant hitscan; slow = single shot that slows;
 * the rest are travelling projectiles. */
export type AttackType = 'single' | 'spread' | 'homing' | 'mortar' | 'beam' | 'slow';

export type UnitDef = {
  key: string; // -> SHAPES key
  label: string;
  role: string;
  family: Family;
  color: number;
  /** static orientation applied at build (radians about X). */
  rotX?: number;
  /** continuous spin rate about Y (rad/s); towers use a subtle value or 0. */
  spin?: number;
  idle: Idle;
  /** tower combat: targeting range (world units), shots/sec, damage per shot. */
  range?: number;
  fireRate?: number;
  damage?: number;
  /** attack pattern + params. */
  attack?: AttackType;
  projSpeed?: number; // world units/sec (single/spread/homing)
  pellets?: number; // spread pellet count
  splash?: number; // mortar splash radius (world units)
  /** projectile visual identity. */
  projColor?: number; // projectile/beam tint (defaults to tower colour)
  projSize?: number; // projectile point size (world units)
  projTrail?: number; // trailing ghost-point count (0 = no tracer)
  slowFactor?: number; // slow tower: enemy speed multiplier on hit (e.g. 0.5)
  slowDur?: number; // slow duration (seconds)
  /** enemy hit points at full health. */
  hp?: number;
  /** enemy gold bounty on kill. */
  bounty?: number;
  /** tower placement cost (gold). */
  cost?: number;
};

// --- economy constants ------------------------------------------------------
export const START_GOLD = 120;
export const STREAK_STEP = 0.05;
export const STREAK_CAP = 5;
export const REFUND_FRACTION = 0.75;

// upgrade effects per tier
export const UP_DAMAGE = 0.55;
export const UP_RANGE = 0.08;
export const UP_RATE = 0.1;

/** Gold to reach the next tier from `currentTier` (0→1, 1→2), or null if maxed. */
export function upgradeCost(def: UnitDef, currentTier: number): number | null {
  const place = def.cost ?? 0;
  if (currentTier === 0) return Math.round(place * 0.7);
  if (currentTier === 1) return Math.round(place * 1.2);
  return null;
}

// role colour coding (also used for projectiles + range rings)
const WHITE = 0xf2f6ff; // single shot / sniper
const ORANGE = 0xff9a3c; // mortar / area
const TEAL = 0x2fe6d0; // spread / area
const GREEN = 0x6bff9e; // laser
const RED = 0xff5a4e; // homing
const PURPLE = 0xb26bff; // slowing

export const TOWERS: UnitDef[] = [
  { key: 'tree', label: 'Single Shot', role: 'Basic · single shot', family: 'tower', color: WHITE, idle: 'none', range: 0.17, fireRate: 1.4, damage: 14, attack: 'single', projSpeed: 0.9, cost: 40, projColor: WHITE, projSize: 0.022, projTrail: 0 },
  { key: 'gear', label: 'AoE', role: 'Mortar · splash', family: 'tower', color: ORANGE, rotX: -Math.PI / 2, spin: 0.7, idle: 'spin', range: 0.16, fireRate: 0.9, damage: 12, attack: 'mortar', splash: 0.07, cost: 110, projColor: ORANGE, projSize: 0.05 },
  { key: 'spiral', label: 'Rapid', role: 'Rapid single-target', family: 'tower', color: WHITE, spin: 0.5, idle: 'spin', range: 0.16, fireRate: 3.0, damage: 7, attack: 'single', projSpeed: 1.2, cost: 70, projColor: WHITE, projSize: 0.016, projTrail: 3 },
  { key: 'dspiral', label: 'Homing', role: 'Homing bolts', family: 'tower', color: RED, idle: 'none', range: 0.16, fireRate: 1.2, damage: 9, attack: 'homing', projSpeed: 0.6, cost: 90, projColor: RED, projSize: 0.024, projTrail: 6 },
  { key: 'teardrop', label: 'Sniper', role: 'Sniper · fast round', family: 'tower', color: WHITE, idle: 'none', range: 0.32, fireRate: 0.7, damage: 45, attack: 'single', projSpeed: 2.4, cost: 130, projColor: WHITE, projSize: 0.024, projTrail: 8 },
  { key: 'songs', label: 'Spread', role: 'Spread · area', family: 'tower', color: TEAL, idle: 'none', range: 0.14, fireRate: 1.0, damage: 6, attack: 'spread', pellets: 5, projSpeed: 0.7, cost: 80, projColor: TEAL, projSize: 0.014, projTrail: 0 },
  { key: 'pyramid', label: 'Slow', role: 'Slow field', family: 'tower', color: PURPLE, idle: 'none', range: 0.16, fireRate: 1.0, damage: 4, attack: 'slow', projSpeed: 0.9, cost: 100, projColor: PURPLE, projSize: 0.026, projTrail: 4, slowFactor: 0.45, slowDur: 1.6 },
  { key: 'dna', label: 'Laser', role: 'Capstone · laser', family: 'tower', color: GREEN, spin: 0.4, idle: 'spin', range: 0.24, fireRate: 1.5, damage: 18, attack: 'beam', cost: 220, projColor: GREEN },
];

export const ENEMIES: UnitDef[] = [
  { key: 'butterfly', label: 'Butterfly', role: 'Fast swarm', family: 'enemy', color: 0x5ad1ff, idle: 'flutter', hp: 20, bounty: 3 },
  { key: 'cloud', label: 'Breathing Cloud', role: 'Tank', family: 'enemy', color: 0xb98cff, idle: 'breathe', hp: 120, bounty: 15 },
  { key: 'knot', label: 'Torus Knot', role: 'Elite / boss', family: 'enemy', color: 0xff5b4d, spin: 0.8, idle: 'spin', hp: 260, bounty: 30 },
  { key: 'shell', label: 'Nautilus Shell', role: 'Armored', family: 'enemy', color: 0xffd24a, spin: 0.6, idle: 'spin', hp: 70, bounty: 8 },
  { key: 'ghost', label: 'Wave Ghost', role: 'Flying / bypass', family: 'enemy', color: 0xff7ad5, idle: 'bob', hp: 40, bounty: 6 },
];

export const UNIT_BY_KEY: Record<string, UnitDef> = Object.fromEntries(
  [...TOWERS, ...ENEMIES].map((u) => [u.key, u]),
);
