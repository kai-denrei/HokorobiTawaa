# Design — Endless Mode v1: Concentric Siege (2026-08-22)

## Summary

A new **Endless** mode, separate from and leaving untouched the shipped 12-wave
Campaign (title "Play" + the Continue/loop from
`2026-08-14-progression-and-board-design.md §E`). In Endless you defend the
Heart at the **centre** of a large board against waves that never stop. The
board **unravels** (綻び): you begin framed tight on the Heart and its single
incoming approach — plays like the Campaign early — and every 5 waves a new wedge
tears open (its rim spawn wakes, the camera pulls back) until the Heart is
besieged from every active direction. Score = how deep you reach.

**v1 is core-only:** central-siege board + progressive reveal/fraying +
procedural endless waves + depth scoring. Everything else is explicitly deferred
to v2 (see Non-goals).

## Goals / non-goals

**Goals:** prove the concentric-siege *reveal* is fun; endless escalation; reuse
existing systems (`openPath`/`openAltPaths`, the camera tween system, `Game`,
the wave animatic, the result screen) wherever possible; **zero changes to the
Campaign**.

**Non-goals (v2, explicitly out of scope):** milestone bosses; wave
affixes/mutators; per-type tower caps; early-call bonus; upgrade time-delay;
targeting priority; roster/shape expansion; meta-progression/persistent unlocks;
true board growth (appending geometry at runtime); fog-of-war reveal.

## Player experience

1. Title screen gains an **Endless** button beside Play.
2. Camera opens **tight on the Heart + one approach**; early game feels like the
   Campaign (threats from one direction).
3. Waves 1–12 reuse the authored compositions (`buildWaves`) so the new-threat
   animatics still fire in order; wave 13+ is procedural.
4. **Every 5 waves = a fraying milestone:** the next sector's route tears open
   (the existing `openPath` reveal animation), its rim spawn wakes, and the
   camera pulls back to frame the newly revealed sector. After ~5 milestones the
   whole board is live and the Heart is attacked from all active directions.
5. Runs until lives hit 0. The result screen shows the **deepest wave reached**
   (no victory state — Endless never "wins").

## Design

### 1. Mode entry & state (`main.ts`, overlay)

- Title gains an **Endless** button (`screens.ts` title screen), wired through
  `OverlayHandlers.onEndless`.
- `main.ts` adds `startEndless()` and extends `Mode` to `'attract' | 'play' |
  'endless'`. The Campaign path (`startPlay`, the 12-wave `Game`) is unchanged.
- Attract rotation / camera-view buttons behave as today outside Endless; inside
  Endless the reveal drives the camera (see §4).

### 2. Board: central-siege variant (`src/board/`)

Reuse `generateCells(seed, targetCells)` verbatim — it is topology-agnostic (it
only builds the cell mesh; `terrain.ts` decides roles). Add a **parallel
terrain-typing pass** rather than touching the Campaign's `terrain.ts`:

