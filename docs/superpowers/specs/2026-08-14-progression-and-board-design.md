# Design — Progression & Board (2026-08-14)

Four related features plus one shared data-model change. Scope: `src/board/*`,
`src/game/game.ts`, `src/render/scene.ts`, `src/ui/overlay.ts`, `src/ui/styles.css`,
`src/main.ts`. Determinism and the existing "wireframe board / dotted actors"
conventions are preserved.

## A. Board data model (shared)

Generalize the single scaffolded `path2` into `altPaths: CellId[][]` on `Board`
(0–2 entries; the main route stays `path`). Supports N openable routes and the
loop mode.

- `types.ts`: replace `path2?: CellId[]` with `altPaths: CellId[][]` (always
  present, possibly empty).
- Update consumers: `terrain.ts`, `scene.ts`, and the `__hk` debug hooks in
  `main.ts` (`hasPath2` → `altPathCount`, `openPath()` gains an index).

## B. Fewer unbuildable walls (`terrain.ts`)

- `DEFAULTS.buildableRadius` 2 → 3 (wider buildable band around paths).
- `DEFAULTS.mountainFraction` 0.18 → 0.07 (sparse interior mountain scatter).
- Alt-path ridge cells are still forced `blocked` until opened, independent of
  the scatter. Generation stays pure/deterministic.

## C. Maze-size slider (badge panel)

- New **"Setup"** tab in the modal containing a range slider: **120–320 cells,
  step 10, default 210**, with a live value readout.
- Overlay exposes an `onBoardSize(n)` handler; `main.ts` holds a `boardSize`
  variable replacing the two hardcoded `210`s in `startAttract` / `newPlayBoard`
  (and attract regeneration).
- Applies **on release** (`change` event): if `mode === 'attract'`, regenerate
  the demo board immediately; if a run is active, it takes effect on the next
  Regenerate / new run — a hint line states this. Never regenerates mid-run.

## D. Multi-path at waves 6 & 9

- `terrain.ts` computes up to two alternates after the main path:
  - alt-0: `bfsPath(spawn, base, avoid = main interior)`
  - alt-1: `bfsPath(spawn, base, avoid = main ∪ alt-0 interior)`
  - Each kept only if length ≥ 4 (a real distinct corridor); otherwise skipped
    (best-effort — small boards may yield 0 or 1). Interiors forced `blocked`.
- `game.ts`: remove `OPEN_PATH_AFTER_WAVE = 8`. After wave 6 clears → open
  `alt[0]`; after wave 9 clears → open `alt[1]`. Callback `onOpenPath(index)`
  (no-op if that alt doesn't exist).
- `scene.ts`: generalize `path2Open`/`path2Points` into
  `openAltPaths: THREE.Vector3[][]`. `openPath(index)` runs the existing reveal
  animation on that alt's interior, then pushes its world points. `spawnEnemy`
  picks a route uniformly among `[mainPath, ...openAltPaths]`.

## E. Continue / loop mode (`game.ts` + overlay + `main.ts`)

- Clearing wave 12 shows **VICTORY** with a new **"Continue →"** button next to
  Play again / Rules.
- `Game` gains `loop` (1-based). `continueRun()`: `loop++`; refill lives to
  `START_LIVES`; **keep gold and all placed towers**; restart the 12-wave
  sequence on the same board (`waveIndex = -1`, `status = 'ready'`, short
  countdown).
- Effective enemy HP = `HP_SCALE[waveIndex] × LOOP_HP_MULT^(loop-1)`, with
  `LOOP_HP_MULT = 1.6` (tunable). Difficulty scaling is HP-only (YAGNI on
  speed/count for now).
- `HudState` gains `loop`; HUD shows it (e.g. `W 3/12 · L2`). Alternates opened
  in loop 1 stay open in later loops (harder start).
- `overlay.showResult(won)` renders Continue only when `won`; `main` wires
  `onContinue → game.continueRun()` + `overlay.hideResult()`.

## Testing

- `terrain.ts` alt-path generation is pure → unit tests in `board.test.ts`:
  determinism, alt distinctness from main, skip-when-impossible (no throw),
  `altPaths.length ≤ 2`.
- Build + headless-Chrome screenshots for the slider, opened paths, and the
  Continue button (as used earlier this session).

## Non-goals

- No enemy speed/count scaling per loop (HP only).
- No persistence of board-size preference across reloads.
- No more than two alternate routes.
