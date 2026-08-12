// unit.ts — render a ported point-cloud shape as a THREE.Points "unit" (dots =
// actor). Towers are static (subtle spin only); enemies idle-animate and walk a
// world-space path. Halftone look: round additive dots, coloured per family.

import * as THREE from 'three';
import { SHAPES } from './shapes';
import type { UnitDef } from './roster';

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
  protected readonly restY: number;
  protected readonly phase: number;
  protected readonly count: number;
  protected baseY = 0;
  /** Seconds until this tower can fire again (combat state). */
  cooldown = 0;

  constructor(readonly def: UnitDef, scale: number, seedIndex: number) {
    const shape = SHAPES[def.key]!;
    this.count = shape.count;
    const baked = bakeRotX(shape.positions, def.rotX ?? 0);
    shuffleTriples(baked);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(baked, 3));
    this.mat = new THREE.PointsMaterial({
      color: def.color,
      size: scale * 0.14,
      map: dotTexture(),
      transparent: true,
      alphaTest: 0.18,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Points(this.geo, this.mat);
    this.baseScale = scale;
    this.restY = scale;
    this.phase = seedIndex * 1.7;
    this.object.scale.setScalar(scale);
  }

  /** Bob offset above the rest height (ghost/flyer). */
  protected bob(elapsed: number): number {
    return this.def.idle === 'bob' ? this.baseScale * 0.6 * (0.5 + 0.5 * Math.sin(elapsed * 1.6 + this.phase)) : 0;
  }

  /** Rotation + scale idle pose (position handled by caller). */
  protected pose(elapsed: number): void {
    const o = this.object;
    if (this.def.spin) o.rotation.y = elapsed * this.def.spin;
    switch (this.def.idle) {
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
      default:
        break;
    }
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
    this.pose(elapsed);
    this.object.position.y = this.baseY + this.restY + this.bob(elapsed);
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

  constructor(
    def: UnitDef,
    scale: number,
    seedIndex: number,
    private readonly path: THREE.Vector3[],
    private readonly speed: number,
    startDist = 0,
  ) {
    super(def, scale, seedIndex);
    this.maxHp = def.hp ?? 50;
    this.hp = this.maxHp;
    for (let i = 1; i < path.length; i++) {
      this.cum[i] = this.cum[i - 1]! + path[i]!.distanceTo(path[i - 1]!);
    }
    this.total = this.cum[this.cum.length - 1] || 1;
    this.dist = ((startDist % this.total) + this.total) % this.total;
  }

  /** Apply damage; die at 0 HP, otherwise thin the dot cloud to show damage. */
  damage(d: number): void {
    if (!this.alive) return;
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

  override update(dt: number, elapsed: number): void {
    if (this.reachedEnd) {
      this.pose(elapsed);
      return;
    }
    this.dist += this.speed * dt;
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
    this.pose(elapsed);
    this.object.position.set(
      a.x + (b.x - a.x) * f,
      this.baseY + this.restY + this.bob(elapsed),
      a.z + (b.z - a.z) * f,
    );
  }
}
