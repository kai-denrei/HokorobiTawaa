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
function crossV(a: P, b: P): P {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
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
function radialWarp(rFn: (d: P) => number): (dir: P) => P {
  return (dir) => {
    const d = normV(dir);
    const r = rFn(d);
    return [d[0]! * r, d[1]! * r, d[2]! * r];
  };
}
const lattice = (warp: (dir: P) => P, n: number): P[] =>
  Array.from({ length: n }, (_, i) => warp(fibDir(i, n)));

// ---- tower shapes ----------------------------------------------------------
function treePts(): P[] {
  const pts: P[] = [];
  const cones: P[] = [[0.95, 0.5, 0.55], [0.55, 0.75, 0.6], [0.1, 1.0, 0.7]];
  for (const [topY, baseR, hgt] of cones) {
    const rings = 7;
    for (let ir = 0; ir <= rings; ir++) {
      const h = ir / rings;
      const r = baseR! * h;
      const y = topY! - h * hgt!;
      const n = Math.max(1, Math.round(4 + 16 * h));
      for (let a = 0; a < n; a++) {
        const ang = (a / n) * 2 * Math.PI;
        pts.push([r * Math.cos(ang), y, r * Math.sin(ang)]);
      }
    }
  }
  for (let iy = 0; iy < 8; iy++) {
    const y = -0.6 - (iy / 8) * 0.4;
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * 2 * Math.PI;
      pts.push([0.13 * Math.cos(ang), y, 0.13 * Math.sin(ang)]);
    }
  }
  return fitUnit(pts);
}
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
function dnaPts(): P[] {
  const pts: P[] = [];
  const N = 180;
  const turns = 2.0;
  const R = 0.42;
  const H = 2.25;
  const tubeR = 0.05;
  const M = 5;
  const dth = (turns * 2 * Math.PI) / (N - 1);
  const dy = H / (N - 1);
  const backbone = (phase: number): void => {
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      const th = s * turns * 2 * Math.PI + phase;
      const y = (s - 0.5) * H;
      const C = [R * Math.cos(th), y, R * Math.sin(th)];
      const T = normV([-R * Math.sin(th) * dth, dy, R * Math.cos(th) * dth]);
      let n1 = normV(crossV(T, [0, 1, 0]));
      if (!(n1[0] || n1[1] || n1[2])) n1 = [1, 0, 0];
      const n2 = crossV(T, n1);
      for (let m = 0; m < M; m++) {
        const a = (m / M) * 2 * Math.PI;
        const cs = Math.cos(a);
        const sn = Math.sin(a);
        pts.push([
          C[0]! + tubeR * (cs * n1[0]! + sn * n2[0]!),
          C[1]! + tubeR * (cs * n1[1]! + sn * n2[1]!),
          C[2]! + tubeR * (cs * n1[2]! + sn * n2[2]!),
        ]);
      }
    }
  };
  backbone(0);
  backbone(Math.PI);
  const RN = 15;
  for (let j = 0; j < RN; j++) {
    const s = (j + 0.5) / RN;
    const th = s * turns * 2 * Math.PI;
    const y = (s - 0.5) * H;
    const a = [R * Math.cos(th), y, R * Math.sin(th)];
    const b = [R * Math.cos(th + Math.PI), y, R * Math.sin(th + Math.PI)];
    for (let r = 0; r <= 9; r++) {
      const f = r / 9;
      const x = a[0]! + (b[0]! - a[0]!) * f;
      const yy = a[1]! + (b[1]! - a[1]!) * f;
      const z = a[2]! + (b[2]! - a[2]!) * f;
      pts.push([x, yy, z], [x, yy + 0.028, z], [x, yy - 0.028, z]);
    }
  }
  return fitUnit(pts);
}
function songsPts(): P[] {
  const pts: P[] = [];
  const dome = (cx: number): void => {
    const Rr = 0.5;
    const baseY = -0.15;
    for (let i = 0; i < 260; i++) {
      const d = fibDir(i, 260);
      if (d[1]! < 0) continue;
      pts.push([cx + d[0]! * Rr, baseY + d[1]! * Rr, d[2]! * Rr]);
    }
    for (let iy = 0; iy < 7; iy++) {
      const y = baseY - (iy / 7) * 0.3;
      for (let a = 0; a < 34; a++) {
        const ang = (a / 34) * 2 * Math.PI;
        pts.push([cx + Rr * Math.cos(ang), y, Rr * Math.sin(ang)]);
      }
    }
  };
  dome(-0.58);
  dome(0.58);
  const slab = (x0: number, x1: number, z0: number, z1: number, top: number, bot: number, nx: number, nz: number): void => {
    for (let ix = 0; ix <= nx; ix++)
      for (let iz = 0; iz <= nz; iz++)
        pts.push([x0 + ((x1 - x0) * ix) / nx, top, z0 + ((z1 - z0) * iz) / nz]);
    const wall = (x: number, z: number): void => {
      for (let iy = 1; iy <= 5; iy++) pts.push([x, top - ((top - bot) * iy) / 5, z]);
    };
    for (let ix = 0; ix <= nx; ix++) {
      wall(x0 + ((x1 - x0) * ix) / nx, z0);
      wall(x0 + ((x1 - x0) * ix) / nx, z1);
    }
    for (let iz = 0; iz <= nz; iz++) {
      wall(x0, z0 + ((z1 - z0) * iz) / nz);
      wall(x1, z0 + ((z1 - z0) * iz) / nz);
    }
  };
  slab(-1.3, 1.3, -0.5, 0.5, -0.45, -0.62, 26, 10);
  slab(-1.6, 1.6, -0.7, 0.7, -0.62, -0.82, 28, 11);
  return fitUnit(pts);
}

