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
  /** Optional alternate route spawn → base, initially closed (blocked terrain);
   * opens mid-game so enemies pick path or path2 at random. */
  path2?: CellId[];
};