- New `src/board/terrain-central.ts`: `typeCentralSiege(cells, { spawnCount, ...rng })`:
  - **base** = the cell whose `center` is nearest the board centroid `(0.5, 0.5)`.
  - **spawns** = `spawnCount` cells near the perimeter, chosen to spread roughly
    evenly by **angle** around the centre (one per angular sector).
  - **routes** = a BFS route (reuse `terrain.ts`'s BFS helper) from each spawn to
    the base; cells on it typed `path`, base `base`, spawns `spawn`.
  - remaining cells: a sparse fraction `blocked` (walls, matching the Campaign's
    low `mountainFraction`), the rest `buildable`.
  - **sectors**: emit `sectors: { spawn: CellId; route: CellId[] }[]` ordered by
    reveal order (sector 0 = the starting approach). Sector 0's route is the
    initial active `path`; sectors 1+ are closed routes revealed later — mapped
    onto the existing `altPaths` slot mechanism so `openPath` works unchanged.
  - Best-effort like `altPaths`: if a seed can't fit `spawnCount` distinct
    routes, emit fewer (never throw) — mirror the "skip when impossible" grace.
- **Endless builder defaults:** `boardSize ≈ 300` (top of the existing 120–320
  range — room for centre + rim + sectors) and `spawnCount = 6` (sector 0 active
  at start + 5 fraying reveals ≈ one every 5 waves through ~wave 25).
- `Board` gains `sectors?: { spawn: CellId; route: CellId[] }[]` (optional;
  Campaign boards leave it undefined). `spawns`/`path`/`altPaths` still populated
  so all existing consumers keep working.

*Implementation note:* read `terrain.ts` when implementing to reuse its exact BFS
+ wall logic; this pass is a sibling, not a rewrite.

### 3. Progressive reveal + fraying (`scene.ts`, `game`)

Reveal in v1 is **camera + spawn activation — NOT fog-of-war.** The whole board
renders; the camera simply starts tight on sector 0 and pulls back per milestone.
Off-frame sectors are dormant (no spawns) and effectively un-tappable (fixed
camera → off-screen cells aren't hit by taps), so building is naturally gated to
the revealed area.

Each fraying milestone (fired by the endless loop every 5 waves):
1. `view.openSector(i)` opens sector `i`'s route with the existing `openPath`
   reveal animation (route cells `blocked → path`).
2. Its spawn activates: the sector's world route is pushed into the active-routes
   list enemies draw from (reuse `openAltPaths`).
3. The camera tweens to a **wider reveal pose** framing all revealed sectors.

After all sectors are revealed, later milestones only escalate waves.

### 4. Camera reveal poses (`camera-views.ts`, `scene.ts`)

Endless drives the camera automatically at milestones via a **reveal-pose
progression**: tight on sector 0 → progressively wider → full-board overhead,
computed from the bounding region of revealed sectors (reuse the fov-vs-aspect
approach from `camera-views.ts` so it frames on portrait phones). Reuse the
existing tween (`setView`/`applyPose`). Manual view switching may stay available
between milestones; a milestone reveal overrides to the reveal pose.

### 5. Endless waves (`src/game/endless.ts`, `game.ts`)

- Waves 1–12 reuse `buildWaves()` (opening ramp; drives the animatic).
- New **pure** `endlessWave(waveIndex, ctx) → SpawnGroup[]` for wave 13+:
  escalate total count, group variety, and tempo (shorter intervals) with the
  wave index, drawing from all introduced enemy keys. HP continues on a curve
  (gentler than pure `LOOP_HP_MULT` inflation). Unit-tested like
  `newEnemyTypesByWave`.
- `spawnEnemy` distributes across **active** sector routes (its route-pick
  already chooses among `[main, ...openAltPaths]`; active sectors feed that).
- Endless `Game`: an `endless` flag (extend `Game`, or a thin sibling
  controller) — no win at wave 12 (keep generating); fire `onFraying(sector)`
  every 5 waves; result only on loss; score = deepest wave (+ kills via existing
  scoring). Reuse lives/economy/streak. `START_LIVES` may be a touch higher for
  multi-direction pressure (tune in playtest).

### 6. Scoring / result

Reuse the result screen; show **"Reached wave N"** + the kills histogram. No
victory/Continue button in Endless.

## Components (files)

- `src/board/terrain-central.ts` (new, pure): `typeCentralSiege` + sectors.
- `src/board/index.ts`: an Endless board builder (`generateCells` +
  `typeCentralSiege`); `types.ts` gains optional `sectors`.
- `src/game/endless.ts` (new, pure + tested): `endlessWave` generator; endless
  loop control (no-win, milestone callback) — or an `endless` branch in `game.ts`.
- `src/render/scene.ts`: `openSector(i)` (reuse `openPath`/`openAltPaths`) + the
  reveal-camera hook.
- `src/render/camera-views.ts`: reveal-pose progression from revealed region.
- `src/ui/overlay/*`: Endless title button; result "Reached wave N".
- `src/main.ts`: `startEndless()`, `'endless'` mode, milestone → scene glue.

## Data flow

Title **Endless** → `main.startEndless()` → build central board (`generateCells`
+ `typeCentralSiege`, large `boardSize`) → `view.setBoard(centralBoard)` with
only sector 0 active + camera tight → endless `Game` ticks → every 5 waves it
fires `onFraying(i)` → `scene.openSector(i)` (openPath anim + activate spawn +
camera pull-back) → waves keep generating (authored 1–12, procedural 13+),
spawning across active routes → lives-out → result (depth).

## Testing

- **Pure unit tests:**
  - `endlessWave`: total/variety escalate monotonically with wave index; only
    valid enemy keys; deterministic.
  - `typeCentralSiege`: base is the centre-most cell; up to `spawnCount` spawns
    on the rim spread by angle; each spawn has a BFS route to base; sectors
    ordered; best-effort (fewer, never throw) on tight seeds; deterministic.
- **Headless-Chrome smoke (reuse the harness):** enter Endless → exactly 1 active
  spawn + tight camera; force a milestone → a second sector opens, its spawn
  activates, camera pulls back; run continues past wave 12 (procedural); lives-out
  → result shows a depth. Screenshots of the tight-start and a mid-reveal frame.
- `tsc` + full `vitest` + `vite build` clean.

## Risks / open tuning

- **Route packing:** a Voronoi board may not fit `spawnCount` distinct
  spawn→centre routes on every seed — use the `altPaths` best-effort grace
  (fewer sectors) and, if needed, a seed retry in the Endless board builder.
- **Reveal framing** across aspect ratios (portrait) — reuse the fov-coverage
  reasoning already in `camera-views.ts`.
- **Balance:** multi-direction leak pressure vs `START_LIVES`/economy — playtest.
- **Perf:** whole large board rendered while only partly on-frame — confirm
  frame rate with the bigger cell count + more concurrent enemies (the dot-LOD
  work already handles close-up brightness).
