// heart-meter.ts — the lives/health widget: the Braille "Heart" halftone point
// cloud, breathing normally, that on a hit snaps to the Wave treatment and
// flashes red with an explosion pulse. Self-contained 2D-canvas renderer,
// ported from Braille Lab "Fun Shapes" (Thinking Orbs engine, MIT © Jakub
// Antalik; shape geometry original to Braille Lab).

type P = number[];
type Dot = { x: number; y: number; z: number; b?: number };

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
function makeImplicitWarp(F: (x: number, y: number, z: number) => number): (dir: P) => P {
  return (dir) => {
    const d = normV(dir);
    let thi = 0.1;
    let f = F(d[0]! * thi, d[1]! * thi, d[2]! * thi);
    let g = 0;
    while (f < 0 && thi < 5 && g < 50) {
      thi *= 1.35;
      f = F(d[0]! * thi, d[1]! * thi, d[2]! * thi);
      g++;
    }
    let tlo = 0;
    let th = thi;
    for (let i = 0; i < 20; i++) {
      const tm = (tlo + th) * 0.5;
      if (F(d[0]! * tm, d[1]! * tm, d[2]! * tm) < 0) tlo = tm;
      else th = tm;
    }
    const t = (tlo + th) * 0.5;
    return [d[0]! * t, d[1]! * t, d[2]! * t];
  };
}
function heartF(x: number, y: number, z: number): number {
  const X = x;
  const Y = z;
  const Z = y;
  const a = X * X + 2.25 * Y * Y + Z * Z - 1;
  return a * a * a - X * X * Z * Z * Z - 0.1125 * Y * Y * Z * Z * Z;
}
function heartPts(): P[] {
  const warp = makeImplicitWarp(heartF);
  return fitUnit(Array.from({ length: 760 }, (_, i) => warp(fibDir(i, 760))));
}

function breathe(base: P[], t: number): Dot[] {
  const s = 1 + 0.17 * Math.sin(t * 2);
  return base.map((p) => {
    const q = rotY([p[0]! * s, p[1]! * s, p[2]! * s], t * 0.3);
    return { x: q[0]!, y: q[1]!, z: q[2]! };
  });
}
function wave(base: P[], t: number): Dot[] {
  return base.map((p) => {
    const d = 1 + 0.14 * Math.sin(3 * Math.atan2(p[2]!, p[0]!) + t * 3 - p[1]! * 2);
    const q = rotY([p[0]! * d, p[1]!, p[2]! * d], t * 0.3);
    return { x: q[0]!, y: q[1]!, z: q[2]! };
  });
}

const GREEN: [number, number, number] = [90, 255, 170];
const RED: [number, number, number] = [255, 70, 55];
const HURT_DUR = 0.75;

function shuffle(pts: P[]): P[] {
  const a = pts.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export class HeartMeter {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: P[] = shuffle(heartPts());
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private livesFrac = 1;
  private hurtT = 0;
  private t0 = 0;
  private running = false;

  constructor(private size = 72) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(size * this.dpr);
    this.canvas.height = Math.round(size * this.dpr);
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.ctx = this.canvas.getContext('2d')!;
  }

  setLives(frac: number): void {
    this.livesFrac = Math.max(0, Math.min(1, frac));
  }

  /** Trigger the hurt animation (wave + red flash + explosion pulse). */
  hit(): void {
    this.hurtT = HURT_DUR;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now() / 1000;
    let last = this.t0;
    const loop = (): void => {
      if (!this.running) return;
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - last);
      last = now;
      this.frame(now - this.t0, dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private frame(t: number, dt: number): void {
    let dots: Dot[];
    let color: [number, number, number];

    if (this.hurtT > 0) {
      this.hurtT = Math.max(0, this.hurtT - dt);
      const ph = 1 - this.hurtT / HURT_DUR; // 0 → 1
      const expl = Math.sin(Math.min(1, ph * 1.3) * Math.PI); // pulse out then back
      dots = wave(this.base, t).map((d) => ({
        x: d.x * (1 + 0.7 * expl),
        y: d.y * (1 + 0.7 * expl),
        z: d.z * (1 + 0.7 * expl),
      }));
      const flick = 0.55 + 0.45 * Math.abs(Math.sin(ph * 26));
      color = [RED[0] * flick, RED[1] * flick, RED[2] * flick];
    } else {
      dots = breathe(this.base, t);
      color = GREEN;
    }

    // health as density: draw only livesFrac of the (shuffled) dots
    const k = this.livesFrac <= 0 ? 0 : Math.max(6, Math.floor(dots.length * this.livesFrac));
    this.draw(dots, k, color);
  }

  private draw(dots: Dot[], k: number, color: [number, number, number]): void {
    const size = this.size;
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.66;
    const rs = (size / 300) ** 0.6;
    const st = Math.sin(0.42);
    const ct = Math.cos(0.42);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const out: { x: number; y: number; z: number; r: number; a: number }[] = [];
    for (let i = 0; i < k; i++) {
      const d = dots[i]!;
      // project (yaw 0, tilt 0.42)
      const y1 = d.y * ct - d.z * st;
      const z2 = d.y * st + d.z * ct;
      const px = cx + d.x * R;
      const py = cy - y1 * R;
      const depth = (z2 + 1) / 2;
      out.push({ x: px, y: py, z: z2, r: (0.5 + 1.6 * depth) * rs, a: 0.4 + 0.6 * depth });
    }
    out.sort((a, b) => a.z - b.z);
    const [r, g, bl] = color;
    for (const d of out) {
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${d.a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, Math.max(0.4, d.r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
