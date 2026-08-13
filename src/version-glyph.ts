// version-glyph.ts — cache-busting visual confirmation glyphs (skill: cache-busting).
// The build token is hashed to bytes; each byte -> one of 64 cells (8 colours ×
// 8 shapes, cell = byte%64, colour band = cell//8, shape = cell%8). Three cells
// render as tiles in the version badge and the leading cell becomes the tab
// favicon — so if the glyphs/favicon changed shape+colour after a deploy, the
// cache bust took effect; if they didn't, you're on a stale cached build.

const COLORS = [
  '#35ff7a', // green
  '#35d0ff', // cyan
  '#ffb14e', // amber
  '#ff5a4e', // red
  '#b26bff', // purple
  '#5a6bff', // blue
  '#2fe6d0', // teal
  '#eaf2ff', // white
];

const SHAPES = [
  '<circle cx="50" cy="50" r="34" fill="currentColor"/>',
  '<rect x="20" y="20" width="60" height="60" rx="9" fill="currentColor"/>',
  '<polygon points="50,16 84,80 16,80" fill="currentColor"/>',
  '<polygon points="50,14 86,50 50,86 14,50" fill="currentColor"/>',
  '<polygon points="50,14 84,32 84,68 50,86 16,68 16,32" fill="currentColor"/>',
  '<polygon points="50,10 61,39 92,39 67,58 77,88 50,69 23,88 33,58 8,39 39,39" fill="currentColor"/>',
  '<circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" stroke-width="15"/>',
  '<path d="M42 16h16v26h26v16H58v26H42V58H16V42h26z" fill="currentColor"/>',
];

/** FNV-1a 32-bit hash of the token → 4 bytes (leading first). */
function tokenBytes(token: string): number[] {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return [(h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255];
}

function cellSvg(byte: number, rounded = true): string {
  const cell = byte % 64;
  const color = COLORS[(cell >> 3) & 7]!;
  const shape = SHAPES[cell & 7]!;
  const bg = rounded ? '<rect width="100" height="100" rx="20" fill="#0a0f0c"/>' : '<rect width="100" height="100" fill="#0a0f0c"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg}<g color="${color}">${shape}</g></svg>`;
}

/** Inline SVG tiles for the version badge (3 cells from the token). */
export function versionGlyphsHTML(token: string): string {
  const [b0, b1, b2] = tokenBytes(token);
  return `<span class="hk-badge-glyphs">${cellSvg(b0!)}${cellSvg(b1!)}${cellSvg(b2!)}</span>`;
}

/** Replace the tab favicon with the token's leading glyph. */
export function applyGlyphFavicon(token: string): void {
  const [b0] = tokenBytes(token);
  const url = 'data:image/svg+xml,' + encodeURIComponent(cellSvg(b0!, false));
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = url;
}
