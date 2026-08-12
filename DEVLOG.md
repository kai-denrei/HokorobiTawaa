# Dev Log

Newest first. Surfaced in-app via the version badge → Dev Log tab.

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
  dim buildable), blocked cells as extruded 4-sided wireframe pyramids, spawn/
  base accent rings, additive bloom for the phosphor look, fixed tilted camera.
- Tap hit-testing resolves a screen tap to the correct irregular cell polygon
  (raycast to ground plane → point-in-polygon). Regenerate button reseeds.
- PWA: manifest + service worker (installable, offline shell).
- Cache-busting version badge wired to open this Dev Log and the Rules.

### Next

- Units milestone: port the Braille "thinking-orbs" halftone engine, render the
  mechanical tower family on buildable cells.
