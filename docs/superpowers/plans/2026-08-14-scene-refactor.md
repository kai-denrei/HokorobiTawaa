# scene.ts Refactor & Optimization Plan

> **For agentic workers:** implement iteration-by-iteration. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Break the 1073-line `BoardView` God object into focused, testable units and remove per-frame waste — behavior-preserving, on a strong base, before further feature work.

**Architecture:** Keep `BoardView` (`src/render/scene.ts`) as the thin owner of the Three.js scene/camera/loop and public API. Extract cohesive subsystems into sibling modules it composes: a pure geometry helper module (unit-tested), a projectile/visual-FX system, and a terrain/board builder. Then a focused optimization pass on the per-frame hot loops.

**Tech Stack:** TypeScript (strict), Three.js, Vite, Vitest.

## Global Constraints

- **Behavior-preserving.** No gameplay/visual change. Verify each iteration with the safety net below before committing.
- **No new deps.** Three.js + existing utils only.
- **Conventions:** wireframe = board, dotted = actors; deterministic board gen; no PII.
- **Author:** commits as Kai Denrei; end messages with the Co-Authored-By trailer.

## Safety net (run every iteration)

1. `npx tsc --noEmit` → 0 errors
2. `npx vitest run` → all pass
3. `npm run build` → succeeds
4. Visual smoke (headless Chrome, SwiftShader) on the running dev server:
   - `/` (attract: board + towers + enemies + combat FX)
   - `/#_score` style play HUD (nixie), `/#_over` (starburst + histogram) — via the temp probe pattern already used, or manual
   Compare against reference PNGs captured in Iteration 0.
5. Commit only when 1–4 are clean.

**Branch:** do this on `refactor/scene-ts`; merge to `main` when the checklist completes (or per-iteration if preferred).

## File structure (target)

- `src/render/scene.ts` — `BoardView`: scene/camera/composer/loop, public API, tower AI (`stepCombat`), picking/highlight, base/range, path opening. Composes the modules below.
- `src/render/coords.ts` *(new)* — pure coordinate/geometry helpers: `toWorld`, `insetWorld`, block-face builders. Unit-tested.
- `src/render/effects.ts` *(new)* — `EffectsSystem`: owns the pooled projectile point cloud, `effects` lines, `rings`; `fireStraight/Homing/Spread/Mortar/SlowField`, `spawnBurst/Ring/Laser/Lightning`, `updateProjectiles`, `updateEffects`, `reset`, `dispose`.
- `src/render/terrain-build.ts` *(new)* — pure-ish builders that turn a `Board` into wire/solid geometry arrays + the `HeartBase`/markers; returns groups for `BoardView` to add.

---

## Iteration 0: Baseline + testable geometry seam

**Files:**
- Create: `src/render/coords.ts`, `src/render/coords.test.ts`
- Modify: `src/render/scene.ts` (import `toWorld`/`insetWorld` from `coords.ts`; delete the local copies)

**Interfaces (Produces):**
- `toWorld(p: Vec2): [number, number, number]`
- `insetWorld(cell: Cell, p: Vec2, inset?: number): [number, number, number]`
- `blockWirePositions(cell: Cell): number[]` and `blockSolidPositions(cell: Cell): number[]` (extracted from `pushBlockWire`/`pushBlockSolid`, returning arrays instead of pushing into a target — callers concat)

- [ ] Capture reference screenshots (`/`, play, over) to `docs/superpowers/plans/ref/` (or scratchpad) as the visual baseline.
- [ ] Move `toWorld` (currently module-scope in scene.ts) and `insetWorld` (private method → pure fn taking `cell`) into `coords.ts`; export.
- [ ] Extract `pushBlockWire`/`pushBlockSolid` bodies into `blockWirePositions`/`blockSolidPositions` returning `number[]`; keep the WALL_HEIGHT constant in `coords.ts`.
- [ ] Write `coords.test.ts`: determinism + known-value checks (e.g. `toWorld([0,0])`, inset midpoint, a block face vertex count). Run `vitest` → pass.
- [ ] Update `scene.ts` to import from `coords.ts`; delete the local copies; `buildTerrain` uses the new array-returning builders.
- [ ] Safety net + commit: `refactor(scene): extract coords.ts pure helpers + tests`.

## Iteration 1: Extract `EffectsSystem` (projectiles + visual FX)

**Files:**
- Create: `src/render/effects.ts`
- Modify: `src/render/scene.ts` (delete moved fields/methods; delegate)

**Interfaces (Produces):**
```ts
class EffectsSystem {
  constructor(scene: THREE.Scene, group: THREE.Group, getEnemies: () => Enemy[], enemyScale: number);
  fireStraight(from, toPos, dmg, speed, color, size, trailMax): void;
  fireHoming(from, target, dmg, speed, color, size, trailMax): void;
  fireSpread(from, toPos, dmg, speed, pellets, color, size): void;
  fireMortar(from, targetPos, dmg, splash, color, size): void;
  fireSlowField(from, range, dmg, color, slowF, slowD): void;
  spawnLaser(from, to, color): void;   // beam towers
  update(dt: number): void;            // = updateProjectiles + updateEffects
  reset(): void;                       // clear projectiles/effects/rings
  dispose(): void;
}
```
**Consumes:** `Enemy` (`.object.position`, `.damage`, `.applySlow`, `.alive`), `MAX_PROJ`, the `Projectile` type.

