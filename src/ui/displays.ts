// displays.ts — retro emissive display renderers ported from the dexipurei
// "half-dotted" standalone gallery (Dot-Matrix LED, Nixie Tube, 16-seg
// Starburst). Each is a pure render(ctx, params, t, rng); a shared rAF ticker
// drives only the currently-visible canvases so they don't stack loops on the
// Three.js frame. Used for the title/subtitle/PLAY (dot-matrix), the live score
// (nixie), and the win/lose result title (starburst).
//
// Ported near-verbatim; the PNG-export "transparent" guards are kept so in-game
// mounts float their dots/segments over the scene (no opaque backdrop).

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = Record<string, any>;
type Rng = { seed: number; rand: () => number; hash: (x: number, y: number) => number };

// --- core/rng ---------------------------------------------------------------
function mulberry32(a: number): () => number {
  a = a >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x: number, y: number, seed = 0): number {
  let n = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function makeRng(seed: number): Rng {
  const s = (seed >>> 0) || 0;
  return { seed: s, rand: mulberry32(s), hash: (x, y) => hash(x, y, s) };
}

// --- core/color -------------------------------------------------------------
function hex2rgb(h: string): number[] {
  let s = String(h).replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
const mix = (a: number[], b: number[], t: number): number[] => a.map((v, i) => Math.round(v + (b[i]! - v) * t));
const rgba = (c: number[], a: number): string => `rgba(${c[0]! | 0},${c[1]! | 0},${c[2]! | 0},${a})`;

// --- stage ------------------------------------------------------------------
const dprMap = new WeakMap<HTMLCanvasElement, number>();
function stageSize(ctx: CanvasRenderingContext2D): { w: number; h: number; dpr: number } {
  const cv = ctx.canvas;
  const dpr = dprMap.get(cv) || 1;
  return { w: cv.width / dpr, h: cv.height / dpr, dpr };
}

// --- core/text-raster -------------------------------------------------------
// 5×7 dot-matrix font — rows top→bottom, '1' = lit.
const FONT: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};
const GW = 5, GH = 7, GAP = 1;
type Grid = { grid: number[][]; rows: number; cols: number };
const _cache = new Map<string, Grid>();
export function clearTextCache(): void { _cache.clear(); }
const inBuiltin = (str: string): boolean => [...str].every((c) => !!(FONT[c] || FONT[c.toUpperCase()]));

function builtinGrid(str: string): Grid {
  const glyphs = [...str].map((c) => FONT[c] || FONT[c.toUpperCase()] || FONT['?']!);
  const cols = glyphs.length ? glyphs.length * GW + (glyphs.length - 1) * GAP : GW;
  const grid: number[][] = [];
  for (let r = 0; r < GH; r++) {
    const line: number[] = [];
    glyphs.forEach((g, gi) => {
      for (let c = 0; c < GW; c++) line.push(g[r]![c] === '1' ? 1 : 0);
      if (gi < glyphs.length - 1) line.push(0);
    });
    grid.push(line);
  }
  return { grid, rows: GH, cols };
}

let _trCanvas: HTMLCanvasElement | null = null;
function rasterGrid(str: string, height: number): Grid {
  const h = Math.max(7, height | 0);
  if (!_trCanvas) _trCanvas = document.createElement('canvas');
  const ctx = _trCanvas.getContext('2d')!;
  const font = `600 ${h}px "Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif`;
  ctx.font = font;
  const w = Math.max(1, Math.ceil(ctx.measureText(str).width) + 2);
  const ch = Math.ceil(h * 1.32);
  _trCanvas.width = w; _trCanvas.height = ch;
  const c2 = _trCanvas.getContext('2d')!;
  c2.clearRect(0, 0, w, ch);
  c2.fillStyle = '#fff'; c2.textBaseline = 'top'; c2.font = font;
  c2.fillText(str, 1, Math.floor(h * 0.12));
  const data = c2.getImageData(0, 0, w, ch).data;
  const grid: number[][] = [];
  for (let y = 0; y < ch; y++) {
    const line: number[] = [];
    for (let x = 0; x < w; x++) line.push(data[(y * w + x) * 4 + 3]! > 90 ? 1 : 0);
    grid.push(line);
  }
  return trim({ grid, rows: ch, cols: w });
}
function trim(g: Grid): Grid {
  let top = 0, bot = g.rows - 1, left = 0, right = g.cols - 1;
  const rowEmpty = (r: number): boolean => g.grid[r]!.every((v) => !v);
  const colEmpty = (c: number): boolean => g.grid.every((row) => !row[c]);
  while (top < bot && rowEmpty(top)) top++;
  while (bot > top && rowEmpty(bot)) bot--;
  while (left < right && colEmpty(left)) left++;
  while (right > left && colEmpty(right)) right--;
  const grid: number[][] = [];
  for (let r = top; r <= bot; r++) grid.push(g.grid[r]!.slice(left, right + 1));
  return { grid, rows: grid.length, cols: grid[0] ? grid[0].length : 1 };
}
function textGrid(str: string, opts: { mode?: string; height?: number } = {}): Grid {
  const mode = opts.mode || 'auto';
  const height = opts.height || 9;
  const key = mode + '|' + height + '|' + str;
  if (_cache.has(key)) return _cache.get(key)!;
  let out: Grid;
  if (mode === 'ascii' || (mode === 'auto' && inBuiltin(str))) out = builtinGrid(str);
  else out = rasterGrid(str, height);
  if (_cache.size > 256) _cache.clear();
  _cache.set(key, out);
  return out;
}

// --- core/fx ----------------------------------------------------------------
let _fxScratch: HTMLCanvasElement | null = null;
function fxScratchCanvas(w: number, h: number): HTMLCanvasElement {
  if (!_fxScratch) _fxScratch = document.createElement('canvas');
  if (_fxScratch.width !== w || _fxScratch.height !== h) { _fxScratch.width = w; _fxScratch.height = h; }
  return _fxScratch;
}
function bloom(ctx: CanvasRenderingContext2D, drawFn: (g: CanvasRenderingContext2D) => void, blur: number, intensity: number): void {
  if (intensity <= 0 || blur <= 0) return;
  const cv = ctx.canvas, off = fxScratchCanvas(cv.width, cv.height), g = off.getContext('2d')!;
  g.setTransform(ctx.getTransform());
  g.clearRect(0, 0, cv.width, cv.height);
  drawFn(g);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = intensity;
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
  ctx.filter = 'none';
}
function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, transparent: boolean): void {
  if (transparent || amount <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amount * 0.85})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// --- display: Dot-Matrix LED ------------------------------------------------
