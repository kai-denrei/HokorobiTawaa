// shapes.ts — dotted-halftone point-cloud generators, ported verbatim from
// Braille Lab "Fun Shapes", built on the Thinking Orbs engine
// (MIT © Jakub Antalik; shape geometry original to Braille Lab). Each generator
// returns unit-normalised 3D points; we render them as THREE.Points instead of
// Braille's 2D canvas painter. Only the tower/enemy roster is ported here.
//
// A point is [x, y, z] (y up). fitUnit may append a 4th "highlight" flag which
// we drop when flattening to GPU buffers.

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

// ---- tower shapes ----------------------------------------------------------
function gearPts(): P[] {
  const pts: P[] = [];
  const teeth = 10;
  const Ro = 1;
  const Ri = 0.74;
  const hub = 0.26;
  const Nang = teeth * 10;
  for (let i = 0; i < Nang; i++) {
    const a = (i / Nang) * 2 * Math.PI;
    const top = Math.floor((a / (2 * Math.PI)) * teeth * 2) % 2 === 0 ? Ro : Ri;
    for (let rr = 0.5; rr <= top + 1e-9; rr += 0.085) pts.push([rr * Math.cos(a), rr * Math.sin(a), 0]);
  }
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * 2 * Math.PI;
    pts.push([hub * Math.cos(a), hub * Math.sin(a), 0]);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * 2 * Math.PI;
    for (let rr = hub; rr < 0.55; rr += 0.075) pts.push([rr * Math.cos(a), rr * Math.sin(a), 0]);
  }
  return fitUnit(pts);
}
function spiralPts(): P[] {
  const N = 470;
  const pts: P[] = [];
  for (let i = 0; i < N; i++) {
    const s = i / N;
    const th = s * 7 * 2 * Math.PI;
    const rad = 0.1 + 0.95 * s;
    const y = (s - 0.5) * 1.5;
    pts.push([rad * Math.cos(th), y, rad * Math.sin(th)]);
  }
  return fitUnit(pts);
}
function dblSpiralPts(): P[] {
  const pts: P[] = [];
  const N = 120;
  const turns = 3.2;
  const rad = 0.5;
  const H = 1.9;
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    const th = s * turns * 2 * Math.PI;
    const y = (s - 0.5) * H;
    for (const ph of [0, Math.PI]) {
      const c = [rad * Math.cos(th + ph), y, rad * Math.sin(th + ph)];
      pts.push(c, [c[0]! * 1.07, y, c[2]! * 1.07]);
    }
  }
  return fitUnit(pts);
}
function teardropPts(): P[] {
  const pts: P[] = [];
  const Nv = 46;
  const Nu = 26;
  for (let iv = 0; iv < Nv; iv++) {
    const t = iv / (Nv - 1);
    const v = t * Math.PI;
    const y = Math.cos(v);
    const r = 0.95 * Math.sin(v) * Math.pow(t, 0.6);
    for (let iu = 0; iu < Nu; iu++) {
      const u = (iu / Nu) * 2 * Math.PI;
      pts.push([r * Math.cos(u), y, r * Math.sin(u)]);
    }
  }
  return fitUnit(pts);
}

function pyramidPts(): P[] {
  // Triangle-base pyramid (tetrahedron): 3 base corners + apex.
  const pts: P[] = [];
  const apex: P = [0, 1, 0];
  const by = -0.55;
  const br = 0.78;
  const c: P[] = [0, 1, 2].map((k) => {
    const ang = -Math.PI / 2 + (k / 3) * 2 * Math.PI;
    return [br * Math.cos(ang), by, br * Math.sin(ang)] as P;
  });
  const tri = (A: P, B: P, C: P, N: number): void => {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N - i; j++) {
        const u = i / N;
        const v = j / N;
        const w = 1 - u - v;
        pts.push([A[0]! * w + B[0]! * u + C[0]! * v, A[1]! * w + B[1]! * u + C[1]! * v, A[2]! * w + B[2]! * u + C[2]! * v]);
      }
    }
  };
  // three slanted faces (apex + two adjacent base corners)
  for (let f = 0; f < 3; f++) tri(apex, c[f]!, c[(f + 1) % 3]!, 10);
  // triangular base
  tri(c[0]!, c[1]!, c[2]!, 8);
  return fitUnit(pts);
}

