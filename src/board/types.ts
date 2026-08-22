// types.ts — game-facing board types. PURE.
// Game logic sees only `Board` — never the mesh. Cell size/shape is visual;
// every cell is one game space.

export type CellId = number;
export type Vec2 = [number, number];

/** Tower-defense terrain roles (board.md §terrain typing). Exactly one per cell. */
export type TerrainKey = 'blocked' | 'path' | 'buildable' | 'spawn' | 'base';

export type Cell = {
  id: CellId;
  /** Primary-vertex position — used for angles, distances, unit placement. */
  center: Vec2;
  /** CCW render ring (math convention, y up), in normalized [0,1]² space. */
  polygon: Vec2[];
  /** Adjacent cell ids, sorted ascending for determinism. */
  neighbors: CellId[];
  terrain: TerrainKey;
};

/** One rim approach in a central-siege board: a spawn and its route to the base. */
export type Sector = { spawn: CellId; route: CellId[] };

export type Board = {
  /** All playable cells, keyed by stable id (= generation order). */
  cells: Map<CellId, Cell>;
  /** Seed that produced this board. */
  seed: number;
  /** Entry cell(s) enemies spawn from. */
  spawns: CellId[];
  /** The single goal cell; reaching it costs a life. */
  base: CellId;
  /** Ordered fixed route spawn → base (inclusive), all terrain 'path'. */
  path: CellId[];
  /** Alternate spawn → base routes (0–2), initially closed (blocked terrain);
   * opened one at a time mid-game (waves 6 & 9). Once open, enemies pick the
   * main path or any open alternate at random. Empty when the board can't fit
   * a distinct alternate corridor. */
  altPaths: CellId[][];
  /** Central-siege sectors (Endless mode) in reveal order: sector 0 is the
   * active starting approach; 1+ start closed (interiors 'blocked') and are
   * opened one per fraying milestone. Undefined for Campaign (linear) boards. */
  sectors?: Sector[];
};