const DM_PAD = 1;
function renderDotmatrix(ctx: CanvasRenderingContext2D, p: P, t: number, rng: Rng): void {
  const q = fx();
  const { w, h } = stageSize(ctx);
  const str = p.text || ' ';
  const { grid, rows, cols } = textGrid(str, { height: p.rasterH });
  const tCols = cols + DM_PAD * 2, tRows = rows + DM_PAD * 2;
  const cell = Math.max(2, Math.min((w * 0.94) / tCols, (h * 0.9) / tRows));
  const matW = tCols * cell, matH = tRows * cell;
  const ox = (w - matW) / 2, oy = (h - matH) / 2;
  const ledC = hex2rgb(p.color), coreC = mix(ledC, [255, 255, 255], p.coreWhite / 100), bgC = hex2rgb(p.bg);
  if (!p.transparent) { ctx.fillStyle = rgba(bgC, 1); ctx.fillRect(0, 0, w, h); }
  const R = cell * (p.fill / 100);
  const offA = p.offGrid / 100, varA = p.variance / 100, deadP = p.dead / 100, flick = p.flicker / 100, square = p.square;
  const dot = (g: CanvasRenderingContext2D, cx: number, cy: number, rad: number): void => {
    if (square) g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    else { g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill(); }
  };
  const lit: number[][] = [];
  for (let r = 0; r < tRows; r++) {
    for (let c = 0; c < tCols; c++) {
      const cx = ox + c * cell + cell / 2, cy = oy + r * cell + cell / 2;
      const gr = r - DM_PAD, gc = c - DM_PAD;
      const on = gr >= 0 && gr < rows && gc >= 0 && gc < cols && grid[gr]![gc] === 1;
      if (!on) {
        if (offA > 0 && q.core) { // off-dot grid is a per-cell fill — drop it on low/off
          const j = 1 - varA * 0.6 * rng.hash(c, r);
          ctx.fillStyle = rgba(mix(bgC, ledC, 0.18 + 0.1 * rng.hash(c + 3, r + 5)), offA * 0.5 * j);
          dot(ctx, cx, cy, R * 0.62);
        }
        continue;
      }
      let bright = 1 - varA * rng.hash(c + 11, r + 7);
      if (rng.hash(c + 31, r + 17) < deadP) bright *= 0.28;
      if (q.flicker && flick > 0) {
        const fph = rng.hash(c + 99, r + 44);
        if (fph < flick * 0.5) bright *= 0.78 + 0.22 * Math.sin(t * 0.012 + fph * 60);
      }
      bright = Math.max(0.08, bright);
      ctx.fillStyle = rgba(ledC, 0.9 * bright);
      dot(ctx, cx, cy, R);
      if (q.core && p.coreInt > 0 && p.coreSize > 0) {
        const cr = R * (p.coreSize / 100) * 1.15;
        const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cr, 0.5));
        g1.addColorStop(0, rgba(coreC, (p.coreInt / 100) * bright));
        g1.addColorStop(1, rgba(coreC, 0));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g1;
        ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      lit.push([cx, cy, bright]);
    }
  }
  if (q.bloom) {
    const glowC = mix(ledC, coreC, 0.4);
    bloom(ctx, (g) => {
      for (let i = 0; i < lit.length; i++) { g.fillStyle = rgba(glowC, 0.95 * lit[i]![2]!); dot(g, lit[i]![0]!, lit[i]![1]!, R); }
    }, p.bloomBlur, p.bloomInt / 100);
  }
  vignette(ctx, w, h, p.vignette / 100, p.transparent);
}