function ghostPts(): P[] {
  const pts: P[] = [];
  const Nu = 56;
  const rBase = 0.72;
  for (let iu = 0; iu < Nu; iu++) {
    const u = (iu / Nu) * 2 * Math.PI;
    const ct = Math.cos(u);
    const st = Math.sin(u);
    const bottomY = -0.85 + 0.15 * Math.abs(Math.sin(3 * u));
    for (let iv = 0; iv <= 10; iv++) {
      const vv = (iv / 10) * (Math.PI / 2);
      const y = rBase * Math.cos(vv);
      const rr = rBase * Math.sin(vv);
      pts.push([rr * ct, y, rr * st]);
    }
    for (let iv = 1; iv <= 10; iv++) {
      const y = (iv / 10) * bottomY;
      pts.push([rBase * ct, y, rBase * st]);
    }
  }
  return fitUnit(pts);
}

function slimePts(): P[] {
  const pts: P[] = [];
  const N = 440;
  for (let i = 0; i < N; i++) {
    const d = fibDir(i, N);
    const wob = 1 + 0.12 * Math.sin(d[0]! * 5.5) * Math.sin(d[2]! * 5.5);
    const y = (d[1]! < 0 ? d[1]! * 0.55 : d[1]! * 0.95) * 0.9; // flat-ish bottom, rounded top
    pts.push([d[0]! * 1.05 * wob, y, d[2]! * 1.05 * wob]);
  }
  // two "eye" dimples left as-is; keep simple blob
  return fitUnit(pts);
}
function seaminePts(): P[] {
  const pts: P[] = [];
  const N = 300;
  for (let i = 0; i < N; i++) {
    const d = fibDir(i, N);
    pts.push([d[0]! * 0.6, d[1]! * 0.6, d[2]! * 0.6]); // core sphere
  }
  const S = 16;
  for (let s = 0; s < S; s++) {
    const d = fibDir(s, S); // spike direction
    for (let t = 1; t <= 6; t++) {
      const r = 0.6 + (t / 6) * 0.42;
      pts.push([d[0]! * r, d[1]! * r, d[2]! * r]);
    }
  }
  return fitUnit(pts);
}
function ufoPts(): P[] {
  const pts: P[] = [];
  const R = 1.0;
  const cols = 34;
  const rings = 7;
  for (let ir = 1; ir <= rings; ir++) {
    const r = (R * ir) / rings;
    const yb = 0.18 * (1 - (r / R) * (r / R)); // lens profile
    for (let a = 0; a < cols; a++) {
      const ang = (a / cols) * 2 * Math.PI;
      pts.push([r * Math.cos(ang), yb, r * Math.sin(ang)]);
      pts.push([r * Math.cos(ang), -yb * 0.7, r * Math.sin(ang)]);
    }
  }
  for (let a = 0; a < cols; a++) {
    const ang = (a / cols) * 2 * Math.PI;
    pts.push([R * Math.cos(ang), 0, R * Math.sin(ang)]); // rim
  }
  for (let i = 0; i < 90; i++) {
    const d = fibDir(i, 90);
    if (d[1]! < 0) continue;
    pts.push([d[0]! * 0.4, 0.18 + d[1]! * 0.3, d[2]! * 0.4]); // cockpit dome
  }
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * 2 * Math.PI;
    pts.push([0.7 * Math.cos(ang), -0.14, 0.7 * Math.sin(ang)]); // under-lights
  }
  return fitUnit(pts);
}

