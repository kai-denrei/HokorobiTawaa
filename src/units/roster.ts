// roster.ts — which ported shapes are towers vs enemies, with per-unit colour,
// orientation, and idle animation. Towers are static (dots = mechanical actor);
// enemies idle-animate and walk the path (dots = organic actor).

export type Family = 'tower' | 'enemy';
export type Idle = 'none' | 'spin' | 'breathe' | 'flutter' | 'bob';

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
};

const TOWER_GREEN = 0x8affc0;
const ENEMY_AMBER = 0xffb14e;

export const TOWERS: UnitDef[] = [
  { key: 'tree', label: 'Pine Tree', role: 'Basic', family: 'tower', color: TOWER_GREEN, idle: 'none' },
  { key: 'gear', label: 'Gear', role: 'Splash / AoE', family: 'tower', color: TOWER_GREEN, rotX: -Math.PI / 2, spin: 0.7, idle: 'spin' },
  { key: 'spiral', label: 'Spiral', role: 'Single-target DPS', family: 'tower', color: TOWER_GREEN, spin: 0.5, idle: 'spin' },
  { key: 'dspiral', label: 'Double Spiral', role: 'Slow / debuff', family: 'tower', color: TOWER_GREEN, idle: 'none' },
  { key: 'teardrop', label: 'Teardrop', role: 'Sniper', family: 'tower', color: TOWER_GREEN, idle: 'none' },
  { key: 'songs', label: 'SONGS Domes', role: 'Support / buff', family: 'tower', color: TOWER_GREEN, idle: 'none' },
  { key: 'dna', label: 'DNA Helix', role: 'Capstone: lightning', family: 'tower', color: TOWER_GREEN, spin: 0.4, idle: 'spin' },
];

export const ENEMIES: UnitDef[] = [
  { key: 'butterfly', label: 'Butterfly', role: 'Fast swarm', family: 'enemy', color: ENEMY_AMBER, idle: 'flutter' },
  { key: 'cloud', label: 'Breathing Cloud', role: 'Tank', family: 'enemy', color: ENEMY_AMBER, idle: 'breathe' },
  { key: 'knot', label: 'Torus Knot', role: 'Elite / boss', family: 'enemy', color: ENEMY_AMBER, spin: 0.8, idle: 'spin' },
  { key: 'shell', label: 'Nautilus Shell', role: 'Armored', family: 'enemy', color: ENEMY_AMBER, spin: 0.6, idle: 'spin' },
  { key: 'ghost', label: 'Wave Ghost', role: 'Flying / bypass', family: 'enemy', color: ENEMY_AMBER, idle: 'bob' },
];

export const UNIT_BY_KEY: Record<string, UnitDef> = Object.fromEntries(
  [...TOWERS, ...ENEMIES].map((u) => [u.key, u]),
);
