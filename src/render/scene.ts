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
import type { Board, Cell } from '../board';
import { THEME, BLOOM } from './theme';
import { Unit, Enemy } from '../units/unit';
import { UNIT_BY_KEY, upgradeCost, REFUND_FRACTION } from '../units/roster';
import { HeartBase } from './heart-base';
import { EffectsSystem } from './effects';
import {
  toWorld, WALL_HEIGHT, cellRadius, insetPolygon, pointInPolygon, insetWorld,
  appendBlockWire, appendBlockSolid,
} from './coords';

export type MountainStyle = 'wire' | 'solid';

// Projectiles + transient FX live in ./effects (EffectsSystem).

// Pure coordinate + block-geometry helpers live in ./coords (unit-tested).

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
  private fx: EffectsSystem;
  private towerScale = 0.045;
  private enemyScale = 0.03;
  private baseHeart: HeartBase | null = null;
  private rangeRing: THREE.LineLoop | null = null;
  private rangeTTL = 0;
  /** World-space point lists for each currently-open alternate route. Enemies
   * pick the main path or any of these at random. */
  private openAltPaths: THREE.Vector3[][] = [];
  /** Which alt indices are already open (guards re-opening across loops). */
  private openedAltIndices = new Set<number>();
  /** Alt index whose reveal animation is in flight (added once it finishes). */
  private pendingAltIndex = -1;
  private pathAnim: { group: THREE.Group; t: number } | null = null;
  /** Game hooks: per-frame tick, enemy reached base (leak), enemy killed. */
  onTick: ((dt: number) => void) | null = null;
  onLeak: (() => void) | null = null;
  onKill: ((e: Enemy) => void) | null = null;
  private clockStart = 0;
  private lastT = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private topPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WALL_HEIGHT);
  private disposables: { dispose(): void }[] = [];
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(THEME.background);
    this.scene.add(this.boardGroup);
    this.scene.add(this.unitsGroup);
    this.scene.add(this.effectsGroup);

    // projectiles + transient FX, reading enemies/scale back from this view.
    this.fx = new EffectsSystem(this.effectsGroup, () => this.enemies, () => this.enemyScale);

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
    this.openAltPaths = [];
    this.openedAltIndices.clear();
    if (this.pathAnim) {
      this.scene.remove(this.pathAnim.group);
      this.pathAnim = null;
    }

    // adapt unit sizes to this board's cell size (denser board → smaller cells
    // → smaller towers/enemies) so they always sit sensibly on a platform.
    const radii = [...board.cells.values()].map((c) => cellRadius(c)).sort((a, b) => a - b);
    const medR = radii.length ? radii[radii.length >> 1]! : 0.05;
    this.towerScale = medR * 0.72; // tower footprint ≈ 0.7× the cell radius
    this.enemyScale = medR * 0.5;
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
        if (solid) appendBlockSolid(buildTris, cell);
        else appendBlockWire(buildWire, cell);
      } else if (cell.terrain === 'blocked') {
        if (solid) appendBlockSolid(blockTris, cell);
        else appendBlockWire(blockWire, cell);
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
  towerInfo(cellId: number): { label: string; tier: number; nextCost: number | null; sellValue: number; range: number; color: number } | null {
    const t = this.towerByCell.get(cellId);
    if (!t) return null;
    return {
      label: t.def.label,
      tier: t.tier,
      nextCost: upgradeCost(t.def, t.tier),
      sellValue: Math.round(t.spent * REFUND_FRACTION),
      range: t.effRange,
      color: t.def.color,
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
    // Pick uniformly among the main path and any open alternate routes.
    const routeCount = 1 + this.openAltPaths.length;
    const routePick = (Math.random() * routeCount) | 0;
    const pts =
      routePick > 0 && this.openAltPaths[routePick - 1]
        ? this.openAltPaths[routePick - 1]!.map((v) => v.clone())
        : this.board.path.map((id) => {
            const w = toWorld(this.board!.cells.get(id)!.center);
            return new THREE.Vector3(w[0], 0, w[2]);
          });
    if (pts.length < 2) return null;
    const e = new Enemy(def, this.enemyScale, this.units.length, pts, def.speed ?? 0.12, 0, hpScale);
    this.unitsGroup.add(e.object);
    this.units.push(e);
    this.enemies.push(e);
    return def.label;
  }

  /** Draw a range ring on the ground at a cell. ttl>0 auto-hides after ttl secs. */
  showRange(cellId: number, radius: number, color: number, ttl = 0): void {
    this.hideRange();
    if (!this.board || radius <= 0) return;
    const cell = this.board.cells.get(cellId);
    if (!cell) return;
    const w = toWorld(cell.center);
    const seg = 48;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rangeRing = new THREE.LineLoop(geo, mat);
    this.rangeRing.position.set(w[0], 0.03, w[2]);
    this.scene.add(this.rangeRing);
    this.rangeTTL = ttl;
  }

  hideRange(): void {
    if (this.rangeRing) {
      this.scene.remove(this.rangeRing);
      this.rangeRing.geometry.dispose();
      (this.rangeRing.material as THREE.Material).dispose();
      this.rangeRing = null;
    }
    this.rangeTTL = 0;
  }

  /** Base-heart health (0..1) and hit flash — driven by the game. */
  setBaseLives(frac: number): void {
    this.baseHeart?.setLives(frac);
  }

  hitBase(): void {
    this.baseHeart?.hit();
  }

  /** Open alternate route `index` (0 or 1): highlight → flash the raised tiles →
   * they vanish into a low hallway; afterwards enemies may walk it. Idempotent
   * and a no-op if the board has no such alternate or an animation is running. */
  openPath(index: number): void {
    const alt = this.board?.altPaths[index];
    if (!this.board || !alt || this.openedAltIndices.has(index) || this.pathAnim) return;
    this.openedAltIndices.add(index);
    this.pendingAltIndex = index;
    const interior = alt.slice(1, -1);
    for (const id of interior) {
      const c = this.board.cells.get(id);
      if (c) c.terrain = 'path'; // data now; visuals swap when the anim ends
    }
    // bright overlay = the raised blocks of the opening cells (flashed)
    const tris: number[] = [];
    const wire: number[] = [];
    for (const id of interior) {
      const c = this.board.cells.get(id);
      if (!c) continue;
      appendBlockSolid(tris, c);
      appendBlockWire(wire, c);
    }
    const group = new THREE.Group();
    if (tris.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
      g.computeVertexNormals();
      group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x8affc0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })));
    }
    if (wire.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
      group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    }
    this.scene.add(group);
    this.pathAnim = { group, t: 0 };
  }

  private stepPathAnim(dt: number): void {
    const a = this.pathAnim!;
    a.t += dt;
    if (a.t < 0.6) {
      a.group.visible = true; // highlight
    } else if (a.t < 1.7) {
      a.group.visible = Math.floor((a.t - 0.6) * 7) % 2 === 0; // flash on/off
    } else {
      this.scene.remove(a.group);
      for (const child of a.group.children) {
        const c = child as THREE.Mesh | THREE.LineSegments;
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
      this.pathAnim = null;
      this.clearGroup();
      this.buildTerrain(); // opening cells are now low 'path'
      const alt = this.board!.altPaths[this.pendingAltIndex];
      if (alt) {
        this.openAltPaths.push(
          alt.map((id) => {
            const w = toWorld(this.board!.cells.get(id)!.center);
            return new THREE.Vector3(w[0], 0, w[2]);
          }),
        );
      }
      this.pendingAltIndex = -1;
    }
  }

  clearUnits(): void {
    this.hideRange();
    for (const u of this.units) {
      this.unitsGroup.remove(u.object);
      u.dispose();
    }
    this.units = [];
    this.towers = [];
    this.towerByCell.clear();
    this.enemies = [];
    this.fx.reset();
  }

  get unitCount(): number {
    return this.units.length;
  }

  get enemyCount(): number {
    return this.enemies.length;
  }

  /** Blue-aura enemies grant a speed multiplier to nearby enemies each frame. */
  private stepAura(): void {
    if (this.enemies.length === 0) return;
    for (const e of this.enemies) e.auraMult = 1;
    for (const src of this.enemies) {
      const boost = src.def.auraBoost;
      if (!boost || !src.alive) continue;
      const range = src.def.auraRange ?? 0.12;
      const sp = src.object.position;
      for (const e of this.enemies) {
        if (e === src) continue;
        const ep = e.object.position;
        if (Math.hypot(ep.x - sp.x, ep.z - sp.z) <= range) e.auraMult = Math.max(e.auraMult, boost);
      }
    }
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
          this.fx.spawnLaser(tp, target, color);
        } else if (atk === 'mortar') {
          this.fx.fireMortar(tp, target, dmg, t.effSplash || 0.06, color, size);
        } else if (atk === 'spread') {
          this.fx.fireSpread(tp, target, dmg, t.def.projSpeed ?? 0.7, t.effPellets || 5, color, size);
        } else if (atk === 'homing') {
          this.fx.fireHoming(tp, best, dmg, t.def.projSpeed ?? 0.6, color, size, trail);
        } else if (atk === 'slow') {
          this.fx.fireSlowField(tp, range, dmg, color, t.def.slowFactor ?? 0.5, t.def.slowDur ?? 1.5);
        } else {
          this.fx.fireStraight(tp, target, dmg, t.def.projSpeed ?? 0.9, color, size, trail);
        }
      }
    }
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
        this.fx.spawnBurst(e.object.position, 12, { speed: 0.16, up: 0.05, size: this.enemyScale * 0.5, color: new THREE.Color(e.def.color), ttl: 0.45, gravity: 0.4 });
      }
    }
    this.enemies = this.enemies.filter((e) => !rem.has(e));
    this.units = this.units.filter((u) => !rem.has(u as Enemy));
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

    // 1) raised cells (buildable/blocked) — test the tap against their INSET TOP
    //    (the visible platform surface at WALL_HEIGHT), not the hidden footprint.
    const hitTop = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.topPlane, hitTop)) {
      const bx = hitTop.x + 0.5;
      const by = hitTop.z + 0.5;
      for (const cell of this.board.cells.values()) {
        if (cell.terrain !== 'buildable' && cell.terrain !== 'blocked') continue;
        if (pointInPolygon(bx, by, insetPolygon(cell))) return { id: cell.id, cell };
      }
    }
    // 2) low cells (path/spawn/base) — test the ground footprint.
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      const bx = hit.x + 0.5;
      const by = hit.z + 0.5;
      for (const cell of this.board.cells.values()) {
        if (cell.terrain === 'buildable' || cell.terrain === 'blocked') continue;
        if (pointInPolygon(bx, by, cell.polygon)) return { id: cell.id, cell };
      }
    }
    return null;
  }

  /** Project a cell centre to CSS-pixel screen coords (for tests / tooltips). */
  cellScreenPos(cellId: number): { x: number; y: number } | null {
    if (!this.board) return null;
    const c = this.board.cells.get(cellId);
    if (!c) return null;
    const w = toWorld(c.center);
    const y = c.terrain === 'buildable' || c.terrain === 'blocked' ? WALL_HEIGHT : 0;
    const v = new THREE.Vector3(w[0], y, w[2]).project(this.camera);
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
      const a = raised ? insetWorld(cell, poly[i]!) : toWorld(poly[i]!);
      const b = raised ? insetWorld(cell, poly[(i + 1) % n]!) : toWorld(poly[(i + 1) % n]!);
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
      if (this.pathAnim) this.stepPathAnim(dt);
      this.stepAura();
      for (const u of this.units) u.update(dt, elapsed);
      if (this.baseHeart) this.baseHeart.update(dt, elapsed);
      if (this.rangeTTL > 0) {
        this.rangeTTL -= dt;
        if (this.rangeTTL <= 0) this.hideRange();
      }
      this.stepCombat(dt);
      this.fx.updateProjectiles(dt);
      this.cullEnemies();
      this.fx.updateEffects(dt);
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
    this.fx.dispose();
    this.clearGroup();
    this.renderer.dispose();
  }
}
