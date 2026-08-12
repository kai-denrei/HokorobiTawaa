# HokorobiTawaa — Design Spec (V1, Board Milestone)

Date: 2026-08-12
Status: Approved for planning

## 1. What this is

HokorobiTawaa (綻びタワー塔) is a mobile-first PWA tower-defense game: fixed-path
combat on a procedurally generated organic (Stålberg) board, rendered in a
monochrome green-on-black retro vector-wireframe style. Two visually distinct
unit families (mechanical towers, static; organic/aquatic enemies, animated)
and a geoDefense-style economy (per-enemy-type payout + kill-streak multiplier).

This is a **new build** that takes inspiration from prior local repos — not a
literal merge. Where a local repo solves part of the problem, its *logic* is
ported and adapted to the new stack; its rendering is not copied (this project's
visual style is wireframe/halftone, not the sources' filled/pastel look).

The full game is decomposed into milestones (PLAN.md build order). **This spec
covers the first milestone: the Board.** Units, enemies, economy, and the
lightning capstone each get their own spec → plan → implementation cycle later.

## 2. Source reconciliation (verified on disk)

PLAN.md's repo names did not all match disk. Resolved mapping:

| Purpose | PLAN.md name | Actual source (verified) |
|---|---|---|
| Stålberg organic mesh | `n7-automata` / `brumachlys-ii` | **`/Users/minikai/Dev/STB_BruchmalysII/src/board/`** (pkg `brumachlys-ii`) — chosen as primary per user |
| Halftone unit engine | `braille-lab/primitives` | **`/Users/minikai/Dev/Braille/thinking-orbs/index.html`** (MIT © Jakub Antalik) + `Braille/primitives` |
| Lightning BFS | `maze-lightning` | **`/Users/minikai/Documents/Dev/maze-lightning`** |
| Secondary grid ref | `n7-automata` | `/Users/minikai/Dev/n7-automata`, `/Users/minikai/Dev/oskar-procedure` (available if needed) |

Key finding: **STB_BruchmalysII is React + Zustand + Vite/TS with no Three.js.**
Its board code (`src/board/`: `poisson.ts`, `halfedge.ts`, `dual.ts`, `hex.ts`,
`generate.ts`, `grid.ts`, `vec.ts`) is **framework-agnostic pure TS** that emits
geometry + adjacency data — this is what we port. Its React renderer is discarded;
we render with Three.js. It also has `VersionBadge.tsx` + `RulesModal.tsx` whose
*logic* informs our version-badge → Dev Log/Rules panel (ported to vanilla TS).

Attribution rule: if the `thinking-orbs` engine file is reused directly, preserve
the MIT © Jakub Antalik notice.

## 3. Stack decisions

- **Vite + TypeScript + Three.js.** Build step expected (WebGL for wireframe +
  additive glow + later particle/halftone at mobile 60fps).
- **Vanilla TS UI overlay — no React.** The game is canvas-centric; STB's React
  modals are ported as lightweight DOM. (User confirmed drop React.)
- **PWA from day one** (mobile-pwa skill): `manifest.webmanifest`, service worker
  with offline caching, installable, touch-first, safe-area aware.
- **Cache-busting** (cache-busting skill): asset fingerprinting + anti-cache meta
  + the visual version badge.
- **Project memory**: `/deban init` — decision log in the Obsidian vault.
- **No PII** anywhere in code, comments, assets, or commit messages (PLAN global
  constraint). Commits authored as Kai Denrei per machine identity rules.

## 4. Module architecture

Boundaries chosen so each unit has one purpose, a defined interface, and is
independently testable. Board generation emits plain data; rendering, input, and
game logic consume it — none reach into another's internals.

```
src/board/        port Stålberg mesh from STB_BruchmalysII/src/board
                  (poisson → relax → halfedge → dual).
                  Output: Mesh { cells: Cell[], adjacency: Map<CellId, CellId[]> }.
                  Adjacency is first-class and queryable, NOT implicit in draw calls.
src/board/terrain.ts   NEW typing pass over the mesh. Assigns each cell exactly one of
                  blocked | path | buildable | spawn | base.
                  Method: pick spawn & base far apart → BFS path between them →
                  cells within radius of path become buildable → scattered
                  remainder becomes blocked.
src/core/         types.ts, rng.ts (seeded/deterministic), graph.ts (BFS + adjacency
                  utils) — shared by terrain, pathing, and later the lightning tower.
src/render/       Three.js scene + fixed tilted iso/ortho camera.
                  - cell wireframe (stroke-only, single green hue, black bg)
                  - additive-blend glow pass (cheap; profile before real bloom)
                  - blocked cells → wireframe pyramids/cones extruded up
                  - path cells → perspective-correct ground grid lines
src/input/        hit-test.ts — tap → cell via actual polygon bounds (precomputed
                  lookup if per-frame testing is too slow on mobile).
src/ui/           vanilla TS overlay. VersionBadge (corner widget) → DevLog/Rules panel.
src/game/         stubs only this milestone (units/enemies/economy/lightning later).
public/           manifest.webmanifest, service worker, icons.
DEVLOG.md         append-only progress log, surfaced in-app (see §6).
RULES.md          game + project rules, surfaced in-app.
```

## 5. Board Milestone — deliverables (this session)

1. **Mesh generation**: seeded procedural organic mesh ported/adapted from
   STB_BruchmalysII. Produces cells and a **queryable adjacency graph**.
2. **Terrain typing**: spawn & base far apart → BFS path → buildable ring →
   scattered blocked. Invariants hold (see §7). Regenerated per level (procedural,
   not hand-authored); wave difficulty decoupled from layout.
3. **Wireframe render**: green-on-black stroke cells + additive glow; blocked =
   wireframe pyramids; path = perspective ground grid; fixed tilted iso camera.
   No filled/pastel fills, no literal vehicle/object rendering.
4. **Hit-testing**: tap resolves to the correct irregular cell polygon.
5. **Regenerate-per-level**: new seed → new board via a control.
6. **PWA installable**, targeting mobile 60fps. **Stop for review before units.**

Explicit non-goals for the milestone (and V1): no tower-blocking open maze (fixed
path only), no ground-level/first-person camera, no literal object rendering,
no unit/enemy/economy/lightning systems yet.

## 6. Dev Log + Rules mechanism

The cache-busting **version badge** (corner widget in the running PWA) is
tappable → opens an overlay panel with two tabs:

- **Dev Log** — `DEVLOG.md` rendered in-app; each milestone/commit appends an
  entry. This is the progress-tracking surface visible from inside the game.
- **Rules** — `RULES.md` (game rules + project rules) rendered in-app.

The badge is the single in-app entry point to "where are we / what are the rules,"
and it also confirms (via the cache-busting token) that the latest build loaded.

## 7. Testing

- **vitest** (unit): mesh validity (no degenerate cells); adjacency symmetry
  (a∈adj(b) ⇒ b∈adj(a)); path connectivity (spawn reaches base along `path`
  cells); terrain invariants (every cell exactly one type; ≥1 spawn; exactly one
  base; no `buildable` orphaned from the walkable region); determinism (same seed
  ⇒ same board).
- **Playwright** (smoke): app boots and renders a board; PWA manifest + service
  worker register; version badge opens the Dev Log/Rules panel.

## 8. Milestones after this one (out of scope now)

Units (halftone towers) → Enemies (halftone organic, animated, BFS pathing) →
Economy (per-type payout, streak multiplier, waves, lives, tower cost/refund) →
Lightning capstone (DNA Double Helix, BFS chain over the enemy-occupied adjacency
graph, charge resource, 3 visual phases). Each is its own spec/plan/build.
