# Tower Defense PWA — V1 Build Plan

## What this is
A mobile-first PWA tower defense game. Fixed-path combat on a procedurally
generated organic board, rendered in a monochrome retro-vector/wireframe
style, with two visually distinct unit families (mechanical towers vs.
organic/aquatic enemies) and an economy modeled on geoDefense's
per-enemy-type payout + streak-multiplier structure.

This is a **new build**, not a literal merge of three existing repos.
Where a local repo already solves part of the problem, port and adapt its
logic — do not blindly copy rendering code, since the visual style here is
different (wireframe, not filled/pastel; halftone dots, not solid fills).

## Local reference repos (read before implementing the related system)
All under `/Users/minikai/Dev/`:
- `n7-automata` — Stålberg organic quad-mesh generation/relaxation. Source
  for board topology only. Discard its pastel dual-cell rendering.
- `braille-lab` (specifically `primitives/`) — sphere-surface point `warp()`
  onto primitive geometries, built on the "Thinking Orbs" halftone engine
  (MIT © Jakub Antalik, keep attribution if that engine file is reused
  directly). Source for the unit rendering layer.
- `maze-lightning` — BFS shortest-path/frontier-expansion visualizer.
  Source for the lightning-chain tower's pathing and visual phases.
- `brumachlys-ii` — secondary reference only, for how the organic grid was
  previously adapted into a playable board; consult if `n7-automata`'s
  logic alone is insufficient for a tile-typed, interactive board.

If any of these paths don't resolve or the referenced logic isn't where
expected, stop and ask rather than guessing at a replacement algorithm.

## Per-system specs (this directory)
- `board.md` — mesh generation, terrain typing, wireframe render, camera
- `units.md` — tower and enemy shape taxonomies, rendering, upgrade tiers
- `economy.md` — currency, streak multiplier, wave structure, capstone charge
- `lightning-tower.md` — the capstone tower's BFS-based chain effect

## Build order (suggested)
1. Board: mesh generation + terrain typing pass, static wireframe render,
   fixed tilted/isometric camera. No units yet. Confirm it looks right and
   is tappable/hit-testable before moving on.
2. Units: static tower rendering (mechanical family, no animation needed
   yet) + placement on buildable cells.
3. Enemies: organic family rendering with idle animation, pathing along
   the board's fixed path (reuse BFS from board/lightning-tower work).
4. Economy: currency, wave spawner, streak multiplier, win/loss state.
5. Lightning-chain capstone tower, last — it depends on board adjacency
   graph (step 1) and enemy pathing (step 3) both being stable.

## Explicit non-goals for V1
- No tank/vehicle unit or literal-object rendering — stay abstract/geometric.
- No open-maze tower-blocking pathing — fixed path only.
- No full ground-level first-person camera — tilted/isometric only.
- Camera and control scheme must remain tap-friendly on mobile; do not let
  visual style decisions (wireframe, perspective) compromise hit-testing.

## Global constraints
- No PII, no personal identifiers anywhere in code, comments, assets, or
  commit messages.
- Vanilla ES modules preferred where feasible; a build step is acceptable
  and expected here (WebGL/Three.js for wireframe + particle rendering at
  mobile 60fps), consistent with the symmetry-primitive-engine precedent.
- PWA basics required: manifest + service worker for offline caching.
