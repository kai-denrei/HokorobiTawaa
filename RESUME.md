# Resume notes — HokorobiTawaa

**Status @ 2026-08-12:** Board milestone (PLAN.md step 1) is **complete,
verified, and locally testable.** Everything below is what remains for a full
V1. Pick up at "Units."

## How to test the board right now
```
cd /Users/minikai/Dev/HokorobiTawaa
npm install      # if node_modules is missing
npm run dev      # Vite dev server; open the printed localhost URL
# or: npm run build && npm run preview   (production build + static preview)
npm test         # 7 board-invariant vitest checks
```
Tap cells to inspect (id / terrain / neighbours), press **Regenerate** for a new
seed, tap the **version badge** (top-right) for the in-app Dev Log + Rules.

## What's done
- Vite + TS + Three.js scaffold, vanilla-TS UI (no React).
- `src/board`: ported Stålberg mesh pipeline + TD terrain typing + first-class
  BFS adjacency graph. 7 invariants pass.
- `src/render`: green-on-black wireframe cells, mountain pyramids, spawn/base
  rings, bloom, tilted camera, raycast tap hit-testing.
- PWA (manifest + service worker), cache-busting (bump-version.mjs + badge).
- deban vault at `.deban/` (gitignored). Spec at
  `docs/superpowers/specs/2026-08-12-hokorobitawaa-board-milestone-design.md`.

## Remaining milestones (PLAN.md build order)
Build each as its own spec → plan → implement → verify → commit cycle.

1. **Units — towers (mechanical, static).** Port the Braille "thinking-orbs"
   halftone engine from `/Users/minikai/Dev/Braille/thinking-orbs/index.html`
   (MIT © Jakub Antalik — keep attribution) and its `primitives/` `warp()` onto
   primitive geometries. Render the tower family (Pine Tree, GEAR, Spiral,
   Double Spiral, TearDrop, SONGS Dome, DNA Double Helix) as dotted-halftone
   points. Place on `buildable` cells via the existing hit-test. Dots = actor,
   wireframe = board (deliberate split). See `units.md`.
2. **Enemies — organic/aquatic, animated.** Same halftone engine; idle-animate
   (pulse/drift/ripple/flutter). Walk the fixed `board.path` (already computed).
   Shapes: Butterfly, Breathing Cloud, Torus Knot, Wave Ghost (trims noted in
   `units.md`). Dot density scales with HP fraction (no health bars).
3. **Economy.** Per-enemy-type payout, kill-streak multiplier (resets on leak),
   waves (escalating, periodic spike waves), lives pool, tower cost/upgrade/
   refund, per-tower capstone charge resource. See `economy.md`.
4. **Lightning capstone (DNA Double Helix), last.** BFS chain over the
   enemy-occupied adjacency graph; port the 3 visual phases (frontier / trace /
   bolt) from `/Users/minikai/Documents/Dev/maze-lightning`. Depends on the
   adjacency graph (done) and enemy pathing (milestone 2). See `lightning-tower.md`.

## Open questions to resolve (also in `.deban/roles/`)
- Does diagonal cell adjacency (corner-sharing = distance 1) cause visually-odd
  path shortcuts? (arch.md)
- Is a Board-only build the "V1" the operator wanted, or does testable V1 need
  ≥1 tower + enemy? (pm.md) — **answer likely determines whether to keep looping.**
- geoDefense payout/streak numbers are invented — need real reference values? (pm.md)
- Mobile 60fps with halftone particles + bloom — profile on device. (arch.md/qa.md)
