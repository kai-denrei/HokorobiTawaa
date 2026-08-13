// roster.ts — which ported shapes are towers vs enemies, with per-unit colour,
// orientation, and idle animation. Towers are static (dots = mechanical actor);
// enemies idle-animate and walk the path (dots = organic actor).

export type Family = 'tower' | 'enemy';
export type Idle = 'none' | 'spin' | 'breathe' | 'flutter' | 'bob' | 'wave' | 'twist' | 'jelly';
/** Tower attack pattern. beam = instant hitscan; slow = single shot that slows;
 * the rest are travelling projectiles. */
export type AttackType = 'single' | 'spread' | 'homing' | 'mortar' | 'beam' | 'slow';

export type UnitDef = {
  key: string; // unique unit id
  shape?: string; // SHAPES key (defaults to `key`) — lets variants share a shape
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
  /** enemy movement speed (world units/sec); default set by scene. */
  speed?: number;
  // ---- enemy visual identity ----
  color2?: number; // dual-code secondary tint (sprinkled across the dots)
  sizeScale?: number; // per-tier size multiplier (agile small, tanky big)
  // ---- enemy behaviours ----
  erratic?: boolean; // speed oscillates slow→fast with RNG
  accelOnHit?: number; // brief speed multiplier when damaged (>1, e.g. 1.8)
  slowOnHitSelf?: number; // brief speed multiplier when damaged (<1, e.g. 0.5)
  healOOC?: number; // HP/sec regenerated when not hit recently
  auraBoost?: number; // speed multiplier granted to nearby enemies (>1)
  auraRange?: number; // aura radius (world units)
};

// --- economy constants ------------------------------------------------------
export const START_GOLD = 190;
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

// Towers = cool "defender" palette; enemies own the warm/threat hues.
const T_WHITE = 0xeaf2ff;
const T_CYAN = 0x6fe6ff;
const T_ICE = 0x9fc4ff;
const T_TEAL = 0x2fe6d0;
const T_AZURE = 0x5a9bff;
const T_PALE = 0xc4e6ff;
const T_LASER = 0x9ff5ff;

export const TOWERS: UnitDef[] = [
  { key: 'tree', shape: 'turret', label: 'Single Shot', role: 'Basic · single shot', family: 'tower', color: T_WHITE, idle: 'none', range: 0.17, fireRate: 1.4, damage: 14, attack: 'single', projSpeed: 0.9, cost: 40, projColor: T_WHITE, projSize: 0.022, projTrail: 0 },
  { key: 'gear', label: 'AoE', role: 'Mortar · splash', family: 'tower', color: T_ICE, rotX: -Math.PI / 2, spin: 0.7, idle: 'spin', range: 0.16, fireRate: 0.9, damage: 12, attack: 'mortar', splash: 0.07, cost: 110, projColor: T_ICE, projSize: 0.05 },
  { key: 'spiral', label: 'Rapid', role: 'Rapid single-target', family: 'tower', color: T_CYAN, spin: 0.5, idle: 'spin', range: 0.16, fireRate: 3.0, damage: 7, attack: 'single', projSpeed: 1.2, cost: 70, projColor: T_CYAN, projSize: 0.016, projTrail: 3 },
  { key: 'dspiral', label: 'Homing', role: 'Homing bolts', family: 'tower', color: T_AZURE, idle: 'none', range: 0.16, fireRate: 1.2, damage: 9, attack: 'homing', projSpeed: 0.6, cost: 90, projColor: T_AZURE, projSize: 0.024, projTrail: 6 },
  { key: 'teardrop', label: 'Sniper', role: 'Sniper · fast round', family: 'tower', color: 0xffffff, idle: 'none', range: 0.32, fireRate: 0.7, damage: 45, attack: 'single', projSpeed: 2.4, cost: 130, projColor: 0xffffff, projSize: 0.024, projTrail: 8 },
  { key: 'songs', label: 'Spread', role: 'Spread · area', family: 'tower', color: T_TEAL, idle: 'none', range: 0.14, fireRate: 1.0, damage: 6, attack: 'spread', pellets: 5, projSpeed: 0.7, cost: 80, projColor: T_TEAL, projSize: 0.014, projTrail: 0 },
  { key: 'pyramid', label: 'Slow', role: 'Slow field', family: 'tower', color: T_PALE, idle: 'none', range: 0.16, fireRate: 1.0, damage: 4, attack: 'slow', projSpeed: 0.9, cost: 100, projColor: T_PALE, projSize: 0.026, projTrail: 4, slowFactor: 0.45, slowDur: 1.6 },
  { key: 'dna', label: 'Laser', role: 'Capstone · laser', family: 'tower', color: T_LASER, spin: 0.4, idle: 'spin', range: 0.24, fireRate: 1.5, damage: 18, attack: 'beam', cost: 220, projColor: T_LASER },
];