// coronavirus — a fuzzy shell studded with club-shaped spikes tipped by knobs.
// Ported from Braille "Fun Shapes" (coronaPts).
function coronaPts(): P[] {
  const pts: P[] = [];
  const R = 0.5;
  const nSpk = 44;
  for (let i = 0; i < 320; i++) {
    const d = fibDir(i, 320);
    pts.push([d[0]! * R, d[1]! * R, d[2]! * R]);
  }
  for (let k = 0; k < nSpk; k++) {
    const d = fibDir(k, nSpk);
    for (let s = 1; s <= 3; s++) {
      const r = R + (s / 3) * 0.28; // stalk
      pts.push([d[0]! * r, d[1]! * r, d[2]! * r]);
    }
    const tip = R + 0.34;
    for (let j = 0; j < 6; j++) {
      const e = fibDir(j, 6); // knob pops
      pts.push([d[0]! * tip + e[0]! * 0.07, d[1]! * tip + e[1]! * 0.07, d[2]! * tip + e[2]! * 0.07]);
    }
  }
  return fitUnit(pts);
}

// bacteriophage — the "lunar lander": icosahedral head, tail sheath, leg fibers.
// Ported from Braille "Fun Shapes" (phagePts).
function phagePts(): P[] {
  const pts: P[] = [];
  const hy = 0.5;
  const hR = 0.4;
  const tailTop = 0.1;
  const tailBot = -0.35;
  const tr = 0.1;
  for (let i = 0; i < 200; i++) {
    const d = fibDir(i, 200); // head capsid
    pts.push([d[0]! * hR, hy + d[1]! * hR, d[2]! * hR]);
  }
  for (let iy = 0; iy <= 14; iy++) {
    const y = tailTop + ((tailBot - tailTop) * iy) / 14; // tail sheath
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * 2 * Math.PI;
      pts.push([tr * Math.cos(ang), y, tr * Math.sin(ang)]);
    }
  }
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * 2 * Math.PI; // baseplate
    for (const rr of [0.12, 0.2]) pts.push([rr * Math.cos(a), tailBot, rr * Math.sin(a)]);
  }
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * 2 * Math.PI;
    const cx = Math.cos(ang);
    const cz = Math.sin(ang);
    const hip: P = [0.14 * cx, tailBot, 0.14 * cz];
    const knee: P = [0.2 * cx, tailBot - 0.05, 0.2 * cz];
    const foot: P = [0.5 * cx, -0.9, 0.5 * cz];
    for (const [A, B] of [[hip, knee], [knee, foot]] as [P, P][]) {
      for (let s = 0; s <= 6; s++) {
        const f = s / 6; // leg fibers
        pts.push([A[0]! + (B[0]! - A[0]!) * f, A[1]! + (B[1]! - A[1]!) * f, A[2]! + (B[2]! - A[2]!) * f]);
      }
    }
  }
  return fitUnit(pts);
}

// saturn — a sphere planet girdled by a flat multi-ring band.
// Ported from Braille "Fun Shapes" (saturnPts).
function saturnPts(): P[] {
  const pts: P[] = [];
  for (let i = 0; i < 440; i++) {
    const d = fibDir(i, 440);
    pts.push([d[0]! * 0.62, d[1]! * 0.62, d[2]! * 0.62]);
  }
  for (let i = 0; i < 230; i++) {
    const a = (i / 230) * 2 * Math.PI;
    for (const rr of [0.95, 1.03, 1.11, 1.19]) pts.push([rr * Math.cos(a), 0, rr * Math.sin(a)]);
  }
  return fitUnit(pts);
}

// torus — a closed donut surface (u = around the ring, v = around the tube).
// Ported from Braille "Primitives" (TOR_PTS). Animated by the 'solving' idle.
function torusPts(): P[] {
  const R = 1;
  const r = 0.42;
  const torPoint = (u: number, v: number): P => {
    const rr = R + r * Math.cos(v);
    return [rr * Math.cos(u), rr * Math.sin(u), r * Math.sin(v)];
  };
  const pts: P[] = [];
  const N = 42;
  const M = 12;
  for (let i = 0; i < N; i++) {
    const u = (i / N) * 2 * Math.PI;
    for (let j = 0; j < M; j++) pts.push(torPoint(u, (j / M) * 2 * Math.PI));
  }
  return fitUnit(pts);
}

function dotV(a: P, b: P): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

