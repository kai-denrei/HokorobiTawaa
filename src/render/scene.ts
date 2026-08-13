// scene.ts — Three.js board view: wireframe cells, extruded mountain pyramids,
// additive-glow (bloom), fixed tilted camera, and raycast tap hit-testing.
//
// Coordinate mapping: board space is normalized [0,1]² (x,y). We render on the
// XZ ground plane centered at the origin: worldX = x - 0.5, worldZ = y - 0.5,
// Y is up. So the board spans [-0.5, 0.5]².

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Board, Cell, Vec2 } from '../board';
import { THEME, BLOOM } from './theme';
import { Unit, Enemy, dotTexture } from '../units/unit';
import { UNIT_BY_KEY, upgradeCost, REFUND_FRACTION } from '../units/roster';
import { HeartBase } from './heart-base';

export type MountainStyle = 'wire' | 'solid';

const MAX_PROJ = 4096;

type Projectile = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  kind: 'single' | 'homing' | 'mortar' | 'spark';
  target: Enemy | null;
  damage: number;
  splash: number;
  gravity: number;
  ttl: number;
  maxTtl: number;
  color: THREE.Color;
  size: number;
  trail: THREE.Vector3[];
  trailMax: number;
};

const toWorld = (p: Vec2): [number, number, number] => [p[0] - 0.5, 0, p[1] - 0.5];

/** Approx cell radius = mean distance center→polygon vertices. */
function cellRadius(cell: Cell): number {
  let s = 0;
  for (const v of cell.polygon) s += Math.hypot(v[0] - cell.center[0], v[1] - cell.center[1]);
  return cell.polygon.length ? s / cell.polygon.length : 0.02;
}

/** Uniform flat elevation (world units) for raised cells (buildable platforms +
 * blocked walls). The path stays at ground as a low hallway. */
const WALL_HEIGHT = 0.06;

/** Shrink each raised block toward its centre so adjacent blocks leave a gap —
 * cleaner hallway read and clearance so walking enemies don't clip walls. */
const BLOCK_INSET = 0.84;

/** point-in-polygon (ray cast), board-space. */
function pointInPolygon(px: number, py: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0];
    const yi = poly[i]![1];
    const xj = poly[j]![0];
    const yj = poly[j]![1];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export type PickHandler = (cellId: number | null, cell: Cell | null) => void;

