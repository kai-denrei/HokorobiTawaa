# Board System

## Topology — port from `n7-automata`
Read `/Users/minikai/Dev/n7-automata` before writing any mesh code.

- Reuse its organic quad-mesh generation: relaxed hex-lattice, dual-cell
  structure, ~4 neighbours per cell, adjustable board size/variance.
- Port the generation/relaxation logic itself, not its renderer.
- Output needed downstream: a cell adjacency graph (each cell → its
  neighbour cells), since pathing (enemy movement, lightning-tower
  targeting) runs as BFS over this graph, not over assumed grid
  coordinates. Adjacency must be a first-class, queryable structure —
  not just implicit in draw calls.

## Terrain typing pass (new, on top of the ported mesh)
After mesh generation, assign each cell exactly one type:
- `blocked` — impassable (mountains). Rendered as terrain (see below),
  never buildable, never walkable.
- `path` — the fixed route enemies walk from spawn to base.
- `buildable` — open cells where towers may be placed.
- `spawn` — one or more entry cells.
- `base` — the single goal cell; reaching it costs the player a life.

V1 uses a **fixed path**, not open-maze blocking — decided earlier to keep
pathing predictable and rendering/hit-testing simpler. Generate the path
by picking spawn and base cells far apart on the mesh, then BFS between
them to define the path cells; everything reachable off that path within
some radius becomes `buildable`, and a scattered remainder becomes
`blocked`.

Regenerate the full mesh + typing pass per level (not hand-authored maps),
per the earlier decision that wave difficulty is decoupled from board
layout.

## Rendering — retro vector-wireframe, not filled/pastel
This is a deliberate departure from the project default (near-black bg,
amber/teal accents) — scoped to this project only.

- Cells: stroke-only outlines of the mesh's cell edges. No fill, or
  near-zero-alpha fill just to keep cells tappable. Single hue (green,
  per reference image), black background.
- Glow: additive-blend duplicate stroke pass with slight blur for a
  phosphor look. Keep this cheap — profile on actual mobile hardware
  before adding a full bloom post-process pass.
- `blocked` cells (mountains): render as wireframe pyramids/cones
  extruded upward from the cell, matching the reference screenshot.
  This reuses the pyramid/tetra primitive geometry from `braille-lab`
  (see `units.md`) but in wireframe-edges mode instead of dotted-halftone
  points — terrain uses wireframe, units use dots, as a deliberate
  visual split between "board" and "actors."
- `path` cells: ground-plane grid lines, perspective-correct under the
  chosen camera (see below).
- No tank, no literal vehicle/object rendering anywhere on the board.

## Camera
Tilted/isometric-ish angle — steep enough to sell the vector-wireframe
mood, shallow enough that tap-placement and range-circle readability on
irregular Stålberg cells stay easy. Explicitly **not** a ground-level/
first-person perspective (rejected — bad for hit-testing irregular cells
and for reading tower ranges).

## Hit-testing
Because cells are irregular polygons (not a uniform grid), tap-to-cell
resolution must test actual cell polygon bounds, not nearest-grid-index
math. Precompute a lookup structure at mesh-generation time if per-frame
polygon testing proves too slow on mobile.