// sphere — a plain Fibonacci-lattice point ball. Ported from Braille "Fun Shapes".
function spherePts(): P[] {
  const pts: P[] = [];
  for (let i = 0; i < 520; i++) pts.push(fibDir(i, 520));
  return fitUnit(pts);
}

// cone — a tapering side wall from a base disc up to an apex. Ported from Braille.
function conePts(): P[] {
  const pts: P[] = [];
  const R = 0.82;
  const H = 1.6;
  const ny = 18;
  for (let iy = 0; iy <= ny; iy++) {
    const f = iy / ny;
    const y = -H / 2 + f * H;
    const r = R * (1 - f);
    for (let a = 0; a < 26; a++) {
      const ang = (a / 26) * 2 * Math.PI;
      pts.push([r * Math.cos(ang), y, r * Math.sin(ang)]);
    }
  }
  for (let ir = 0; ir <= 8; ir++) {
    const rr = (R * ir) / 8;
    const n = Math.max(1, Math.round((26 * ir) / 8));
    for (let a = 0; a < n; a++) {
      const ang = (a / n) * 2 * Math.PI;
      pts.push([rr * Math.cos(ang), -H / 2, rr * Math.sin(ang)]); // base disc
    }
  }
  return fitUnit(pts);
}

// bipyramid — two square pyramids joined base-to-base (double-inverted octahedron).
// Ported from Braille "Fun Shapes" (polyFaces fan-fill + edge trace).
function fillTri(pts: P[], A: P, B: P, C: P, n: number): void {
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n - i; j++) {
      const u = i / n;
      const v = j / n;
      const w = 1 - u - v;
      pts.push([A[0]! * w + B[0]! * u + C[0]! * v, A[1]! * w + B[1]! * u + C[1]! * v, A[2]! * w + B[2]! * u + C[2]! * v]);
    }
}
function traceEdge(pts: P[], A: P, B: P, n: number): void {
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    pts.push([A[0]! + (B[0]! - A[0]!) * t, A[1]! + (B[1]! - A[1]!) * t, A[2]! + (B[2]! - A[2]!) * t]);
  }
}
function polyFaces(verts: P[], faces: number[][], fN: number, eN: number): P[] {
  const pts: P[] = [];
  const seen = new Set<string>();
  for (const f of faces) for (let k = 1; k < f.length - 1; k++) fillTri(pts, verts[f[0]!]!, verts[f[k]!]!, verts[f[k + 1]!]!, fN);
  for (const f of faces)
    for (let k = 0; k < f.length; k++) {
      const a = f[k]!;
      const b = f[(k + 1) % f.length]!;
      const key = Math.min(a, b) + ',' + Math.max(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      traceEdge(pts, verts[a]!, verts[b]!, eN);
    }
  return pts;
}
function bipyramidPts(): P[] {
  const v: P[] = [[0, 1.15, 0], [0, -1.15, 0], [0.82, 0, 0.82], [-0.82, 0, 0.82], [-0.82, 0, -0.82], [0.82, 0, -0.82]];
  const f = [[0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 2], [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 2, 5]];
  return fitUnit(polyFaces(v, f, 5, 8));
}

// amoeba — an irregular blob throwing out pseudopods, with a nucleus + vacuoles.
// Ported from Braille "Fun Shapes".
function amoebaPts(): P[] {
  const pts: P[] = [];
  const N = 620;
  const pods: P[] = [[1, 0.2, 0.3], [-0.6, 0.1, 0.8], [0.2, -0.3, -0.9], [-0.9, 0.4, -0.2], [0.4, 0.85, 0.1]];
  const bump = (d: P): number => {
    let r = 0.6 + 0.06 * Math.sin(4 * d[0]! + 3 * d[2]!);
    for (const p of pods) r += 0.42 * Math.pow(Math.max(0, dotV(d, normV(p))), 6);
    return r;
  };
  for (let i = 0; i < N; i++) {
    const d = fibDir(i, N);
    const r = bump(d);
    pts.push([d[0]! * r, d[1]! * r * 0.85, d[2]! * r]);
  }
  for (let i = 0; i < 44; i++) {
    const d = fibDir(i, 44); // nucleus
    pts.push([0.12 + d[0]! * 0.17, -0.05 + d[1]! * 0.17, d[2]! * 0.17]);
  }
  for (const [cx, cy, cz, vr] of [[-0.3, 0.1, 0.12, 0.12], [0.12, 0.28, -0.16, 0.09]]) {
    for (let a = 0; a < 14; a++) {
      const ang = (a / 14) * 2 * Math.PI; // vacuoles
      pts.push([cx! + vr! * Math.cos(ang), cy! + vr! * Math.sin(ang), cz!]);
    }
  }
  return fitUnit(pts);
}

// jellyfish — a translucent bell trailing wavy tentacles + frilly oral arms.
// Ported from Braille "Fun Shapes".
function jellyfishPts(): P[] {
  const pts: P[] = [];
  const R = 0.62;
  for (let i = 0; i < 300; i++) {
    const d = fibDir(i, 300);
    if (d[1]! < 0) continue;
    const wob = 1 + 0.05 * Math.sin(6 * Math.atan2(d[2]!, d[0]!));
    pts.push([d[0]! * R * wob, 0.2 + d[1]! * R * 0.8, d[2]! * R * wob]); // bell
  }
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * 2 * Math.PI;
    pts.push([R * Math.cos(ang), 0.2, R * Math.sin(ang)]); // rim
  }
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * 2 * Math.PI;
    const cx = R * 0.9 * Math.cos(ang);
    const cz = R * 0.9 * Math.sin(ang);
    for (let s = 0; s <= 20; s++) {
      const f = s / 20;
      const sway = 0.12 * Math.sin(f * 6 + ang * 2);
      pts.push([cx + sway * Math.cos(ang), 0.2 - f * 1.1, cz + sway * Math.sin(ang)]); // tentacles
    }
  }
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * 2 * Math.PI + 0.4;
    for (let s = 0; s <= 12; s++) {
      const f = s / 12;
      const r = 0.16 * (1 - f * 0.5);
      pts.push([r * Math.cos(ang) + 0.05 * Math.sin(f * 8), 0.15 - f * 0.6, r * Math.sin(ang)]); // oral arms
    }
  }
  return fitUnit(pts);
}