export class BoardView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private boardGroup = new THREE.Group();
  private highlight: THREE.LineSegments | null = null;
  private board: Board | null = null;
  private mountainStyle: MountainStyle = 'solid';
  private unitsGroup = new THREE.Group();
  private units: Unit[] = [];
  private towers: Unit[] = [];
  private towerByCell = new Map<number, Unit>();
  private enemies: Enemy[] = [];
  private effectsGroup = new THREE.Group();
  private effects: { line: THREE.Line; mat: THREE.LineBasicMaterial; ttl: number; max: number }[] = [];
  private projectiles: Projectile[] = [];
  private projGeo = new THREE.BufferGeometry();
  private projPos = new Float32Array(MAX_PROJ * 3);
  private projCol = new Float32Array(MAX_PROJ * 3);
  private projSize = new Float32Array(MAX_PROJ);
  private projPoints: THREE.Points;
  private rings: { mesh: THREE.LineLoop; mat: THREE.LineBasicMaterial; ttl: number; max: number; maxScale: number }[] = [];
  private tmp = new THREE.Vector3();
  private towerScale = 0.045;
  private enemyScale = 0.03;
  private baseHeart: HeartBase | null = null;
  /** Game hooks: per-frame tick, enemy reached base (leak), enemy killed. */
  onTick: ((dt: number) => void) | null = null;
  onLeak: (() => void) | null = null;
  onKill: ((e: Enemy) => void) | null = null;
  private clockStart = 0;
  private lastT = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private disposables: { dispose(): void }[] = [];
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(THEME.background);
    this.scene.add(this.boardGroup);
    this.scene.add(this.unitsGroup);
    this.scene.add(this.effectsGroup);

    // pooled projectile point cloud — per-vertex size + colour so each damage
    // type has its own look (positions/colours/sizes updated per frame).
    this.projGeo.setAttribute('position', new THREE.BufferAttribute(this.projPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.projGeo.setAttribute('aColor', new THREE.BufferAttribute(this.projCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.projGeo.setAttribute('aSize', new THREE.BufferAttribute(this.projSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.projGeo.setDrawRange(0, 0);
    const projMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dotTexture() }, uScale: { value: 620 } },
      vertexShader: `
        uniform float uScale;
        attribute vec3 aColor;
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.05) discard;
          gl_FragColor = vec4(vColor, 1.0) * t;
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.projPoints = new THREE.Points(this.projGeo, projMat);
    this.projPoints.frustumCulled = false;
    this.effectsGroup.add(this.projPoints);

    // Lighting only affects the solid (Standard-material) mountains; the
    // wireframe board uses LineBasicMaterial and ignores lights entirely.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(-0.8, 1.2, 0.5);
    this.scene.add(key);

    this.camera = new THREE.PerspectiveCamera(44, 1, 0.01, 100);
    // Steep tilted view, pulled back to frame the whole [-0.5,0.5]² board with
    // even margins (little sky, near edge clear of the bottom HUD).
    this.camera.position.set(0, 1.62, 1.12);
    this.camera.lookAt(0, 0, 0.04);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.composer.addPass(bloom);
    this.disposables.push(bloom);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /** (Re)build the visible board from a Board data structure. */
  setBoard(board: Board): void {
    this.board = board;
    this.clearGroup();
    this.clearUnits();
    this.buildTerrain();

    // big Heart at the exit/base cell (replaces the base marker) — the thing
    // you're defending; persists across the solid/wire terrain toggle.
    if (this.baseHeart) {
      this.scene.remove(this.baseHeart.object);
      this.baseHeart.dispose();
    }
    const bw = toWorld(board.cells.get(board.base)!.center);
    this.baseHeart = new HeartBase(bw[0], bw[2], 0.095);
    this.scene.add(this.baseHeart.object);
    // angle the heart to face the camera so its silhouette reads as a ❤
    // (the shape is symmetric front-to-back, so facing either way is fine).
    this.baseHeart.object.lookAt(this.camera.position);
  }

  /** (Re)build only the terrain geometry (boardGroup) from the current board —
   * does NOT touch placed units. Used by the solid/wire toggle. */
  private buildTerrain(): void {
    const board = this.board;
    if (!board) return;

    // buildable = raised green platforms (towers on top); blocked = grey walls;
    // path/spawn/base = low dark hallway floor. Batched per material.
    const solid = this.mountainStyle === 'solid';
    const floorSegs: number[] = [];
    const buildWire: number[] = [];
    const buildTris: number[] = [];
    const blockWire: number[] = [];
    const blockTris: number[] = [];

    for (const cell of board.cells.values()) {
      if (cell.terrain === 'buildable') {
        if (solid) this.pushBlockSolid(buildTris, cell);
        else this.pushBlockWire(buildWire, cell);
      } else if (cell.terrain === 'blocked') {
        if (solid) this.pushBlockSolid(blockTris, cell);
        else this.pushBlockWire(blockWire, cell);
      } else {
        // path / spawn / base — low floor outline (the hallway enemies walk)
        const poly = cell.polygon;
        for (let i = 0; i < poly.length; i++) {
          const a = toWorld(poly[i]!);
          const b = toWorld(poly[(i + 1) % poly.length]!);
          floorSegs.push(a[0], 0, a[2], b[0], 0, b[2]);
        }
      }
    }

    this.addLineSegments(floorSegs, THEME.hallway, 0.5);
    this.addLineSegments(buildWire, THEME.buildWire, 0.85);
    this.addLineSegments(blockWire, THEME.mountainWire, 0.9);
    this.addSolidBlocks(buildTris, THEME.buildSolid);
    this.addSolidBlocks(blockTris, THEME.mountainSolid);

    // Accent ring(s) for spawn(s); the base is marked by the Heart (see setBoard).
    for (const s of board.spawns) this.addMarker(board.cells.get(s)!, THEME.spawn);
  }

  private addLineSegments(positions: number[], color: number, opacity: number): void {
    if (positions.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
    });
    const seg = new THREE.LineSegments(geo, mat);
    this.boardGroup.add(seg);
    this.disposables.push(geo, mat);
  }

  /** Inset a cell-polygon vertex toward the cell centre (BLOCK_INSET), then to
   * world XZ — leaves a gap between adjacent raised blocks. */
  private insetWorld(cell: Cell, p: Vec2): [number, number, number] {
    const bx = cell.center[0] + (p[0] - cell.center[0]) * BLOCK_INSET;
    const by = cell.center[1] + (p[1] - cell.center[1]) * BLOCK_INSET;
    return toWorld([bx, by]);
  }

  /** Wireframe raised block: inset base ring + flat top ring at WALL_HEIGHT,
   * joined by vertical ribs. */
  private pushBlockWire(target: number[], cell: Cell): void {
    const poly = cell.polygon;
    const n = poly.length;
    if (n < 3) return;
    const H = WALL_HEIGHT;
    for (let i = 0; i < n; i++) {
      const a = this.insetWorld(cell, poly[i]!);
      const b = this.insetWorld(cell, poly[(i + 1) % n]!);
      target.push(a[0], 0, a[2], b[0], 0, b[2]); // base edge
      target.push(a[0], H, a[2], b[0], H, b[2]); // flat top edge
      target.push(a[0], 0, a[2], a[0], H, a[2]); // vertical rib
    }
  }

  /** Solid raised block: side quads (2 tris/edge) + flat top cap (fan from the
   * cell centre). DoubleSide material makes winding irrelevant. */
  private pushBlockSolid(target: number[], cell: Cell): void {
    const poly = cell.polygon;
    const n = poly.length;
    if (n < 3) return;
    const H = WALL_HEIGHT;
    const c = toWorld(cell.center);
    for (let i = 0; i < n; i++) {
      const a = this.insetWorld(cell, poly[i]!);
      const b = this.insetWorld(cell, poly[(i + 1) % n]!);
      target.push(a[0], 0, a[2], b[0], 0, b[2], b[0], H, b[2]);
      target.push(a[0], 0, a[2], b[0], H, b[2], a[0], H, a[2]);
      target.push(c[0], H, c[2], a[0], H, a[2], b[0], H, b[2]);
    }
  }

  private addSolidBlocks(positions: number[], color: number): void {
    if (positions.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.boardGroup.add(mesh);
    this.disposables.push(geo, mat);
  }

  /** Switch mountains between wireframe and solid; rebuilds terrain only,
   * leaving placed towers and enemies in place. */
  setMountainStyle(style: MountainStyle): void {
    if (this.mountainStyle === style) return;
    this.mountainStyle = style;
    if (this.board) {
      this.clearGroup(); // clears terrain (boardGroup) + highlight, NOT units
      this.buildTerrain();
    }
  }

  /** Place a tower (static dotted unit) on a cell. `cost` is recorded for refund. */
  spawnTower(cellId: number, key: string, cost = 0): string | null {
    if (!this.board) return null;
    const cell = this.board.cells.get(cellId);
    const def = UNIT_BY_KEY[key];
    if (!cell || !def || def.family !== 'tower') return null;
    if (this.towerByCell.has(cellId)) return null; // one tower per cell
    const u = new Unit(def, this.towerScale, this.units.length);
    u.spent = cost;
    const w = toWorld(cell.center);
    u.placeAt(w[0], w[2], WALL_HEIGHT); // on top of the raised buildable platform
    this.unitsGroup.add(u.object);
    this.units.push(u);
    this.towers.push(u);
    this.towerByCell.set(cellId, u);
    return def.label;
  }

  hasTower(cellId: number): boolean {
    return this.towerByCell.has(cellId);
  }

  /** Upgrade/sell info for the tower on a cell, or null if none. */
  towerInfo(cellId: number): { label: string; tier: number; nextCost: number | null; sellValue: number } | null {
    const t = this.towerByCell.get(cellId);
    if (!t) return null;
    return {
      label: t.def.label,
      tier: t.tier,
      nextCost: upgradeCost(t.def, t.tier),
      sellValue: Math.round(t.spent * REFUND_FRACTION),
    };
  }

  upgradeTower(cellId: number, addedCost: number): boolean {
    const t = this.towerByCell.get(cellId);
    if (!t || upgradeCost(t.def, t.tier) == null) return false;
    t.upgrade(addedCost);
    return true;
  }

  /** Remove the tower on a cell; returns total gold spent on it (for refund). */
  sellTower(cellId: number): number {
    const t = this.towerByCell.get(cellId);
    if (!t) return 0;
    this.unitsGroup.remove(t.object);
    t.dispose();
    this.towers = this.towers.filter((x) => x !== t);
    this.units = this.units.filter((x) => x !== t);
    this.towerByCell.delete(cellId);
    return t.spent;
  }

  /** Spawn an enemy that walks the board path from spawn to base, looping. */
  spawnEnemy(key: string, hpScale = 1): string | null {
    if (!this.board) return null;
    const def = UNIT_BY_KEY[key];
    if (!def || def.family !== 'enemy') return null;
    const pts = this.board.path.map((id) => {
      const w = toWorld(this.board!.cells.get(id)!.center);
      return new THREE.Vector3(w[0], 0, w[2]);
    });
    if (pts.length < 2) return null;
    const e = new Enemy(def, this.enemyScale, this.units.length, pts, 0.13, 0, hpScale);
    this.unitsGroup.add(e.object);
    this.units.push(e);
    this.enemies.push(e);
    return def.label;
  }

  /** Base-heart health (0..1) and hit flash — driven by the game. */
  setBaseLives(frac: number): void {
    this.baseHeart?.setLives(frac);
  }

  hitBase(): void {
    this.baseHeart?.hit();
  }

  clearUnits(): void {
    for (const u of this.units) {
      this.unitsGroup.remove(u.object);
      u.dispose();
    }
    this.units = [];
    this.towers = [];
    this.towerByCell.clear();
    this.enemies = [];
    for (const e of this.effects) {
      this.effectsGroup.remove(e.line);
      e.line.geometry.dispose();
      e.mat.dispose();
    }
    this.effects = [];
    for (const r of this.rings) {
      this.effectsGroup.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mat.dispose();
    }
    this.rings = [];
    this.projectiles = [];
    this.projGeo.setDrawRange(0, 0);
  }

  get unitCount(): number {
    return this.units.length;
  }

  get enemyCount(): number {
    return this.enemies.length;
  }

  /** Towers acquire the nearest live enemy in range and fire on cooldown. */
  private stepCombat(dt: number): void {
    if (this.towers.length === 0 || this.enemies.length === 0) return;
    for (const t of this.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const range = t.effRange;
      const dmg = t.effDamage;
      const rate = t.effFireRate;
      if (range <= 0 || dmg <= 0 || rate <= 0) continue;
      const tp = t.object.position;
      let best: Enemy | null = null;
      let bestD = range;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const ep = e.object.position;
        const d = Math.hypot(tp.x - ep.x, tp.z - ep.z); // XZ — tower elevation ignored
        if (d <= bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) {
        t.cooldown = 1 / rate;
        const atk = t.def.attack ?? 'single';
        const color = new THREE.Color(t.def.projColor ?? t.def.color);
        const size = t.def.projSize ?? 0.02;
        const trail = t.def.projTrail ?? 0;
        const target = best.object.position;
        if (atk === 'beam') {
          best.damage(dmg); // instant hitscan laser
          this.spawnLaser(tp, target, color);
        } else if (atk === 'mortar') {
          this.fireMortar(tp, target, dmg, t.effSplash || 0.06, color, size);
        } else if (atk === 'spread') {
          this.fireSpread(tp, target, dmg, t.def.projSpeed ?? 0.7, t.effPellets || 5, color, size);
        } else if (atk === 'homing') {
          this.fireHoming(tp, best, dmg, t.def.projSpeed ?? 0.6, color, size, trail);
        } else {
          this.fireStraight(tp, target, dmg, t.def.projSpeed ?? 0.9, color, size, trail);
        }
      }
    }
  }

  private pushProj(p: Projectile): void {
    if (this.projectiles.length < MAX_PROJ) this.projectiles.push(p);
  }

  private fireStraight(from: THREE.Vector3, toPos: THREE.Vector3, dmg: number, speed: number, color: THREE.Color, size: number, trailMax: number): void {
    const dir = new THREE.Vector3().subVectors(toPos, from);
    const l = dir.length() || 1;
    dir.multiplyScalar(speed / l);
    this.pushProj({ pos: from.clone(), vel: dir, kind: 'single', target: null, damage: dmg, splash: 0, gravity: 0, ttl: 2, maxTtl: 2, color, size, trail: [], trailMax });
  }

  private fireHoming(from: THREE.Vector3, target: Enemy, dmg: number, speed: number, color: THREE.Color, size: number, trailMax: number): void {
    const dir = new THREE.Vector3().subVectors(target.object.position, from);
    const l = dir.length() || 1;
    dir.multiplyScalar(speed / l);
    this.pushProj({ pos: from.clone(), vel: dir, kind: 'homing', target, damage: dmg, splash: 0, gravity: 0, ttl: 3, maxTtl: 3, color, size, trail: [], trailMax });
  }

  private fireSpread(from: THREE.Vector3, toPos: THREE.Vector3, dmg: number, speed: number, pellets: number, color: THREE.Color, size: number): void {
    const dx = toPos.x - from.x;
    const dz = toPos.z - from.z;
    const base = Math.atan2(dz, dx);
    for (let i = 0; i < pellets; i++) {
      const ang = base + (i - (pellets - 1) / 2) * 0.16;
      const vel = new THREE.Vector3(Math.cos(ang) * speed, 0, Math.sin(ang) * speed);
      this.pushProj({ pos: from.clone(), vel, kind: 'single', target: null, damage: dmg, splash: 0, gravity: 0, ttl: 1.5, maxTtl: 1.5, color, size, trail: [], trailMax: 0 });
    }
    this.spawnBurst(from, 6, { speed: 0.25, up: 0.03, size: size * 1.4, color, ttl: 0.12, gravity: 0 }); // muzzle flash
  }

  private fireMortar(from: THREE.Vector3, targetPos: THREE.Vector3, dmg: number, splash: number, color: THREE.Color, size: number): void {
    const g = 1.8;
    const vy0 = 0.5;
    const T = (2 * vy0) / g; // time to return to launch height
    const vel = new THREE.Vector3((targetPos.x - from.x) / T, vy0, (targetPos.z - from.z) / T);
    this.pushProj({ pos: from.clone(), vel, kind: 'mortar', target: null, damage: dmg, splash, gravity: g, ttl: 3, maxTtl: 3, color, size, trail: [], trailMax: 4 });
  }

  private updateProjectiles(dt: number): void {
    if (this.projectiles.length === 0) {
      this.projGeo.setDrawRange(0, 0);
      return;
    }
    const LAND_Y = 0.02;
    const hitR = this.enemyScale * 1.3 + 0.012;
    const alive: Projectile[] = [];
    for (const p of this.projectiles) {
      p.ttl -= dt;
      if (p.kind === 'mortar' || p.kind === 'spark') {
        p.vel.y -= p.gravity * dt;
      } else if (p.kind === 'homing' && p.target && p.target.alive) {
        const d = this.tmp.subVectors(p.target.object.position, p.pos);
        const dl = d.length() || 1;
        const speed = p.vel.length();
        d.multiplyScalar(speed / dl);
        const k = Math.min(1, 6 * dt); // steer rate
        p.vel.x += (d.x - p.vel.x) * k;
        p.vel.y += (d.y - p.vel.y) * k;
        p.vel.z += (d.z - p.vel.z) * k;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.trailMax > 0) {
        p.trail.unshift(p.pos.clone());
        while (p.trail.length > p.trailMax) p.trail.pop();
      }

      let done = false;
      if (p.kind === 'spark') {
        // decorative only — no collision, expires on ttl
      } else if (p.kind === 'mortar') {
        if (p.vel.y < 0 && p.pos.y <= LAND_Y) {
          for (const e of this.enemies) {
            if (!e.alive) continue;
            const ep = e.object.position;
            if (Math.hypot(ep.x - p.pos.x, ep.z - p.pos.z) <= p.splash) e.damage(p.damage);
          }
          const landing = new THREE.Vector3(p.pos.x, LAND_Y, p.pos.z);
          this.spawnRing(landing, p.splash * 1.7, p.color); // shockwave
          this.spawnBurst(landing, 16, { speed: 0.5, up: 0.13, size: p.size * 0.5, color: p.color, ttl: 0.4, gravity: 1.2 }); // debris
          done = true;
        }
      } else {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const ep = e.object.position;
          if (Math.hypot(ep.x - p.pos.x, ep.y - p.pos.y, ep.z - p.pos.z) <= hitR) {
            e.damage(p.damage);
            this.spawnBurst(p.pos, 4, { speed: 0.14, up: 0.02, size: p.size * 0.9, color: p.color, ttl: 0.14, gravity: 0 }); // hit spark
            done = true;
            break;
          }
        }
      }
      if (!done && p.ttl > 0) alive.push(p);
    }
    this.projectiles = alive;

    // fill render buffer: each projectile + its fading trail ghosts, capped.
    let n = 0;
    const push = (x: number, y: number, z: number, c: THREE.Color, bright: number, size: number): void => {
      if (n >= MAX_PROJ) return;
      this.projPos[n * 3] = x;
      this.projPos[n * 3 + 1] = y;
      this.projPos[n * 3 + 2] = z;
      this.projCol[n * 3] = c.r * bright;
      this.projCol[n * 3 + 1] = c.g * bright;
      this.projCol[n * 3 + 2] = c.b * bright;
      this.projSize[n] = size;
      n++;
    };
    for (const p of alive) {
      const bright = p.kind === 'spark' ? Math.max(0, p.ttl / p.maxTtl) : 1;
      push(p.pos.x, p.pos.y, p.pos.z, p.color, bright, p.size);
      for (let i = 0; i < p.trail.length; i++) {
        const tp = p.trail[i]!;
        const f = 1 - (i + 1) / (p.trail.length + 1);
        push(tp.x, tp.y, tp.z, p.color, bright * f * 0.85, p.size * (0.4 + 0.6 * f));
      }
    }
    this.projGeo.setDrawRange(0, n);
    (this.projGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.projGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.projGeo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Remove killed (0 HP) and leaked (reached base) enemies, firing callbacks. */
  private cullEnemies(): void {
    if (!this.enemies.some((e) => !e.alive || e.reachedEnd)) return;
    const remove = this.enemies.filter((e) => !e.alive || e.reachedEnd);
    const rem = new Set<Enemy>(remove);
    for (const e of remove) {
      this.unitsGroup.remove(e.object);
      e.dispose();
      if (e.reachedEnd) {
        this.onLeak?.();
      } else {
        this.onKill?.(e);
        // death poof: scatter the enemy's own colour
        this.spawnBurst(e.object.position, 12, { speed: 0.16, up: 0.05, size: this.enemyScale * 0.5, color: new THREE.Color(e.def.color), ttl: 0.45, gravity: 0.4 });
      }
    }
    this.enemies = this.enemies.filter((e) => !rem.has(e));
    this.units = this.units.filter((u) => !rem.has(u as Enemy));
  }

  /** Beam/laser: a bright lance from the tower extending past the target, plus a
   * halo flash at the impact point. Lingers a touch for a "laser" read. */
  private spawnLaser(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color): void {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length() || 1;
    dir.multiplyScalar(1 / len);
    const end = to.clone().addScaledVector(dir, 0.05); // extend beyond the target
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), end]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    this.effectsGroup.add(line);
    this.effects.push({ line, mat, ttl: 0.18, max: 0.18 });
    this.spawnBurst(to, 5, { speed: 0.12, up: 0.02, size: 0.05, color, ttl: 0.18, gravity: 0 }); // impact halo
  }

  /** Emit `count` decorative spark particles (muzzle flash, impact, debris, poof). */
  private spawnBurst(
    pos: THREE.Vector3,
    count: number,
    o: { speed: number; up: number; size: number; color: THREE.Color; ttl: number; gravity: number },
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * 1.2;
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.abs(Math.sin(el)), Math.sin(a) * Math.cos(el));
      const vel = dir.multiplyScalar(o.speed * (0.5 + Math.random()));
      vel.y += o.up;
      this.pushProj({ pos: pos.clone(), vel, kind: 'spark', target: null, damage: 0, splash: 0, gravity: o.gravity, ttl: o.ttl, maxTtl: o.ttl, color: o.color.clone(), size: o.size, trail: [], trailMax: 0 });
    }
  }

  /** Expanding shockwave ring on the ground (mortar splash). */
  private spawnRing(pos: THREE.Vector3, radius: number, color: THREE.Color): void {
    const seg = 28;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.LineLoop(geo, mat);
    ring.position.set(pos.x, 0.02, pos.z);
    ring.scale.setScalar(0.001);
    this.effectsGroup.add(ring);
    this.rings.push({ mesh: ring, mat, ttl: 0.45, max: 0.45, maxScale: radius });
  }

  private updateEffects(dt: number): void {
    if (this.effects.length) {
      const keep: typeof this.effects = [];
      for (const e of this.effects) {
        e.ttl -= dt;
        if (e.ttl <= 0) {
          this.effectsGroup.remove(e.line);
          e.line.geometry.dispose();
          e.mat.dispose();
        } else {
          e.mat.opacity = e.ttl / e.max;
          keep.push(e);
        }
      }
      this.effects = keep;
    }
    if (this.rings.length) {
      const keep: typeof this.rings = [];
      for (const r of this.rings) {
        r.ttl -= dt;
        if (r.ttl <= 0) {
          this.effectsGroup.remove(r.mesh);
          r.mesh.geometry.dispose();
          r.mat.dispose();
        } else {
          const t = 1 - r.ttl / r.max;
          r.mesh.scale.setScalar(Math.max(0.001, r.maxScale * (0.2 + 0.8 * t)));
          r.mat.opacity = 1 - t;
          keep.push(r);
        }
      }
      this.rings = keep;
    }
  }

  private addMarker(cell: Cell, color: number): void {
    const r = cellRadius(cell) * 0.7;
    const geo = new THREE.RingGeometry(r * 0.6, r, 6);
    const wire = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color });
    const ring = new THREE.LineSegments(wire, mat);
    const w = toWorld(cell.center);
    ring.position.set(w[0], 0.005, w[2]);
    ring.rotation.x = -Math.PI / 2;
    this.boardGroup.add(ring);
    this.disposables.push(geo, wire, mat);
  }

  /** Resolve a screen tap to a cell id (or null). clientX/Y in CSS pixels. */
  pick(clientX: number, clientY: number): { id: number; cell: Cell } | null {
    if (!this.board) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    const bx = hit.x + 0.5;
    const by = hit.z + 0.5;
    for (const cell of this.board.cells.values()) {
      if (pointInPolygon(bx, by, cell.polygon)) return { id: cell.id, cell };
    }
    return null;
  }

  /** Project a cell centre to CSS-pixel screen coords (for tests / tooltips). */
  cellScreenPos(cellId: number): { x: number; y: number } | null {
    if (!this.board) return null;
    const c = this.board.cells.get(cellId);
    if (!c) return null;
    const w = toWorld(c.center);
    const v = new THREE.Vector3(w[0], 0, w[2]).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
    };
  }

  highlightCell(cell: Cell | null): void {
    if (this.highlight) {
      this.boardGroup.remove(this.highlight);
      this.highlight.geometry.dispose();
      (this.highlight.material as THREE.Material).dispose();
      this.highlight = null;
    }
    if (!cell) return;

    // Raised cells (buildable platforms / blocked walls) are outlined as the
    // whole block — inset top ring + vertical ribs + base ring — so the
    // selection is visible on top, not hidden at the ground. Low path cells
    // just get their ground ring.
    const raised = cell.terrain === 'buildable' || cell.terrain === 'blocked';
    const H = raised ? WALL_HEIGHT : 0.012;
    const poly = cell.polygon;
    const n = poly.length;
    const segs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = raised ? this.insetWorld(cell, poly[i]!) : toWorld(poly[i]!);
      const b = raised ? this.insetWorld(cell, poly[(i + 1) % n]!) : toWorld(poly[(i + 1) % n]!);
      segs.push(a[0], H, a[2], b[0], H, b[2]); // top ring
      if (raised) {
        segs.push(a[0], 0, a[2], b[0], 0, b[2]); // base ring
        segs.push(a[0], 0, a[2], a[0], H, a[2]); // vertical rib
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
    this.highlight = new THREE.LineSegments(geo, mat);
    this.boardGroup.add(this.highlight);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clockStart = performance.now() / 1000;
    this.lastT = this.clockStart;
    const loop = (): void => {
      if (!this.running) return;
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - this.lastT);
      this.lastT = now;
      const elapsed = now - this.clockStart;
      for (const u of this.units) u.update(dt, elapsed);
      if (this.baseHeart) this.baseHeart.update(dt, elapsed);
      this.stepCombat(dt);
      this.updateProjectiles(dt);
      this.cullEnemies();
      this.updateEffects(dt);
      if (this.onTick) this.onTick(dt);
      this.composer.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }

  private resize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private clearGroup(): void {
    this.boardGroup.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.highlight = null;
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    if (this.baseHeart) {
      this.scene.remove(this.baseHeart.object);
      this.baseHeart.dispose();
      this.baseHeart = null;
    }
    this.clearUnits();
    this.clearGroup();
    this.renderer.dispose();
  }
}
