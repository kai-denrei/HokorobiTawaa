// proximity.ts — distance-based level-of-detail for a unit's point-cloud dots.
//
// In close camera views the additive dots overlap and blow out to flat white
// (sizeAttenuation grows them ~1/distance, additive blending sums the overlaps,
// bloom + no tone-mapping clip to white). As the camera nears a unit we shrink
// its dots (distinct dots = crisp structure, and less overlap already cuts the
// summing) and dim them (bounded additive sum = no clip). Distant units are
// untouched, so the normal look is unchanged. Pure + unit-tested; scene.ts feeds
// it the live camera distance each frame.

/** Distance (world units) at/below which the effect is fully applied. */
export const LOD_NEAR = 0.35;
/** Distance at/beyond which there is no effect (factors = 1). */
export const LOD_FAR = 0.9;
/** Dot size multiplier floor when fully close. */
export const LOD_SIZE_MIN = 0.45;
/** Dot brightness multiplier floor when fully close. */
export const LOD_BRIGHT_MIN = 0.55;

/** Smoothstep-eased 0..1, clamped. */
function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Size + brightness multipliers for a unit's dots at camera `distance`.
 * Both ease from their floor (close) up to 1 (at/beyond LOD_FAR). */
export function dotLOD(distance: number): { size: number; bright: number } {
  const k = smoothstep((distance - LOD_NEAR) / (LOD_FAR - LOD_NEAR)); // 0 near … 1 far
  return {
    size: LOD_SIZE_MIN + (1 - LOD_SIZE_MIN) * k,
    bright: LOD_BRIGHT_MIN + (1 - LOD_BRIGHT_MIN) * k,
  };
}