export type ShapeDef = {
  key: string;
  label: string;
  positions: Float32Array;
  count: number;
};

function toShape(key: string, label: string, pts: P[]): ShapeDef {
  const arr = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    arr[i * 3] = pts[i]![0]!;
    arr[i * 3 + 1] = pts[i]![1]!;
    arr[i * 3 + 2] = pts[i]![2]!;
  }
  return { key, label, positions: arr, count: pts.length };
}

export const SHAPES: Record<string, ShapeDef> = {
  gear: toShape('gear', 'Gear', gearPts()),
  spiral: toShape('spiral', 'Spiral', spiralPts()),
  dspiral: toShape('dspiral', 'Double Spiral', dblSpiralPts()),
  teardrop: toShape('teardrop', 'Teardrop', teardropPts()),
  pyramid: toShape('pyramid', 'Pyramid', pyramidPts()),
  ghost: toShape('ghost', 'Ghost', ghostPts()),
  slime: toShape('slime', 'Slime', slimePts()),
  seamine: toShape('seamine', 'Sea Mine', seaminePts()),
  ufo: toShape('ufo', 'UFO', ufoPts()),
  corona: toShape('corona', 'Coronavirus', coronaPts()),
  phage: toShape('phage', 'Bacteriophage', phagePts()),
  saturn: toShape('saturn', 'Saturn', saturnPts()),
  torus: toShape('torus', 'Torus', torusPts()),
  sphere: toShape('sphere', 'Sphere', spherePts()),
  cone: toShape('cone', 'Cone', conePts()),
  bipyramid: toShape('bipyramid', 'Bipyramid', bipyramidPts()),
  amoeba: toShape('amoeba', 'Amoeba', amoebaPts()),
  jellyfish: toShape('jellyfish', 'Jellyfish', jellyfishPts()),
};
