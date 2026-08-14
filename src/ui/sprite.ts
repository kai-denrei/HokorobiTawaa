// sprite.ts — draw a ported point-cloud shape as a static 2D "sprite" on a
// canvas. Orthographic projection of the unit-normalised points at a fixed
// tilted 3/4 angle (matching the game's tilted camera + halftone dots), with
// per-unit colour and depth-shaded, depth-sorted dots. Used by the Rules panel
// Towers / Enemies galleries — no WebGL, drawn once and cached.

import { SHAPES } from '../units/shapes';
import type { UnitDef } from '../units/roster';

type P3 = [number, number, number];

function rotX(p: P3, a: number): P3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function rotY(p: P3, a: number): P3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

/** Render `def`'s shape into `canvas` at CSS size `size` (px, square). */
export function drawSprite(canvas: HTMLCanvasElement, def: UnitDef, size = 88): void {
  const shape = SHAPES[def.shape ?? def.key];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  if (!ctx || !shape) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const c1 = hexToRgb(def.color);
  const c2 = def.color2 != null ? hexToRgb(def.color2) : null;

  // static orientation (rotX baked as in-game) then a tilted 3/4 view.
  const view = { ay: 0.62, ax: 0.5 };
  const n = shape.count;
  const proj: { x: number; y: number; z: number; c: [number, number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    let p: P3 = [shape.positions[i * 3]!, shape.positions[i * 3 + 1]!, shape.positions[i * 3 + 2]!];
    if (def.rotX) p = rotX(p, def.rotX);
    p = rotY(p, view.ay);
    p = rotX(p, view.ax);
    proj.push({ x: p[0], y: p[1], z: p[2], c: c2 && i % 3 === 0 ? c2 : c1 });
  }
  proj.sort((a, b) => a.z - b.z); // far → near

  const cx = size / 2;
  const cy = size / 2;
  const s = size * 0.4;
  const dot = Math.max(1.1, size * 0.017);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of proj) {
    const depth = (p.z + 1) / 2; // 0 far … 1 near
    const a = 0.35 + 0.65 * depth;
    const px = cx + p.x * s;
    const py = cy - p.y * s;
    ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${a})`;
    ctx.beginPath();
    ctx.arc(px, py, dot * (0.75 + 0.35 * depth), 0, Math.PI * 2);
    ctx.fill();
  }
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