// --- display: Nixie Tube ----------------------------------------------------
const NX_STACK = [1, 2, 6, 7, 5, 0, 4, 9, 8, 3];
const NX_FONT = "'Cormorant Garamond','JetBrains Mono',serif";
function nixieWarmup(t: number, ms: number): number {
  if (ms <= 0) return 1;
  const ph = (t % (ms * 6)) / ms;
  return ph < 1 ? 0.45 + 0.55 * ph : 1;
}
function renderNixie(ctx: CanvasRenderingContext2D, p: P, t: number, rng: Rng): void {
  const q = fx();
  const glow = p.glow * q.glowScale;
  const { w, h } = stageSize(ctx);
  const neon = hex2rgb(p.color), bg = hex2rgb(p.bg);
  const coreC = mix(neon, [255, 240, 220], p.coreWhite / 100);
  if (!p.transparent) { ctx.fillStyle = rgba(bg, 1); ctx.fillRect(0, 0, w, h); }
  const str = (p.text || ' ').toString();
  const n = str.length;
  const pad = Math.min(w, h) * 0.12;
  const aspect = 0.62, gapFrac = 0.34;
  let th = h - pad * 2, tw = th * aspect, gp = tw * gapFrac;
  const maxW = w - pad * 2, total = (k: number): number => tw * k + gp * (k - 1);
  if (total(n) > maxW) { const s = maxW / total(n); tw *= s; th *= s; gp = tw * gapFrac; }
  const fontPx = th * 0.78;
  const startX = (w - total(n)) / 2, y = h / 2;
  const depth = (p.depth / 100) * fontPx * 0.16;
  const ghostA = p.ghost / 100, poison = p.poison / 100, jit = p.jitter / 100;
  const flick = p.flicker / 100, wu = nixieWarmup(t, p.warmupMs);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lit: { ch: string; x: number; y: number; bright: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ch = str[i]!;
    const cx = startX + tw * (i + 0.5) + gp * i;
    if (ch === ':' || ch === ' ') {
      if (ch === ':') {
        for (const dy of [-fontPx * 0.22, fontPx * 0.22]) {
          ctx.fillStyle = rgba(neon, 0.9); ctx.shadowColor = rgba(neon, 1); ctx.shadowBlur = glow * 0.7;
          ctx.beginPath(); ctx.arc(cx, y + dy, fontPx * 0.045, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      continue;
    }
    const sick = Math.max(0.22, 1 - poison * rng.hash(i + 5, 91));
    const jx = (rng.hash(i + 13, 3) - 0.5) * jit * fontPx * 0.04;
    const jy = (rng.hash(i + 17, 9) - 0.5) * jit * fontPx * 0.04;
    if (q.ghost && ghostA > 0) {
      for (let s = 0; s < NX_STACK.length; s++) {
        const g = NX_STACK[s]!;
        if (String(g) === ch) continue;
        const z = s / (NX_STACK.length - 1);
        const dz = depth * z;
        const a = ghostA * (0.10 + 0.16 * (1 - z)) * sick;
        ctx.font = `${fontPx}px ${NX_FONT}`;
        ctx.fillStyle = rgba(mix(bg, neon, 0.5), a);
        ctx.fillText(String(g), cx + dz * 0.5 + jx, y + dz + jy);
      }
    }
    let bright = sick * wu;
    if (q.flicker && flick > 0) {
      const fph = rng.hash(i + 41, 7);
      if (fph < flick * 0.6) bright *= 0.80 + 0.20 * Math.sin(t * 0.018 + fph * 70);
    }
    bright = Math.max(0.12, bright);
    ctx.font = `${fontPx}px ${NX_FONT}`;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = rgba(neon, 1);
    ctx.shadowBlur = glow;
    ctx.fillStyle = rgba(neon, 0.6 * bright);
    ctx.fillText(ch, cx + jx, y + jy);
    ctx.shadowBlur = glow * 0.4;
    ctx.fillStyle = rgba(neon, 0.85 * bright);
    ctx.fillText(ch, cx + jx, y + jy);
    if (q.core && p.coreWhite > 0) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(coreC, 0.5 * bright);
      ctx.fillText(ch, cx + jx, y + jy);
    }
    ctx.restore();
    ctx.shadowBlur = 0;
    lit.push({ ch, x: cx + jx, y: y + jy, bright });
  }
  if (q.bloom) {
    bloom(ctx, (g) => {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${fontPx}px ${NX_FONT}`;
      for (const L of lit) { g.fillStyle = rgba(neon, 0.9 * L.bright); g.fillText(L.ch, L.x, L.y); }
    }, glow * 0.8, p.bloomInt / 100);
  }
  if (p.mesh && QUALITY !== 'off') {
    ctx.save();
    ctx.strokeStyle = rgba(mix(bg, [255, 255, 255], 0.18), 0.20);
    ctx.lineWidth = Math.max(0.5, fontPx * 0.006);
    const step = Math.max(3, fontPx * 0.05), y0 = y - th * 0.46, y1 = y + th * 0.46;
    for (let i = 0; i < n; i++) {
      const ch = str[i]!;
      if (ch === ':' || ch === ' ') continue;
      const cx = startX + tw * (i + 0.5) + gp * i, half = fontPx * 0.34;
      for (let mx = -half; mx <= half; mx += step) {
        ctx.beginPath(); ctx.moveTo(cx + mx, y0); ctx.lineTo(cx + mx, y1); ctx.stroke();
      }
    }
    ctx.restore();
  }
  vignette(ctx, w, h, p.vignette / 100, p.transparent);
}

// --- display: 16-Segment Starburst ------------------------------------------
const SEG_ALL = ['a1', 'a2', 'b', 'c', 'd1', 'd2', 'e', 'f', 'g1', 'g2', 'h', 'i', 'j', 'k', 'l', 'm'];
const CENTER_VERTS = ['i', 'l'];
const GLYPH: Record<string, string> = {
  '0': 'a1 a2 b c d1 d2 e f j k', '1': 'b c', '2': 'a1 a2 b g1 g2 e d1 d2', '3': 'a1 a2 b c d1 d2 g2',
  '4': 'f g1 g2 b c', '5': 'a1 a2 f g1 g2 c d1 d2', '6': 'a1 a2 f g1 g2 e c d1 d2', '7': 'a1 a2 b c',
  '8': 'a1 a2 b c d1 d2 e f g1 g2', '9': 'a1 a2 b c d1 d2 f g1 g2',
  A: 'a1 a2 b c e f g1 g2', B: 'a1 a2 b c d1 d2 g2 i l', C: 'a1 a2 f e d1 d2', D: 'a1 a2 b c d1 d2 i l',
  E: 'a1 a2 f e g1 d1 d2', F: 'a1 a2 f e g1', G: 'a1 a2 f e c d1 d2 g2', H: 'b c e f g1 g2',
  I: 'a1 a2 d1 d2 i l', J: 'b c d1 d2 e', K: 'f e g1 j m', L: 'f e d1 d2', M: 'b c e f h j',
  N: 'b c e f h m', O: 'a1 a2 b c d1 d2 e f', P: 'a1 a2 b f e g1 g2', Q: 'a1 a2 b c d1 d2 e f m',
  R: 'a1 a2 b f e g1 g2 m', S: 'a1 a2 f g1 g2 c d1 d2', T: 'a1 a2 i l', U: 'b c d1 d2 e f',
  V: 'f e k j', W: 'b c e f k m', X: 'h j k m', Y: 'h j l', Z: 'a1 a2 j k d1 d2',
  '-': 'g1 g2', ' ': '',
};
function SEG16(seg: string, w: number, h: number, t: number): number[] {
  const ht = t / 2, hw = w / 2, hh = h / 2;
  switch (seg) {
    case 'a1': return [t, ht, hw, ht];
    case 'a2': return [hw, ht, w - t, ht];
    case 'b': return [w - ht, t, w - ht, hh - ht];
    case 'c': return [w - ht, hh + ht, w - ht, h - t];
    case 'd1': return [t, h - ht, hw, h - ht];
    case 'd2': return [hw, h - ht, w - t, h - ht];
    case 'e': return [ht, hh + ht, ht, h - t];
    case 'f': return [ht, t, ht, hh - ht];
    case 'g1': return [t, hh, hw, hh];
    case 'g2': return [hw, hh, w - t, hh];
    case 'h': return [ht + t, t + ht, hw - ht, hh - ht];
    case 'i': return [hw, t, hw, hh - ht];
    case 'j': return [w - ht - t, t + ht, hw + ht, hh - ht];
    case 'k': return [ht + t, h - t - ht, hw - ht, hh + ht];
    case 'l': return [hw, hh + ht, hw, h - t];
    case 'm': return [w - ht - t, h - t - ht, hw + ht, hh + ht];
  }
  return [0, 0, 0, 0];
}
function vhex(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, th: number): void {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux, hh = th / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + ux * hh - px * hh, y1 + uy * hh - py * hh);
  ctx.lineTo(x2 - ux * hh - px * hh, y2 - uy * hh - py * hh);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - ux * hh + px * hh, y2 - uy * hh + py * hh);
  ctx.lineTo(x1 + ux * hh + px * hh, y1 + uy * hh + py * hh);
  ctx.closePath();
}
function segsFor(ch: string, has16: boolean): Set<string> {
  const key = GLYPH[ch] != null ? ch : '-';
  let list = GLYPH[key]!.split(' ').filter(Boolean);
  if (!has16) list = list.filter((s) => CENTER_VERTS.indexOf(s) < 0);
  return new Set(list);
}
function parseSeg(str: string): { ch: string; dp: boolean }[] {
  const toks: { ch: string; dp: boolean }[] = [];
  for (const ch of String(str)) {
    if (ch === '.') { const last = toks[toks.length - 1]; if (last && !last.dp) { last.dp = true; continue; } }
    toks.push({ ch: ch === ' ' ? ' ' : ch.toUpperCase(), dp: false });
  }
  return toks.length ? toks : [{ ch: ' ', dp: false }];
}
function renderStarburst(ctx: CanvasRenderingContext2D, p: P, _t: number, rng: Rng): void {
  const q = fx();
  const glow = p.glow * q.glowScale;
  const { w, h } = stageSize(ctx);
  const segColor = p.color, has16 = !!p.seg16;
  if (!p.transparent) { ctx.fillStyle = rgba(hex2rgb(p.bg), 1); ctx.fillRect(0, 0, w, h); }
  const str = p.text || ' ';
  const tokens = parseSeg(str);
  const n = tokens.length;
  const aspect = 1.55, pad = Math.min(w, h) * 0.14, gapFrac = p.gap / 100;
  let dh = h - pad * 2, dw = dh / aspect, gp = dw * gapFrac;
  let tw = dw * n + gp * (n - 1);
  const maxW = w - pad * 2;
  if (tw > maxW) { const s = maxW / tw; dw *= s; dh *= s; gp = dw * gapFrac; tw = dw * n + gp * (n - 1); }
  const th = dw * (p.thickness / 100);
  const ghostA = p.ghost / 100, varA = p.variance / 100, dim = p.dimSeg, coreW = p.coreWhite / 100;
  let x = (w - tw) / 2;
  const y = (h - dh) / 2;
  const drawSeg = (x1: number, y1: number, x2: number, y2: number, bright: number, on: boolean): void => {
    if (!on) {
      if (ghostA <= 0) return;
      ctx.shadowBlur = 0; ctx.globalAlpha = ghostA; ctx.fillStyle = segColor;
      vhex(ctx, x1, y1, x2, y2, th * 0.9); ctx.fill(); ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = segColor; ctx.shadowColor = segColor;
    vhex(ctx, x1, y1, x2, y2, th);
    ctx.globalAlpha = 0.55 * bright; ctx.shadowBlur = glow; ctx.fill();
    if (q.bloom && p.bleed > 0) { ctx.globalAlpha = 0.16 * (p.bleed / 100) * bright; ctx.shadowBlur = glow * (1 + p.bleed / 60); ctx.fill(); }
    ctx.globalAlpha = Math.min(1, bright); ctx.shadowBlur = 0; ctx.fill();
    if (q.core && coreW > 0) {
      ctx.globalAlpha = Math.min(1, coreW * bright); ctx.fillStyle = '#fff';
      vhex(ctx, x1, y1, x2, y2, th * (p.coreThick / 100)); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  };
  for (let ti = 0; ti < n; ti++) {
    const tk = tokens[ti]!;
    const on = segsFor(tk.ch, has16);
    if (on.size === 0 && !tk.dp) { x += dw + gp; continue; } // blank cell (space) — draw nothing, not a ghost star
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < SEG_ALL.length; i++) {
      const seg = SEG_ALL[i]!;
      if (!has16 && CENTER_VERTS.indexOf(seg) >= 0) continue;
      const [x1, y1, x2, y2] = SEG16(seg, dw, dh, th);
      let bright = 1 - varA * rng.hash(ti * 17 + i, 5);
      if (seg === dim) bright *= 0.34;
      drawSeg(x1!, y1!, x2!, y2!, Math.max(0.12, bright), on.has(seg));
    }
    if (tk.dp) {
      const r = th * 0.6;
      ctx.fillStyle = segColor; ctx.shadowColor = segColor; ctx.shadowBlur = p.glow;
      ctx.beginPath(); ctx.arc(dw - r, dh - r, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.globalAlpha = coreW;
      ctx.beginPath(); ctx.arc(dw - r, dh - r, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    x += dw + gp;
  }
  ctx.shadowBlur = 0;
  vignette(ctx, w, h, p.vignette / 100, p.transparent);
}

// --- manager ----------------------------------------------------------------
export type DisplayKind = 'dotmatrix' | 'nixie' | 'starburst';
const RENDERERS: Record<DisplayKind, (ctx: CanvasRenderingContext2D, p: P, t: number, rng: Rng) => void> = {
  dotmatrix: renderDotmatrix,
  nixie: renderNixie,
  starburst: renderStarburst,
};
// Defaults lifted from the tuned standalone prototypes; transparent:true so the
// dots/segments float over the game (no opaque backdrop).
const DEFAULTS: Record<DisplayKind, P> = {
  dotmatrix: { seed: 1, text: '', source: 'text', fill: 44, square: false, rasterH: 32, color: '#dfe9ff', bg: '#070708', coreWhite: 78, coreSize: 42, coreInt: 85, bloomBlur: 14, bloomInt: 55, offGrid: 22, variance: 30, dead: 5, flicker: 18, vignette: 45, transparent: true },
  // toned down for the small in-game tube bank (was blowing out): fewer ghost
  // cathodes, gentler glow/bloom so digits stay legible.
  nixie: { seed: 1, text: '0', source: 'text', color: '#77bb41', bg: '#0a0604', glow: 9, bloomInt: 26, coreWhite: 20, depth: 34, ghost: 22, poison: 22, jitter: 10, flicker: 9, warmupMs: 200, mesh: true, vignette: 0, transparent: true },
  // thinner bars, gentler glow, no all-on ghost (it turned spaces into a star).
  starburst: { seed: 1, text: 'GAME OVER', source: 'text', seg16: true, color: '#ffb000', bg: '#0c0702', thickness: 11, gap: 30, glow: 8, coreWhite: 44, coreThick: 46, ghost: 0, bleed: 14, variance: 14, dimSeg: 'none', vignette: 0, transparent: true },
};

// --- quality / performance --------------------------------------------------
// One knob throttles the shared ticker and gates the expensive passes (bloom,
// per-dot core gradients, ghost cathodes, flicker). Auto-downgrades on slow
// machines; a manual pick (Setup tab) pins it and disables auto.
export type Quality = 'high' | 'medium' | 'low' | 'off';
const Q_ORDER: Quality[] = ['off', 'low', 'medium', 'high'];
const Q_FPS: Record<Quality, number> = { high: 30, medium: 24, low: 14, off: 10 };
let QUALITY: Quality = 'high';
let autoQuality = true;
let qualityCb: ((q: Quality, auto: boolean) => void) | null = null;
try {
  const s = localStorage.getItem('hk-quality') as Quality | null;
  if (s && Q_ORDER.includes(s)) { QUALITY = s; autoQuality = false; }
} catch { /* storage unavailable */ }

export function getQuality(): Quality { return QUALITY; }
export function isAutoQuality(): boolean { return autoQuality; }
export function onQualityChange(cb: (q: Quality, auto: boolean) => void): void { qualityCb = cb; }
export function setQuality(q: Quality, opts: { manual?: boolean } = {}): void {
  QUALITY = q;
  if (opts.manual) {
    autoQuality = false;
    try { localStorage.setItem('hk-quality', q); } catch { /* ignore */ }
  }
  emaCost = 0;
  for (const d of activeSet) renderOne(d, performance.now());
  qualityCb?.(QUALITY, autoQuality);
}
// Effect gates read by the renderers.
function fx(): { bloom: boolean; core: boolean; ghost: boolean; flicker: boolean; glowScale: number } {
  switch (QUALITY) {
    case 'high': return { bloom: true, core: true, ghost: true, flicker: true, glowScale: 1 };
    case 'medium': return { bloom: false, core: true, ghost: true, flicker: true, glowScale: 0.6 };
    case 'low': return { bloom: false, core: false, ghost: false, flicker: false, glowScale: 0.25 };
    default: return { bloom: false, core: false, ghost: false, flicker: false, glowScale: 0 };
  }
}

type Display = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; kind: DisplayKind; params: P; active: boolean };
const activeSet = new Set<Display>();
let rafId = 0;
let lastRender = 0;
let emaCost = 0;
let slowStreak = 0;
function renderOne(d: Display, t: number): void {
  const cv = d.canvas;
  const rect = cv.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const bw = Math.round(rect.width * dpr), bh = Math.round(rect.height * dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  dprMap.set(cv, dpr);
  d.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  RENDERERS[d.kind](d.ctx, d.params, t, makeRng(d.params.seed));
}
function tick(t: number): void {
  if (activeSet.size === 0) { rafId = 0; return; }
  const minDt = 1000 / Q_FPS[QUALITY];
  if (t - lastRender >= minDt) {
    lastRender = t;
    const t0 = performance.now();
    for (const d of activeSet) renderOne(d, t);
    const perCanvas = (performance.now() - t0) / Math.max(1, activeSet.size);
    emaCost = emaCost ? emaCost * 0.85 + perCanvas * 0.15 : perCanvas;
    // auto-downgrade on sustained slow frames (floors at 'low'); manual pins it.
    if (autoQuality && emaCost > 10 && QUALITY !== 'low' && QUALITY !== 'off') {
      if (++slowStreak > 30) { slowStreak = 0; setQuality(Q_ORDER[Q_ORDER.indexOf(QUALITY) - 1]!); }
    } else if (slowStreak > 0) slowStreak--;
  }
  rafId = requestAnimationFrame(tick);
}
function ensureLoop(): void { if (!rafId) rafId = requestAnimationFrame(tick); }

export type DisplayHandle = { setText: (s: string) => void; setActive: (on: boolean) => void; render: () => void };

export function createDisplay(canvas: HTMLCanvasElement, kind: DisplayKind, opts: { text?: string; params?: P } = {}): DisplayHandle {
  const params: P = { ...DEFAULTS[kind], ...(opts.params || {}) };
  if (opts.text != null) params.text = opts.text;
  const d: Display = { canvas, ctx: canvas.getContext('2d')!, kind, params, active: false };
  return {
    setText: (s) => { d.params.text = s; if (!d.active) renderOne(d, performance.now()); },
    setActive: (on) => {
      d.active = on;
      if (on) { activeSet.add(d); ensureLoop(); } else activeSet.delete(d);
    },
    render: () => renderOne(d, performance.now()),
  };
}

// Fonts (Noto Sans JP for kanji rasterization, serif for nixie) may load after
// the first render; drop the raster cache once ready so text re-rasterizes crisp.
if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
  (document as any).fonts.ready.then(() => clearTextCache());
}
