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
import { Unit, Enemy } from '../units/unit';
import { UNIT_BY_KEY } from '../units/roster';

export type MountainStyle = 'wire' | 'solid';

const toWorld = (p: Vec2): [number, number, number] => [p[0] - 0.5, 0, p[1] - 0.5];

/** Approx cell radius = mean distance center→polygon vertices. */
function cellRadius(cell: Cell): number {
  let s = 0;
  for (const v of cell.polygon) s += Math.hypot(v[0] - cell.center[0], v[1] - cell.center[1]);
  return cell.polygon.length ? s / cell.polygon.length : 0.02;
}

/** Uniform flat elevation (world units) for blocked "wall" cells, so blocked
 * terrain reads as walls and the path/buildable cells as low hallways. */
const WALL_HEIGHT = 0.06;

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
  private highlight: THREE.LineLoop | null = null;
  private board: Board | null = null;
  private mountainStyle: MountainStyle = 'solid';
  private unitsGroup = new THREE.Group();
  private units: Unit[] = [];
  private unitScale = 0.05;
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

    // Batch cell outlines per terrain into single LineSegments for few draw calls.
    const buildableSegs: number[] = [];
    const pathSegs: number[] = [];
    const mountainSegs: number[] = [];
    const mountainTris: number[] = [];

    for (const cell of board.cells.values()) {
      if (cell.terrain === 'blocked') {
        if (this.mountainStyle === 'solid') this.pushMountainSolid(mountainTris, cell);
        else this.pushMountain(mountainSegs, cell);
        continue;
      }
      const target = cell.terrain === 'path' || cell.terrain === 'spawn' || cell.terrain === 'base'
        ? pathSegs
        : buildableSegs;
      const poly = cell.polygon;
      for (let i = 0; i < poly.length; i++) {
        const a = toWorld(poly[i]!);
        const b = toWorld(poly[(i + 1) % poly.length]!);
        target.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }

    this.addLineSegments(buildableSegs, THEME.buildable, THEME.buildableDim);
    this.addLineSegments(pathSegs, THEME.path, 1.0);
    this.addLineSegments(mountainSegs, THEME.mountainWire, 0.95);
    this.addSolidMountains(mountainTris);

    // Accent markers for spawn(s) and base — small upright rings.
    for (const s of board.spawns) this.addMarker(board.cells.get(s)!, THEME.spawn);
    this.addMarker(board.cells.get(board.base)!, THEME.base);
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

  /** Wireframe wall: the cell polygon at ground + a flat top ring at WALL_HEIGHT,
   * joined by vertical ribs. Flat top (not a peak) reads as a raised block. */
  private pushMountain(target: number[], cell: Cell): void {
    const poly = cell.polygon;
    const n = poly.length;
    if (n < 3) return;
    const H = WALL_HEIGHT;
    for (let i = 0; i < n; i++) {
      const a = toWorld(poly[i]!);
      const b = toWorld(poly[(i + 1) % n]!);
      target.push(a[0], 0, a[2], b[0], 0, b[2]); // base edge
      target.push(a[0], H, a[2], b[0], H, b[2]); // top edge (flat)
      target.push(a[0], 0, a[2], a[0], H, a[2]); // vertical rib
    }
  }

  /** Solid wall: vertical side quads (2 tris/edge) + a flat top cap (fan from the
   * cell centre). DoubleSide material makes winding irrelevant. */
  private pushMountainSolid(target: number[], cell: Cell): void {
    const poly = cell.polygon;
    const n = poly.length;
    if (n < 3) return;
    const H = WALL_HEIGHT;
    const c = toWorld(cell.center);
    for (let i = 0; i < n; i++) {
      const a = toWorld(poly[i]!);
      const b = toWorld(poly[(i + 1) % n]!);
      // side wall (ground a→b up to top a→b)
      target.push(a[0], 0, a[2], b[0], 0, b[2], b[0], H, b[2]);
      target.push(a[0], 0, a[2], b[0], H, b[2], a[0], H, a[2]);
      // flat top cap triangle (centre → edge)
      target.push(c[0], H, c[2], a[0], H, a[2], b[0], H, b[2]);
    }
  }

  private addSolidMountains(positions: number[]): void {
    if (positions.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: THEME.mountainSolid,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.boardGroup.add(mesh);
    this.disposables.push(geo, mat);
  }

  /** Switch mountains between wireframe and solid; rebuilds the current board. */
  setMountainStyle(style: MountainStyle): void {
    if (this.mountainStyle === style) return;
    this.mountainStyle = style;
    if (this.board) this.setBoard(this.board);
  }

  /** Place a tower (static dotted unit) on a cell. Returns its role label or null. */
  spawnTower(cellId: number, key: string): string | null {
    if (!this.board) return null;
    const cell = this.board.cells.get(cellId);
    const def = UNIT_BY_KEY[key];
    if (!cell || !def || def.family !== 'tower') return null;
    const u = new Unit(def, this.unitScale, this.units.length);
    const w = toWorld(cell.center);
    u.placeAt(w[0], w[2]);
    this.unitsGroup.add(u.object);
    this.units.push(u);
    return def.label;
  }

  /** Spawn an enemy that walks the board path from spawn to base, looping. */
  spawnEnemy(key: string): string | null {
    if (!this.board) return null;
    const def = UNIT_BY_KEY[key];
    if (!def || def.family !== 'enemy') return null;
    const pts = this.board.path.map((id) => {
      const w = toWorld(this.board!.cells.get(id)!.center);
      return new THREE.Vector3(w[0], 0, w[2]);
    });
    if (pts.length < 2) return null;
    const e = new Enemy(def, this.unitScale, this.units.length, pts, 0.11);
    this.unitsGroup.add(e.object);
    this.units.push(e);
    return def.label;
  }

  clearUnits(): void {
    for (const u of this.units) {
      this.unitsGroup.remove(u.object);
      u.dispose();
    }
    this.units = [];
  }

  get unitCount(): number {
    return this.units.length;
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
    const pts = cell.polygon.map((p) => {
      const w = toWorld(p);
      return new THREE.Vector3(w[0], 0.01, w[2]);
    });
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
    this.highlight = new THREE.LineLoop(geo, mat);
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
    this.clearUnits();
    this.clearGroup();
    this.renderer.dispose();
  }
}
