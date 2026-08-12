# Dev Log

Newest first. Surfaced in-app via the version badge → Dev Log tab.

## 2026-08-12 — Edge-only movement & full-cell highlight

- Adjacency is now EDGE-only: cells that merely touch at a corner (quad diagonal)
  are no longer neighbours. Units can't cut corners, and every BFS path is a
  continuous open corridor (consecutive cells share a full edge) — guaranteeing
  at least one clean route spawn→base. Board invariant tests still pass.
- Selecting a cell now highlights the WHOLE raised block (inset top ring +
  vertical ribs + base) in white, visible on top, instead of just the hidden
  ground ring. Low path cells keep a ground ring.

## 2026-08-12 — Platforms & hallways

- Reworked the spatial model: buildable cells are now raised green **platforms**
  (towers placed on top, elevated to WALL_HEIGHT), blocked cells are grey walls,
  and the path is a **dark low hallway** (dim floor) the enemies walk between them.
- Raised blocks are inset toward their centre (BLOCK_INSET) so adjacent blocks
  leave a gap — cleaner corridor read and clearance.
- Collision fix: enemies shrunk (enemyScale 0.03) and the inset gap keep walking
  enemies inside the hallway channel instead of clipping into wall geometry.
  Towers use towerScale 0.045 and sit on the platform tops.

## 2026-08-12 — Units (spawn test, no gameplay)

- Ported Braille "Fun Shapes" point-cloud generators (Thinking Orbs engine,
  MIT © Jakub Antalik) into `src/units/shapes.ts` — the exact unit shapes,
  rendered as THREE.Points (dotted-halftone) instead of Braille's 2D canvas.
- Roster (`src/units/roster.ts`): 7 towers (Pine Tree, Gear, Spiral, Double
  Spiral, Teardrop, SONGS Domes, DNA Helix — green) + 5 enemies (Butterfly,
  Breathing Cloud, Torus Knot, Nautilus Shell, Wave Ghost — amber).
- `Unit`/`Enemy` (`src/units/unit.ts`): round additive dot sprites; towers
  static with subtle spin (Gear/Spiral/DNA); enemies idle-animate (spin/
  breathe/flutter/bob) and walk the fixed spawn→base path on a loop.
- Placement: tap a buildable cell → tower list; tap the path/spawn → enemy
  list (bottom-sheet palettes). Solid terrain is the default.
- Terrain reworked: blocked cells are now flat-topped raised blocks (walls) at
  a uniform elevation instead of pyramids, so the path/buildable cells read as
  low hallways between walls (wire + solid both updated).
- Verified headless: 12 units spawn, enemies walk the path, tap→palette→place
  works, zero console errors. Still NO gameplay (no combat/economy).

## 2026-08-12 — Board milestone

- Scaffolded Vite + TypeScript + Three.js (vanilla-TS UI, no React).
- Ported the Stålberg organic-mesh pipeline from STB_BruchmalysII
  (poisson → triangulate → merge-to-quads → subdivide → relax → half-edge →
  dual cells) into `src/board`, adapted to tower-defense terrain types.
- Added a terrain typing pass: spawn/base at the graph-diameter endpoints,
  BFS shortest path between them, a buildable band around the path, and blocked
  mountains elsewhere (plus a seeded mountain scatter).
- Adjacency graph is first-class and queryable (edge + diagonal neighbours);
  BFS distance/path/diameter helpers live in `src/board/geometry.ts`.
- 7 vitest invariants pass: cell count, terrain validity, adjacency symmetry,
  single base / ≥1 spawn, path connectivity, reachability, determinism.
- Rendered the board in Three.js: green-on-black wireframe cells (bright path,
  dim buildable), blocked cells extruded into grey pyramids whose base IS the
  cell's own irregular polygon. Heights vary per cell but every apex leans the
  SAME direction (uniform tilt) for a shared perspective/wind read. A UI toggle
  switches mountains between grey wireframe and lit solid faces (directional +
  ambient light; the wireframe board is unlit LineBasic and unaffected). Spawn/
  base accent rings, additive bloom, fixed tilted camera.
- Tap hit-testing resolves a screen tap to the correct irregular cell polygon
  (raycast to ground plane → point-in-polygon). Regenerate button reseeds.
- PWA: manifest + service worker (installable, offline shell).
- Cache-busting version badge wired to open this Dev Log and the Rules.
- **Verified** headless (cached Chromium): WebGL live, zero console errors,
  board renders, badge opens this panel, HUD reads seed/cells/path. Tilted
  camera reframed to fit the whole board above the bottom HUD.

### Next

- Units milestone: port the Braille "thinking-orbs" halftone engine, render the
  mechanical tower family on buildable cells.
