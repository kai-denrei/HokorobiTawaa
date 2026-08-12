// theme.ts — the monochrome green-on-black vector-wireframe palette (board.md).
// Single hue, black background; brightness/alpha encode terrain role.

export const THEME = {
  background: 0x000000,
  // phosphor green family (single hue, varied luminance)
  buildable: 0x1f7a3f, // dim green — open cells
  buildableDim: 0.55, // line opacity for buildable outlines
  path: 0x35ff7a, // bright green — the fixed route
  mountain: 0x0f5c2e, // darker green — blocked terrain wireframe
  spawn: 0x9dff5a, // yellow-green accent — entry
  base: 0x5affd0, // teal-green accent — goal
  glow: 0x35ff7a,
  mountainWire: 0x9aa0a8, // grey — mountain wireframe
  mountainSolid: 0x8b9198, // grey — mountain solid faces
} as const;

/** Uniform apex lean applied to every mountain (multiples of cell height), so
 * all peaks tilt the same way and read as one perspective/wind direction. */
export const MOUNTAIN_LEAN = { x: 0.34, z: -0.16 } as const;

/** Bloom strength/threshold tuned for the phosphor look; modest for mobile. */
export const BLOOM = {
  strength: 0.9,
  radius: 0.5,
  threshold: 0.0,
} as const;