- [ ] Move the `Projectile` type, `MAX_PROJ`, proj buffers (`projGeo/projPos/projCol/projSize/projPoints`), `effects[]`, `rings[]`, and methods `pushProj`, `fire*`, `spawnBurst`, `spawnRing`, `spawnLaser`, `spawnLightning`, `updateProjectiles`, `updateEffects` into `effects.ts`. Collision reads enemies via `getEnemies()`.
- [ ] In `BoardView`: hold `private fx: EffectsSystem`; construct it in the ctor (after `effectsGroup`); `stepCombat` calls `this.fx.fireX(...)` / `this.fx.spawnLaser(...)`; the render loop calls `this.fx.update(dt)` in place of `updateProjectiles`+`updateEffects`; `clearUnits`/`setBoard`/`dispose` call `this.fx.reset()`/`dispose()`.
- [ ] Keep the exact per-frame order: pathAnim → aura → units.update → heart → range ttl → combat → **fx.update** → cull → onTick → render.
- [ ] Safety net (screenshots must match: projectile/laser/lightning/mortar visuals) + commit: `refactor(scene): extract EffectsSystem`.

## Iteration 2: Extract terrain/board builder

**Files:**
- Create: `src/render/terrain-build.ts`
- Modify: `src/render/scene.ts`

**Interfaces (Produces):**
```ts
function buildBoardGeometry(board: Board, style: MountainStyle): {
  floorSegs: number[]; buildWire: number[]; blockWire: number[]; blockSolid: number[];
};
```
- [ ] Move `buildTerrain`'s geometry assembly (the loops producing `floorSegs/buildWire/blockWire/blockSolid`) into `buildBoardGeometry` using `coords.ts` helpers. `BoardView.buildTerrain` becomes: call it, then `addLineSegments`/`addSolidBlocks` (which stay — they touch scene state/materials).
- [ ] `setMountainStyle` re-runs `buildTerrain` (unchanged behavior).
- [ ] Safety net (board render identical across a few seeds) + commit: `refactor(scene): extract terrain builder`.

## Iteration 3: Per-frame optimization — allocations & scans

**Files:** Modify `src/render/scene.ts` (`stepCombat`, `stepAura`) and `src/render/effects.ts` (`updateProjectiles`).

- [ ] **Kill hot-loop allocations.** Replace `new THREE.Vector3()`/`.clone()` created per shot / per projectile-step with reused scratch vectors (`this.tmp*`). Audit `fire*` (each shot allocates a dir vector — reuse), `spawnLightning` (allocates basis vectors per bolt — reuse module scratch), and `updateProjectiles`' per-enemy `this.tmp.subVectors` (already reuses — confirm). Keep only allocations that must persist (a projectile's stored `pos/vel`).
- [ ] **Throttle target acquisition.** `stepCombat` scans all enemies for every tower every frame (O(T·E)). Add a small re-acquire interval (e.g. hold the current target while alive + in range, re-scan at ~10 Hz or when it dies). Preserves aim behavior, cuts scans ~6×.
- [ ] **Aura pass.** `stepAura` is O(E²). Early-out when no aura enemies present (already?); if not, skip the pass entirely when `auraCount === 0`.
- [ ] Safety net + a quick before/after frame-time note (log EMA in dev) + commit: `perf(scene): cut per-frame allocations and target scans`.

## Iteration 4: Pool effect geometries

**Files:** Modify `src/render/effects.ts`.

- [ ] `spawnLaser`/`spawnRing`/`spawnLightning` currently `new THREE.BufferGeometry()` + material per call and dispose on ttl → GC churn under heavy fire. Introduce a small reusable pool (or a single shared line geometry re-filled per active effect) so steady-state fire allocates ~0 geometries. Keep visuals identical.
- [ ] Safety net + commit: `perf(effects): pool line/ring geometries`.

## Iteration 5: Final sweep

**Files:** `src/render/scene.ts`, `src/render/effects.ts`, `src/render/coords.ts`.

- [ ] Remove any now-unused private fields/methods/imports left behind; tighten visibility and types; ensure `dispose()` releases everything the new modules own.
- [ ] Confirm `scene.ts` is materially smaller and each new module has one responsibility.
- [ ] Full safety net; commit: `refactor(scene): final tidy`; open PR / merge `refactor/scene-ts` → `main`.

---

## Self-review notes
- Coverage: every extraction has a delegation edit + the exact method list; optimizations name the specific hot spots.
- Risk order: pure helpers (0) → FX (1) → terrain (2) are structural moves; perf (3–4) changes behavior-adjacent code and is gated by screenshot diffs. Shapes-dead-code cleanup is intentionally **out of scope** (different file; tracked separately).
- The only genuine unit tests land in Iteration 0 (`coords.test.ts`); the rest rely on tsc/build + visual smoke, which is appropriate for Three.js render code.
