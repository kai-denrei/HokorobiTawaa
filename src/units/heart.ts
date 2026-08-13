// heart.ts — the Braille "Heart" halftone point cloud + breathe/wave treatments,
// pure (no THREE, no DOM). Ported from Braille Lab "Fun Shapes" (Thinking Orbs
// engine, MIT © Jakub Antalik; shape geometry original to Braille Lab). Used by
// the base-exit heart health meter.

type P = number[];

function normV(v: P): P {
  const l = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!) || 1e-6;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}
function fibDir(i: number, n: number): P {
  const g = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const a = i * g;
  return [r * Math.cos(a), y, r * Math.sin(a)];
}
function fitUnit(pts: P[]): P[] {
  let m = 0;
  for (const p of pts) m = Math.max(m, Math.hypot(p[0]!, p[1]!, p[2]!));
  if (m < 1e-9) m = 1;
  return pts.map((p) => [p[0]! / m, p[1]! / m, p[2]! / m]);
}
function rotY(p: P, a: number): P {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0]! * c + p[2]! * s, p[1]!, -p[0]! * s + p[2]! * c];
}
function heartF(x: number, y: number, z: number): number {
  const X = x;
  const Y = z;
  const Z = y;
  const a = X * X + 2.25 * Y * Y + Z * Z - 1;
  return a * a * a - X * X * Z * Z * Z - 0.1125 * Y * Y * Z * Z * Z;
}
function warp(dir: P): P {
  const d = normV(dir);
  let thi = 0.1;
  let f = heartF(d[0]! * thi, d[1]! * thi, d[2]! * thi);
  let g = 0;
  while (f < 0 && thi < 5 && g < 50) {
    thi *= 1.35;
    f = heartF(d[0]! * thi, d[1]! * thi, d[2]! * thi);
    g++;
  }
  let tlo = 0;
  let th = thi;
  for (let i = 0; i < 20; i++) {
    const tm = (tlo + th) * 0.5;
    if (heartF(d[0]! * tm, d[1]! * tm, d[2]! * tm) < 0) tlo = tm;
    else th = tm;
  }
  const t = (tlo + th) * 0.5;
  return [d[0]! * t, d[1]! * t, d[2]! * t];
}

/** Unit heart points, shuffled so truncating by health thins uniformly. */
export function heartPointsShuffled(): P[] {
  const pts = fitUnit(Array.from({ length: 760 }, (_, i) => warp(fibDir(i, 760))));
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pts[i], pts[j]] = [pts[j]!, pts[i]!];
  }
  return pts;
}

/** Resting "health" motion: gentle scale pulse + slow spin. */
export function breathe(base: P[], t: number): P[] {
  const s = 1 + 0.17 * Math.sin(t * 2);
  return base.map((p) => rotY([p[0]! * s, p[1]! * s, p[2]! * s], t * 0.3));
}

/** "Hurt" motion: radial ripple + slow spin. */
export function wave(base: P[], t: number): P[] {
  return base.map((p) => {
    const d = 1 + 0.14 * Math.sin(3 * Math.atan2(p[2]!, p[0]!) + t * 3 - p[1]! * 2);
    return rotY([p[0]! * d, p[1]!, p[2]! * d], t * 0.3);
  });
}