function cubePts(): P[] {
  const pts: P[] = [];
  const N = 9; // grid per face
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
          const u = -1 + (2 * i) / N;
          const v = -1 + (2 * j) / N;
          const p: P = [0, 0, 0];
          p[axis] = sign;
          p[(axis + 1) % 3] = u;
          p[(axis + 2) % 3] = v;
          pts.push(p);
        }
      }
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

function dodecaPts(): P[] {
  // Regular dodecahedron: 20 vertices, 12 pentagon faces. Faces are found per
  // face-normal (the dual icosahedron's vertices), then sampled as dots —
  // pentagon outlines plus a light triangle-fan interior fill.
  const phi = (1 + Math.sqrt(5)) / 2;
  const inv = 1 / phi;
  const V: P[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]);
  for (const a of [-inv, inv]) for (const b of [-phi, phi]) V.push([0, a, b]);
  for (const a of [-inv, inv]) for (const b of [-phi, phi]) V.push([a, b, 0]);
  for (const a of [-phi, phi]) for (const b of [-inv, inv]) V.push([a, 0, b]);
  const Vn = V.map(normV);
  // face normals = icosahedron vertices
  const N: P[] = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) N.push([0, a, b]);
  for (const a of [-1, 1]) for (const b of [-phi, phi]) N.push([a, b, 0]);
  for (const a of [-phi, phi]) for (const b of [-1, 1]) N.push([a, 0, b]);

  const dot = (a: P, b: P): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const pts: P[] = [];
  for (const n0 of N) {
    const n = normV(n0);
    // the face's 5 vertices are those most aligned with the face normal
    const face = V.map((v, i) => ({ v, d: dot(Vn[i]!, n) }))
      .sort((a, b) => b.d - a.d)
      .slice(0, 5)
      .map((o) => o.v);
    const c: P = [0, 0, 0];
    for (const v of face) { c[0] = c[0]! + v[0]! / 5; c[1] = c[1]! + v[1]! / 5; c[2] = c[2]! + v[2]! / 5; }
    // in-plane basis to order the ring by angle
    let u = normV(crossV(n, Math.abs(n[1]!) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const w = crossV(n, u);
    const ring = face
      .map((v) => {
        const d: P = [v[0]! - c[0]!, v[1]! - c[1]!, v[2]! - c[2]!];
        return { v, ang: Math.atan2(dot(d, w), dot(d, u)) };
      })
      .sort((a, b) => a.ang - b.ang)
      .map((o) => o.v);
    for (let e = 0; e < 5; e++) {
      const A = ring[e]!;
      const B = ring[(e + 1) % 5]!;
      const seg = 7; // pentagon edge dots
      for (let s = 0; s < seg; s++) {
        const t = s / seg;
        pts.push([A[0]! + (B[0]! - A[0]!) * t, A[1]! + (B[1]! - A[1]!) * t, A[2]! + (B[2]! - A[2]!) * t]);
      }
      // interior fill: triangle fan (centroid, A, B)
      const M = 4;
      for (let i = 1; i <= M; i++) {
        for (let j = 0; j <= M - i; j++) {
          const bu = i / M;
          const bv = j / M;
          const bw = 1 - bu - bv;
          pts.push([
            c[0]! * bw + A[0]! * bu + B[0]! * bv,
            c[1]! * bw + A[1]! * bu + B[1]! * bv,
            c[2]! * bw + A[2]! * bu + B[2]! * bv,
          ]);
        }
      }
    }
  }
  return fitUnit(pts);
}

// ---- enemy shapes ----------------------------------------------------------
function bflyR(d: P): number {
  const th = Math.atan2(d[1]!, d[0]!);
  const wings = Math.pow(Math.abs(Math.sin(2 * th)), 0.7);
  const upper = 0.6 + 0.45 * Math.max(0, Math.sin(th));
  const flat = Math.exp(-Math.pow(2.3 * d[2]!, 2));
  const body = 0.32 * Math.exp(-Math.pow(3 * Math.cos(th), 2));
  return (0.16 + wings * upper) * flat + body + 0.1;
}
function butterflyPts(): P[] {
  return fitUnit(lattice(radialWarp(bflyR), 780));
}
function torusKnotPts(): P[] {
  const p = 2;
  const q = 3;
  const N = 300;
  const M = 6;
  const tubeR = 0.5;
  const pts: P[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 2 * Math.PI;
    const cr = 2 + Math.cos(q * t);
    const C = [cr * Math.cos(p * t), cr * Math.sin(p * t), Math.sin(q * t)];
    const t2 = t + 0.01;
    const cr2 = 2 + Math.cos(q * t2);
    const C2 = [cr2 * Math.cos(p * t2), cr2 * Math.sin(p * t2), Math.sin(q * t2)];
    const T = normV([C2[0]! - C[0]!, C2[1]! - C[1]!, C2[2]! - C[2]!]);
    let n1 = normV(crossV(T, [0, 0, 1]));
    if (!isFinite(n1[0]!)) n1 = [1, 0, 0];
    const n2 = crossV(T, n1);
    for (let m = 0; m < M; m++) {
      const a = (m / M) * 2 * Math.PI;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      pts.push([
        C[0]! + tubeR * (cs * n1[0]! + sn * n2[0]!),
        C[1]! + tubeR * (cs * n1[1]! + sn * n2[1]!),
        C[2]! + tubeR * (cs * n1[2]! + sn * n2[2]!),
      ]);
    }
  }
  return fitUnit(pts);
}
function shellPts(): P[] {
  const pts: P[] = [];
  const k = 0.2;
  const turns = 3.6;
  const Nt = 168;
  const Mf = 11;
  for (let it = 0; it < Nt; it++) {
    const th = (it / Nt) * turns * 2 * Math.PI;
    const R = 0.05 * Math.exp(k * th);
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const tr = R * 0.62;
    for (let ip = 0; ip < Mf; ip++) {
      const f = (ip / Mf) * 2 * Math.PI;
      pts.push([R * ct + tr * Math.cos(f) * ct, R * st + tr * Math.cos(f) * st, tr * Math.sin(f)]);
    }
  }
  return fitUnit(pts);
}
function cloudPts(): P[] {
  const pts: P[] = [];
  const blobs: P[] = [
    [-0.6, -0.05, 0.45],
    [0.0, 0.05, 0.6],
    [0.6, -0.05, 0.5],
    [-0.28, 0.22, 0.4],
    [0.32, 0.22, 0.42],
  ];
  for (const [cx, cy, r] of blobs)
    for (let i = 0; i < 120; i++) {
      const d = fibDir(i, 120);
      pts.push([cx! + d[0]! * r!, Math.max(-0.35, cy! + d[1]! * r! * 0.8), d[2]! * r! * 0.7]);
    }
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
  tree: toShape('tree', 'Pine Tree', treePts()),
  gear: toShape('gear', 'Gear', gearPts()),
  spiral: toShape('spiral', 'Spiral', spiralPts()),
  dspiral: toShape('dspiral', 'Double Spiral', dblSpiralPts()),
  teardrop: toShape('teardrop', 'Teardrop', teardropPts()),
  songs: toShape('songs', 'SONGS Domes', songsPts()),
  dodeca: toShape('dodeca', 'Dodecahedron', dodecaPts()),
  pyramid: toShape('pyramid', 'Pyramid', pyramidPts()),
  cube: toShape('cube', 'Cube', cubePts()),
  dna: toShape('dna', 'DNA Helix', dnaPts()),
  butterfly: toShape('butterfly', 'Butterfly', butterflyPts()),
  knot: toShape('knot', 'Torus Knot', torusKnotPts()),
  shell: toShape('shell', 'Shell', shellPts()),
  cloud: toShape('cloud', 'Cloud', cloudPts()),
  ghost: toShape('ghost', 'Ghost', ghostPts()),
  slime: toShape('slime', 'Slime', slimePts()),
  seamine: toShape('seamine', 'Sea Mine', seaminePts()),
  ufo: toShape('ufo', 'UFO', ufoPts()),
};