// Enemy threat palette (hue = class; brightness = rank; size/dots = tier/HP).
const E_YELLOW = 0xffe14a; // fast / agile
const E_YELLOW2 = 0xfff07a;
const E_GREEN = 0x53ff8a; // healing
const E_GREEN2 = 0x38d070;
const E_BLUE = 0x5a6bff; // support / aura
const E_RED = 0xff6a5a; // dangerous
const E_RED2 = 0xff3020; // most dangerous / boss
const E_ORANGE = 0xff9a2e; // epic
const E_PURPLE = 0xb44bff; // epic-rare

export const ENEMIES: UnitDef[] = [
  // agile — small, fast, sparse dots (Yellow)
  { key: 'butterfly', label: 'Butterfly', role: 'Agile swarm', family: 'enemy', color: E_YELLOW, idle: 'flutter', hp: 20, bounty: 3, speed: 0.16, sizeScale: 0.8, erratic: true },
  { key: 'ghost', label: 'Wave Ghost', role: 'Agile flyer', family: 'enemy', color: E_YELLOW2, idle: 'bob', hp: 40, bounty: 6, speed: 0.17, sizeScale: 0.85, erratic: true },
  { key: 'scoutufo', shape: 'ufo', label: 'Scout UFO', role: 'Fast scout', family: 'enemy', color: E_YELLOW, idle: 'wave', hp: 48, bounty: 7, speed: 0.18, sizeScale: 0.85, erratic: true, accelOnHit: 1.6 },
  // normal — Green regen / Blue aura / dual-code drifter
  { key: 'gslime', shape: 'slime', label: 'Green Slime', role: 'Regenerator', family: 'enemy', color: E_GREEN, idle: 'jelly', hp: 90, bounty: 12, speed: 0.12, sizeScale: 1.0, healOOC: 18 },
  { key: 'bslime', shape: 'slime', label: 'Blue Slime', role: 'Aura · boosts allies', family: 'enemy', color: E_BLUE, idle: 'wave', hp: 100, bounty: 14, speed: 0.12, sizeScale: 1.0, auraBoost: 1.4, auraRange: 0.14 },
  { key: 'drifter', shape: 'ufo', label: 'Drifter UFO', role: 'Erratic drifter', family: 'enemy', color: E_YELLOW, color2: E_BLUE, idle: 'jelly', hp: 120, bounty: 15, speed: 0.11, sizeScale: 1.05, erratic: true },
  // tanky — Green regen tank / Red armored
  { key: 'cloud', label: 'Breathing Cloud', role: 'Regenerating tank', family: 'enemy', color: E_GREEN2, idle: 'breathe', hp: 160, bounty: 16, speed: 0.1, sizeScale: 1.2, healOOC: 22 },
  { key: 'shell', label: 'Nautilus Shell', role: 'Armored · slows when hit', family: 'enemy', color: E_RED, idle: 'spin', hp: 190, bounty: 15, speed: 0.1, sizeScale: 1.15, slowOnHitSelf: 0.6 },
  { key: 'barbed', shape: 'seamine', label: 'Barbed Mine', role: 'Dangerous · speeds up when hit', family: 'enemy', color: E_RED2, idle: 'twist', hp: 240, bounty: 20, speed: 0.09, sizeScale: 1.2, accelOnHit: 1.9 },
  // epic — Orange / Purple rare
  { key: 'rolling', shape: 'seamine', label: 'Rolling Mine', role: 'Epic · slows when hit', family: 'enemy', color: E_ORANGE, idle: 'wave', hp: 360, bounty: 28, speed: 0.085, sizeScale: 1.35, slowOnHitSelf: 0.55 },
  { key: 'prime', shape: 'seamine', label: 'Prime Mine', role: 'Epic-rare · regenerates', family: 'enemy', color: E_PURPLE, color2: 0xff6bff, idle: 'jelly', hp: 500, bounty: 45, speed: 0.075, sizeScale: 1.45, healOOC: 30 },
  // boss — bright Red
  { key: 'knot', label: 'Torus Knot', role: 'Boss · speeds up when hit', family: 'enemy', color: E_RED2, spin: 0.8, idle: 'spin', hp: 340, bounty: 34, speed: 0.085, sizeScale: 1.3, accelOnHit: 1.7 },
];

export const UNIT_BY_KEY: Record<string, UnitDef> = Object.fromEntries(
  [...TOWERS, ...ENEMIES].map((u) => [u.key, u]),
);
