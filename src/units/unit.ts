// unit.ts — render a ported point-cloud shape as a THREE.Points "unit" (dots =
// actor). Towers are static (subtle spin only); enemies idle-animate and walk a
// world-space path. Halftone look: round additive dots, coloured per family.

import * as THREE from 'three';
import { SHAPES } from './shapes';
import type { UnitDef, Idle } from './roster';
import { UP_DAMAGE, UP_RANGE, UP_RATE } from './roster';
import { intToRgb01 } from '../util/color';
import { SOLVE_MOVES, solveCycle, applyMoves } from './idle-anim';
import { dotLOD } from './proximity';

/** Towers animate by upgrade tier: 0 = static, 1 = spin, 2 = twist. Cheap — a
 * spin is an O(1) transform; a twist rewrites the (small) point buffer/frame. */
const TOWER_TIER_IDLE: Idle[] = ['none', 'spin', 'twist'];
const TOWER_SPIN = 0.6; // rad/s for the tier-1 spin

let dotTex: THREE.Texture | null = null;
export function dotTexture(): THREE.Texture {
  if (dotTex) return dotTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

/** Bake a fixed X-rotation into a copy of the shape's positions. */
function bakeRotX(src: Float32Array, rot: number): Float32Array {
  if (!rot) return src.slice();
  const out = new Float32Array(src.length);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]!;
    const y = src[i + 1]!;
    const z = src[i + 2]!;
    out[i] = x;
    out[i + 1] = y * c - z * s;
    out[i + 2] = y * s + z * c;
  }
  return out;
}

/** Fisher–Yates over point triples so truncating the draw range thins the cloud
 * uniformly (HP-as-density) rather than eroding one structured region. */
function shuffleTriples(a: Float32Array): void {
  const n = a.length / 3;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    for (let k = 0; k < 3; k++) {
      const t = a[i * 3 + k]!;
      a[i * 3 + k] = a[j * 3 + k]!;
      a[j * 3 + k] = t;
    }
  }
}

export class Unit {
  readonly object: THREE.Points;
  protected readonly geo: THREE.BufferGeometry;
  protected readonly mat: THREE.PointsMaterial;
  protected readonly baseScale: number;
  /** Full-distance dot size (the PointsMaterial size); scaled down up close by
   * applyLOD. Stored so the LOD has a stable base to multiply. */
  protected readonly baseDotSize: number;
  protected readonly restY: number;
  protected readonly phase: number;
  protected readonly count: number;
  protected baseArr!: Float32Array; // static base positions (unit space)
  protected workArr!: Float32Array; // geometry buffer (may be animated)
  protected perPoint = false; // wave/twist rewrite geometry each frame
  protected baseY = 0;
  /** Seconds until this tower can fire again (combat state). */
  cooldown = 0;
  /** Tower economy/upgrade state + effective (post-upgrade) combat stats. */
  tier = 0;
  spent = 0;
  effRange: number;
  effDamage: number;
  effFireRate: number;
  effSplash: number;
  effPellets: number;

