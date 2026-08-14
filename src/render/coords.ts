// coords.ts — pure board↔world coordinate + block-geometry helpers.
//
// Board space is normalized [0,1]² (x, y). We render on the XZ ground plane
// centered at the origin: worldX = x - 0.5, worldZ = y - 0.5, Y up. So the board
// spans [-0.5, 0.5]². Everything here is pure (no Three.js, no scene state) so it
// is unit-testable and shared by scene.ts + the terrain builder.

import type { Cell, Vec2 } from '../board';

/** Board [0,1]² point → world XZ (Y=0). */
export const toWorld = (p: Vec2): [number, number, number] => [p[0] - 0.5, 0, p[1] - 0.5];

/** Uniform flat elevation (world units) for raised cells (buildable platforms +
 * blocked walls). The path stays at ground as a low hallway. */
export const WALL_HEIGHT = 0.06;

/** Shrink each raised block toward its centre so adjacent blocks leave a gap —
 * cleaner hallway read and clearance so walking enemies don't clip walls. */
export const BLOCK_INSET = 0.84;

/** Approx cell radius = mean distance center→polygon vertices. */
export function cellRadius(cell: Cell): number {
  let s = 0;
  for (const v of cell.polygon) s += Math.hypot(v[0] - cell.center[0], v[1] - cell.center[1]);
  return cell.polygon.length ? s / cell.polygon.length : 0.02;
}

/** Board-space inset polygon matching a raised block's rendered top (BLOCK_INSET). */
export function insetPolygon(cell: Cell): Vec2[] {
  const cx = cell.center[0];
  const cy = cell.center[1];
  return cell.polygon.map((p) => [cx + (p[0] - cx) * BLOCK_INSET, cy + (p[1] - cy) * BLOCK_INSET] as Vec2);
}

/** point-in-polygon (ray cast), board-space. */
export function pointInPolygon(px: number, py: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0];
    const yi = poly[i]![1];
    const xj = poly[j]![0];
    const yj = poly[j]![1];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Inset a cell-polygon vertex toward the cell centre (BLOCK_INSET), then to
 * world XZ — leaves a gap between adjacent raised blocks. */
export function insetWorld(cell: Cell, p: Vec2): [number, number, number] {
  const bx = cell.center[0] + (p[0] - cell.center[0]) * BLOCK_INSET;
  const by = cell.center[1] + (p[1] - cell.center[1]) * BLOCK_INSET;
  return toWorld([bx, by]);
}

/** Append a wireframe raised block (inset base ring + flat top ring at
 * WALL_HEIGHT, joined by vertical ribs) as line-segment position triples. */
export function appendBlockWire(target: number[], cell: Cell): void {
  const poly = cell.polygon;
  const n = poly.length;
  if (n < 3) return;
  const H = WALL_HEIGHT;
  for (let i = 0; i < n; i++) {
    const a = insetWorld(cell, poly[i]!);
    const b = insetWorld(cell, poly[(i + 1) % n]!);
    target.push(a[0], 0, a[2], b[0], 0, b[2]); // base edge
    target.push(a[0], H, a[2], b[0], H, b[2]); // flat top edge
    target.push(a[0], 0, a[2], a[0], H, a[2]); // vertical rib
  }
}

/** Append a solid raised block (side quads + flat top cap fanned from the cell
 * centre) as triangle-list position triples. DoubleSide material at draw time. */
export function appendBlockSolid(target: number[], cell: Cell): void {
  const poly = cell.polygon;
  const n = poly.length;
  if (n < 3) return;
  const H = WALL_HEIGHT;
  const c = toWorld(cell.center);
  for (let i = 0; i < n; i++) {
    const a = insetWorld(cell, poly[i]!);
    const b = insetWorld(cell, poly[(i + 1) % n]!);
    target.push(a[0], 0, a[2], b[0], 0, b[2], b[0], H, b[2]);
    target.push(a[0], 0, a[2], b[0], H, b[2], a[0], H, a[2]);
    target.push(c[0], H, c[2], a[0], H, a[2], b[0], H, b[2]);
  }
}
