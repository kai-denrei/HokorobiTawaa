# Close-up dot LOD — design

## Problem

In close camera views — especially view 5 (Trench, camera ~0.3 units from its
subject), and most visibly on a fully-upgraded (tier-2) tower that fills the
frame — the point-cloud dots blow out to flat white. You lose all structure.

Measured cause, four factors stacking:

1. **Dots grow on screen up close.** `PointsMaterial` uses `sizeAttenuation:
   true`, so screen dot size scales ~`1/distance`. Trench (~0.3u) vs Tactical
   (~1.9u) ≈ **6× wider** dots (~30–40× area).
2. **Additive blending sums overlaps.** `AdditiveBlending` adds where dots
   overlap; 6× dots overlap heavily → the sum passes 1.0.
3. **Bloom blooms everything.** `BLOOM.threshold = 0.0` feeds every lit pixel to
   bloom (strength 0.9).
4. **No highlight rolloff.** Renderer is `NoToneMapping` → sums hard-clip to pure
   white at 1.0.

A tier-2 tower makes it worse only because it scales up ~1.24× and runs the
twist idle, so it *fills more of the close frame* (the dots themselves don't get
bigger with upgrades).

## Goal

Both **crisp** (the point-cloud shape reads up close, not a white blob) **and no
blowout** — without changing the look at normal distances. The artifact only
exists up close, so the fix must only act up close.

## Approach — B: distance-aware dots

Per unit, each frame, scale that unit's dots by camera proximity:

- **shrink** dot size toward a floor as the camera nears → distinct dots (crisp)
  and less overlap (already cuts the additive summing);
- **dim** dot brightness toward a floor as the camera nears → bounded additive
  sum → no white clip.

Distant units are untouched (both factors → 1.0), so views 1–3 and all distant
content render byte-for-byte as before. No shader edits, no tone-mapping, no
bloom changes — the phosphor look is preserved.

Rejected alternatives: **A** (shader `gl_PointSize` clamp + ACES tone-mapping) —
more global/robust but regrades every color and needs bloom/palette retuning;
**C** (a view-scoped "close-up mode") — coarse (dims far units too) and only
helps the dynamic views.

## Components

- **`src/units/proximity.ts`** (new, pure, no THREE): `dotLOD(distance) → {
  size, bright }`, multipliers in `[min, 1]`, smoothstepped between `LOD_NEAR`
  and `LOD_FAR`. Exported tuning constants: `LOD_NEAR`, `LOD_FAR`,
  `LOD_SIZE_MIN`, `LOD_BRIGHT_MIN`. Kept in `src/units/` so `unit.ts` imports it
  without a units→render dependency.
- **`Unit`** (`src/units/unit.ts`): store `baseDotSize` (= `baseScale * 0.14`,
  currently an inline literal in the material). Add
  `applyLOD(cameraPos: THREE.Vector3)`:
  `d = object.position.distanceTo(cameraPos); const lod = dotLOD(d);
  mat.size = baseDotSize * lod.size; mat.color.setScalar(lod.bright)`.
  (With `vertexColors`, `material.color` multiplies the per-vertex colors, so a
  scalar grey dims brightness while preserving hue.)
- **`BoardView`** (`src/render/scene.ts`): a public `lodEnabled = true` debug
  flag; in the render loop, right after each unit's `update`, call
  `u.applyLOD(this.camera.position)` when enabled. Applies to towers and
  enemies. The base heart is a separate object and is out of scope (revisit only
  if it also blows out).

## Data flow

Render loop → for each unit: `update(dt, elapsed)` (moves enemies) → then
`applyLOD(camera.position)` (reads the fresh position) → sets that unit's
`PointsMaterial` size + color for this frame → `composer.render()`.

## Tuning (initial — expect eyeball adjustment on device)

`LOD_NEAR = 0.35`, `LOD_FAR = 0.9`, `LOD_SIZE_MIN = 0.45`,
`LOD_BRIGHT_MIN = 0.55`. Rationale vs measured view distances: Trench ~0.3 (full
effect), Action ~0.54 (partial), Cinematic ~1.6 and Tactical ~1.9 (unaffected,
≥ FAR). All knobs live in the one file.

## Non-goals / risks

- No changes to bloom, tone-mapping, or the palette (preserve the look).
- Per-unit (not per-dot) granularity — acceptable; a single unit's dots are all
  ~the same distance from the camera.
- Heart base excluded for now.
- Independent of existing per-unit state: HP `setDensity` (drawRange), the tier
  upgrade `object.scale` bump, and the death-poof FX all leave `mat.size` /
  `mat.color` alone, so `applyLOD` is their sole writer — no interaction.
- Perf: `distanceTo` + two setters × ~tens of units per frame → negligible.

## Testing

- **Unit:** `dotLOD` — far → `{1,1}`, at/below `LOD_NEAR` → the mins, monotonic
  non-decreasing in distance, clamped, all factors in `(0, 1]`.
- **Headless A/B:** screenshot an upgraded tower close-up with `lodEnabled`
  false vs true → confirm the white blowout drops and colored structure
  remains; share the pair.
- `tsc` clean, full `vitest`, `vite build` clean.