  constructor(readonly def: UnitDef, scale: number, seedIndex: number) {
    const shape = SHAPES[def.shape ?? def.key]!;
    this.count = shape.count;
    this.effRange = def.range ?? 0;
    this.effDamage = def.damage ?? 0;
    this.effFireRate = def.fireRate ?? 0;
    this.effSplash = def.splash ?? 0;
    this.effPellets = def.pellets ?? 0;
    // Towers may reach the tier-2 twist, so keep their buffer dynamic-ready.
    this.perPoint = def.family === 'tower' || def.idle === 'wave' || def.idle === 'twist' || def.idle === 'solving';

    const baked = bakeRotX(shape.positions, def.rotX ?? 0);
    shuffleTriples(baked);
    this.baseArr = baked;
    this.workArr = baked.slice();
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.workArr, 3).setUsage(this.perPoint ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage));

    // per-vertex colours (supports dual-code via def.color2)
    const col = new Float32Array(this.count * 3);
    const c1 = intToRgb01(def.color);
    const c2 = def.color2 != null ? intToRgb01(def.color2) : null;
    for (let i = 0; i < this.count; i++) {
      const c = c2 && i % 3 === 0 ? c2 : c1;
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    this.baseScale = scale * (def.sizeScale ?? 1);
    this.baseDotSize = this.baseScale * 0.14;
    this.mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: this.baseDotSize,
      map: dotTexture(),
      transparent: true,
      alphaTest: 0.18,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Points(this.geo, this.mat);
    this.restY = this.baseScale;
    this.phase = seedIndex * 1.7;
    this.object.scale.setScalar(this.baseScale);
  }

  /** Bob offset above the rest height (ghost/flyer). */
  protected bob(elapsed: number): number {
    return this.def.idle === 'bob' ? this.baseScale * 0.6 * (0.5 + 0.5 * Math.sin(elapsed * 1.6 + this.phase)) : 0;
  }

  /** The idle actually played: towers derive it from upgrade tier; enemies use
   * their fixed def.idle. */
  protected effectiveIdle(): Idle {
    if (this.def.family === 'tower') return TOWER_TIER_IDLE[Math.min(this.tier, 2)]!;
    return this.def.idle;
  }

  /** Rotation + scale idle pose (position handled by caller). */
  protected pose(elapsed: number, idle: Idle): void {
    const o = this.object;
    if (this.def.family === 'tower') o.rotation.y = idle === 'spin' ? elapsed * TOWER_SPIN : 0;
    else if (this.def.spin) o.rotation.y = elapsed * this.def.spin;
    switch (idle) {
      case 'breathe': {
        const s = this.baseScale * (1 + 0.12 * Math.sin(elapsed * 2 + this.phase));
        o.scale.setScalar(s);
        break;
      }
      case 'flutter': {
        o.rotation.y = Math.sin(elapsed * 2.6 + this.phase) * 0.6;
        o.rotation.z = Math.sin(elapsed * 5 + this.phase) * 0.25;
        o.scale.set(this.baseScale * (0.85 + 0.15 * Math.cos(elapsed * 5)), this.baseScale, this.baseScale);
        break;
      }
      case 'jelly': {
        const sy = 1 + 0.24 * Math.sin(elapsed * 3 + this.phase);
        const sx = 1 / Math.sqrt(sy);
        o.scale.set(this.baseScale * sx, this.baseScale * sy, this.baseScale * sx);
        break;
      }
      default:
        break;
    }
  }

  /** wave/twist/solving rewrite the geometry buffer from the static base each frame. */
  private animatePerPoint(elapsed: number, idle: Idle): void {
    const b = this.baseArr;
    const w = this.workArr;
    if (idle === 'solving') {
      const amount = solveCycle(elapsed, SOLVE_MOVES.length, 0.42, 1.2);
      for (let i = 0; i < b.length; i += 3) {
        const p = applyMoves(b[i]!, b[i + 1]!, b[i + 2]!, amount);
        w[i] = p[0];
        w[i + 1] = p[1];
        w[i + 2] = p[2];
      }
    } else if (idle === 'wave') {
      for (let i = 0; i < b.length; i += 3) {
        const x = b[i]!;
        const y = b[i + 1]!;
        const z = b[i + 2]!;
        const d = 1 + 0.14 * Math.sin(3 * Math.atan2(z, x) + elapsed * 3 - y * 2);
        w[i] = x * d;
        w[i + 1] = y;
        w[i + 2] = z * d;
      }
    } else {
      // twist: rotate each point about Y by an angle rising with height
      for (let i = 0; i < b.length; i += 3) {
        const x = b[i]!;
        const y = b[i + 1]!;
        const z = b[i + 2]!;
        const a = elapsed * 0.4 + y * 1.6 * Math.sin(elapsed * 0.7);
        const c = Math.cos(a);
        const s = Math.sin(a);
        w[i] = x * c + z * s;
        w[i + 1] = y;
        w[i + 2] = -x * s + z * c;
      }
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  protected animateIdle(elapsed: number): void {
    const idle = this.effectiveIdle();
    if (idle === 'wave' || idle === 'twist' || idle === 'solving') this.animatePerPoint(elapsed, idle);
    else this.pose(elapsed, idle);
  }

  /** Apply one upgrade tier: boost effective stats + a tier-2 signature bump. */
  upgrade(addedCost: number): void {
    this.tier++;
    this.spent += addedCost;
    this.effDamage *= 1 + UP_DAMAGE;
    this.effRange *= 1 + UP_RANGE;
    this.effFireRate *= 1 + UP_RATE;
    if (this.tier === 2) {
      switch (this.def.attack) {
        case 'mortar': this.effSplash *= 1.4; break;
        case 'spread': this.effPellets += 2; break;
        case 'beam':
        case 'homing': this.effRange *= 1.3; break;
        case 'single': this.effFireRate *= 1.2; break;
        default: break;
      }
    }
    this.object.scale.setScalar(this.baseScale * (1 + 0.12 * this.tier)); // grow per tier
  }

  /** Show only `frac` of the (pre-shuffled) dots — HP rendered as dot density. */
  setDensity(frac: number): void {
    const n = Math.max(3, Math.floor(this.count * Math.max(0, Math.min(1, frac))));
    this.geo.setDrawRange(0, n);
  }

  /** Static placement (towers). `baseY` lifts the unit onto a platform top. */
  placeAt(worldX: number, worldZ: number, baseY = 0): void {
    this.baseY = baseY;
    this.object.position.set(worldX, baseY + this.restY, worldZ);
  }

  update(_dt: number, elapsed: number): void {
    this.animateIdle(elapsed);
    this.object.position.y = this.baseY + this.restY + this.bob(elapsed);
  }

  /** Distance-based dot LOD: shrink + dim this unit's dots when the camera is
   * close (kills the additive white blowout in close-up views), full size and
   * brightness at distance. `material.color` multiplies the per-vertex colours,
   * so the scalar dims brightness while preserving hue. Called by the scene each
   * frame. */
  applyLOD(cameraPos: THREE.Vector3 | null): void {
    const lod = cameraPos ? dotLOD(this.object.position.distanceTo(cameraPos)) : { size: 1, bright: 1 };
    this.mat.size = this.baseDotSize * lod.size;
    this.mat.color.setScalar(lod.bright);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** An enemy: walks a world-space polyline (spawn → base), looping. */
export class Enemy extends Unit {
  private readonly cum: number[] = [0];
  private readonly total: number;
  private dist = 0;
  hp: number;
  readonly maxHp: number;
  alive = true;
  /** Set once the enemy walks off the end of the path (reached the base). */
  reachedEnd = false;
  private slowTimer = 0;
  private slowFactor = 1;
  private hitTimer = 99; // seconds since last hit (for heal-out-of-combat)
  private behMult = 1; // brief accel/slow-on-hit multiplier
  private behTimer = 0;
  private errTimer = 0;
  private errTarget = 1;
  private errMult = 1;
  /** External aura speed multiplier, set by the scene each frame. */
  auraMult = 1;
  /** Current travel heading (unit XZ vector), refreshed each walked frame. The
   * trench follow-cam uses it to sit behind the wave and look where it's going. */
  readonly dir = new THREE.Vector3(0, 0, 1);

  constructor(
    def: UnitDef,
    scale: number,
    seedIndex: number,
    private readonly path: THREE.Vector3[],
    private readonly speed: number,
    startDist = 0,
    hpScale = 1,
  ) {
    super(def, scale, seedIndex);
    this.maxHp = (def.hp ?? 50) * hpScale;
    this.hp = this.maxHp;
    for (let i = 1; i < path.length; i++) {
      this.cum[i] = this.cum[i - 1]! + path[i]!.distanceTo(path[i - 1]!);
    }
    this.total = this.cum[this.cum.length - 1] || 1;
    this.dist = ((startDist % this.total) + this.total) % this.total;
  }

  /** Apply damage; die at 0 HP, otherwise thin the dot cloud to show damage.
   * Also drives the on-hit behaviours (accelerate / slow / reset heal timer). */
  damage(d: number): void {
    if (!this.alive) return;
    this.hitTimer = 0;
    if (this.def.accelOnHit) {
      this.behMult = this.def.accelOnHit;
      this.behTimer = 1.2;
    } else if (this.def.slowOnHitSelf) {
      this.behMult = this.def.slowOnHitSelf;
      this.behTimer = 1.2;
    }
    this.hp -= d;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    } else {
      this.setDensity(this.hp / this.maxHp);
    }
  }

  worldPos(): THREE.Vector3 {
    return this.object.position;
  }

  get bounty(): number {
    return this.def.bounty ?? 0;
  }

  /** Slow this enemy: `factor` speed multiplier for `dur` seconds (keeps the
   * strongest active slow, refreshes the timer). */
  applySlow(factor: number, dur: number): void {
    this.slowFactor = this.slowTimer > 0 ? Math.min(this.slowFactor, factor) : factor;
    this.slowTimer = Math.max(this.slowTimer, dur);
  }

  get slowed(): boolean {
    return this.slowTimer > 0;
  }

  override update(dt: number, elapsed: number): void {
    if (this.reachedEnd) {
      this.animateIdle(elapsed);
      return;
    }
    this.hitTimer += dt;
    if (this.behTimer > 0) {
      this.behTimer -= dt;
      if (this.behTimer <= 0) this.behMult = 1;
    }
    if (this.def.healOOC && this.hitTimer > 1.2 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.def.healOOC * dt);
      this.setDensity(this.hp / this.maxHp);
    }
    if (this.def.erratic) {
      this.errTimer -= dt;
      if (this.errTimer <= 0) {
        this.errTarget = 0.4 + Math.random() * 1.4;
        this.errTimer = 0.6 + Math.random() * 0.9;
      }
      this.errMult += (this.errTarget - this.errMult) * Math.min(1, 3 * dt);
    }
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    const towerSlow = this.slowTimer > 0 ? this.slowFactor : 1;
    const spd = this.speed * towerSlow * this.behMult * (this.def.erratic ? this.errMult : 1) * this.auraMult;
    this.dist += spd * dt;
    if (this.dist >= this.total) {
      this.dist = this.total;
      this.reachedEnd = true; // reached the base — the game will cost a life
    }
    // find segment by cumulative length
    let seg = 0;
    while (seg < this.cum.length - 2 && this.cum[seg + 1]! < this.dist) seg++;
    const a = this.path[seg]!;
    const b = this.path[seg + 1] ?? a;
    const segLen = (this.cum[seg + 1] ?? this.total) - this.cum[seg]!;
    const f = segLen > 1e-6 ? (this.dist - this.cum[seg]!) / segLen : 0;
    this.animateIdle(elapsed);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-6) this.dir.set(dx / dl, 0, dz / dl);
    this.object.position.set(
      a.x + dx * f,
      this.baseY + this.restY + this.bob(elapsed),
      a.z + dz * f,
    );
  }
}
