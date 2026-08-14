// color.ts — single source for hex → rgb conversion.
//
// Three call sites needed slightly different shapes: THREE vertex colours want
// 0..1 floats, 2D canvas rgba() wants 0..255 ints, and the display configs pass
// '#rrggbb' strings. They shared the same bit-twiddling, so the core lives here
// once and the variants are thin wrappers.

type Rgb = [number, number, number];

/** Packed 0xRRGGBB int → [r, g, b] in 0..255. */
export function intToRgb255(n: number): Rgb {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Packed 0xRRGGBB int → [r, g, b] in 0..1 (THREE vertex colours). */
export function intToRgb01(n: number): Rgb {
  const [r, g, b] = intToRgb255(n);
  return [r / 255, g / 255, b / 255];
}

/** '#rgb' or '#rrggbb' string → [r, g, b] in 0..255 (canvas fills). */
export function hexStrToRgb255(hex: string): Rgb {
  let s = String(hex).replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return intToRgb255(parseInt(s, 16));
}
