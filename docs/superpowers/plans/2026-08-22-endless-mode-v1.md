# Endless Mode v1 (Concentric Siege) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate **Endless** mode where you defend the Heart at the centre of a large board that unravels outward — start tight on one approach, and every 5 waves a new sector tears open until the Heart is besieged from all sides; run forever, score by depth.

**Architecture:** Reuse the existing pure board mesh (`generateCells`) with a **new terrain-typing pass** (`typeCentralSiege`) that puts the base at the centroid and rim spawns around it (distinct BFS routes, exactly like `typeTerrain`'s alt-paths). Reuse `openPath`/`openAltPaths` for the tear-open reveal and the existing camera tween system for the pull-back. Endless waves are generated procedurally past wave 12. The Campaign is untouched.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Three.js 0.169, Vite 6, Vitest 3. Board + game logic are PURE (no DOM/THREE). Rendering in `src/render`, UI in `src/ui`.

## Global Constraints

- **Determinism:** `src/board/*` and the wave generator are pure and deterministic — same inputs → identical output. Use `mulberry32` for any randomness, seeded from the board seed.
- **`noUncheckedIndexedAccess` is on:** every array/Map index access that you know is present needs a `!` (see existing code, e.g. `cells.get(id)!`).
- **Campaign untouched:** do not modify `typeTerrain`, `buildWaves`, or the existing `startPlay` path's behavior. Endless is additive.
- **Reuse, don't reinvent:** the reveal uses the existing `openPath(index)` + `openAltPaths`; the camera uses the existing `applyPose`/tween. No new geometry-growth system, no fog-of-war (v1).
- **Verification per task:** `npx tsc --noEmit` clean, `npx vitest run` green, and for integration tasks a headless-Chrome CDP smoke (pattern: launch `/Applications/Google Chrome.app` headless with `--use-angle=swiftshader`, connect via `WebSocket` to `/json`, drive `window.__hk`). Dev server: `npm run dev` (currently on port 5174).
- **Scope:** core-only v1. Do NOT build bosses, affixes, tower caps, early-call, upgrade-delay, targeting priority, meta-progression, or true board growth.

---

## File Structure

- **Create** `src/board/terrain-central.ts` — `typeCentralSiege` pass (pure). One responsibility: type a cell map into a central-siege Board with sectors.
- **Create** `src/board/terrain-central.test.ts` — unit tests for the pass.
- **Modify** `src/board/types.ts` — add `Sector` type + optional `sectors` on `Board`.
- **Modify** `src/board/index.ts` — export `typeCentralSiege`, `Sector`, and `generateEndlessBoard`.
- **Create** `src/game/endless.ts` — pure `endlessWave` generator + `endlessHpScale`.
- **Create** `src/game/endless.test.ts` — unit tests.
- **Modify** `src/game/game.ts` — endless mode (no-win, procedural waves past 12, `onFraying` cadence, depth score). Export `SpawnGroup`.
- **Modify** `src/render/camera-views.ts` — pure `revealPose(revealedCount, totalSectors, firstDir)` helper.
- **Modify** `src/render/camera-views.test.ts` — test `revealPose`.
- **Modify** `src/render/scene.ts` — sectored `setBoard` (only sector 0 active) + `revealSector(i)` (openPath + camera pull-back).
- **Modify** `src/ui/overlay/types.ts` — `OverlayHandlers.onEndless`; result "reached wave".
- **Modify** `src/ui/overlay/screens.ts` — Endless title button; result depth line.
- **Modify** `src/ui/overlay.ts` — wire `onEndless`.
- **Modify** `src/main.ts` — `startEndless()`, `'endless'` mode, fraying → `view.revealSector`.

---

## Task 1: Central-siege board generation (pure)

**Files:**
- Create: `src/board/terrain-central.ts`
- Create: `src/board/terrain-central.test.ts`
- Modify: `src/board/types.ts` (add `Sector`, `Board.sectors`)
- Modify: `src/board/index.ts` (exports + `generateEndlessBoard`)

**Interfaces:**
- Consumes: `generateCells(seed, targetCells)`, `bfsPath(cells, from, to, avoid?)`, `cellsWithin(cells, id, radius)`, `mulberry32(seed)` (all from `src/board`).
- Produces:
  - `type Sector = { spawn: CellId; route: CellId[] }`
  - `Board.sectors?: Sector[]` (reveal order; sector 0 = active start; 1+ start closed)
  - `typeCentralSiege(cells: Map<CellId, Cell>, seed: number, params?: { spawnCount?: number; buildableRadius?: number; mountainFraction?: number }): Board`
  - `generateEndlessBoard(seed: number, params?: { targetCells?: number; spawnCount?: number }): Board`

- [ ] **Step 1: Add the `Sector` type and `Board.sectors` field**

In `src/board/types.ts`, add after the `Board` type's `altPaths` field doc, inside the `Board` type:

```typescript
  /** Central-siege sectors (Endless mode) in reveal order: sector 0 is the
   * active starting approach; 1+ start closed (interiors 'blocked') and are
   * opened one per fraying milestone. Undefined for Campaign (linear) boards. */
  sectors?: Sector[];
```

And add this exported type above `Board`:

```typescript
/** One rim approach in a central-siege board: a spawn and its route to the base. */
export type Sector = { spawn: CellId; route: CellId[] };
```

- [ ] **Step 2: Write the failing test**

Create `src/board/terrain-central.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateCells } from './generate';
import { typeCentralSiege } from './terrain-central';
import type { CellId } from './types';

function centralBoard(seed: number, spawnCount = 6) {
  const cells = generateCells(seed, 300);
  return typeCentralSiege(cells, seed, { spawnCount });
}

describe('typeCentralSiege', () => {
  it('puts the base at the centre-most cell', () => {
    const b = centralBoard(1);
    const baseCell = b.cells.get(b.base)!;
    const dBase = Math.hypot(baseCell.center[0] - 0.5, baseCell.center[1] - 0.5);
    for (const c of b.cells.values()) {
      const d = Math.hypot(c.center[0] - 0.5, c.center[1] - 0.5);
      expect(dBase).toBeLessThanOrEqual(d + 1e-9);
    }
  });

  it('produces sectors, each with a route from its spawn to the base', () => {
    const b = centralBoard(2);
    expect(b.sectors!.length).toBeGreaterThanOrEqual(3);
    for (const s of b.sectors!) {
      expect(s.route[0]).toBe(s.spawn);
      expect(s.route[s.route.length - 1]).toBe(b.base);
      expect(s.route.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('exposes sector 0 as the active main path; 1+ as closed altPaths', () => {
    const b = centralBoard(3);
    expect(b.path).toEqual(b.sectors![0]!.route);
    expect(b.altPaths.length).toBe(b.sectors!.length - 1);
    // closed sectors' interiors are blocked terrain
    for (let i = 1; i < b.sectors!.length; i++) {
      for (const id of b.sectors![i]!.route.slice(1, -1)) {
        expect(['blocked', 'path']).toContain(b.cells.get(id)!.terrain);
      }
    }
  });

  it('spreads spawns around the rim (distinct, away from centre)', () => {
    const b = centralBoard(4);
    const spawns = b.sectors!.map((s) => s.spawn);
    expect(new Set(spawns).size).toBe(spawns.length); // all distinct
    for (const id of spawns) {
      const c = b.cells.get(id)!;
      expect(Math.hypot(c.center[0] - 0.5, c.center[1] - 0.5)).toBeGreaterThan(0.15);
    }
  });

  it('is deterministic', () => {
    const a = centralBoard(7);
    const b = centralBoard(7);
    expect(a.sectors!.map((s) => s.route)).toEqual(b.sectors!.map((s) => s.route));
  });

  it('is best-effort: high spawnCount never throws, just yields fewer', () => {
    expect(() => centralBoard(9, 12)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/board/terrain-central.test.ts`
Expected: FAIL — `typeCentralSiege` is not defined / module missing.

- [ ] **Step 4: Implement `typeCentralSiege`**

Create `src/board/terrain-central.ts`:

```typescript
// terrain-central.ts — central-siege terrain pass (Endless mode). PURE.
// Base at the board centroid; up to `spawnCount` rim spawns spread by angle,
// each with a distinct BFS route to the base (accumulating `avoid`, exactly like
// typeTerrain's alt-paths). Sector 0 is the active start; 1+ start closed
// (interiors 'blocked') and open one per fraying milestone via openPath.

import type { Board, Cell, CellId, Sector } from './types';
import { bfsPath, cellsWithin } from './geometry';
import { mulberry32 } from './rng';

export type CentralParams = {
  spawnCount?: number;
  buildableRadius?: number;
  mountainFraction?: number;
};

const DEFAULTS: Required<CentralParams> = {
  spawnCount: 6,
  buildableRadius: 3,
  mountainFraction: 0.07,
};

export function typeCentralSiege(
  cells: Map<CellId, Cell>,
  seed: number,
  params: CentralParams = {},
): Board {
  const { spawnCount, buildableRadius, mountainFraction } = { ...DEFAULTS, ...params };
  if (cells.size < 8) throw new Error('typeCentralSiege: board too small (need >= 8 cells)');
  const rng = mulberry32((seed ^ 0x85ebca6b) >>> 0);

  // base = cell nearest the board centroid (0.5, 0.5)
  let base = -1;
  let bestD = Infinity;
  for (const c of cells.values()) {
    const d = (c.center[0] - 0.5) ** 2 + (c.center[1] - 0.5) ** 2;
    if (d < bestD) { bestD = d; base = c.id; }
  }

  // one candidate spawn per angular bucket: the rim-most cell in that wedge
  const buckets: { id: CellId; r: number }[][] = Array.from({ length: spawnCount }, () => []);
  for (const c of cells.values()) {
    if (c.id === base) continue;
    const dx = c.center[0] - 0.5;
    const dy = c.center[1] - 0.5;
    let ang = Math.atan2(dy, dx);
    if (ang < 0) ang += Math.PI * 2;
    const bkt = Math.min(spawnCount - 1, Math.floor((ang / (Math.PI * 2)) * spawnCount));
    buckets[bkt]!.push({ id: c.id, r: Math.hypot(dx, dy) });
  }
  const candidates: CellId[] = [];
  for (const bucket of buckets) {
    if (!bucket.length) continue;
    bucket.sort((a, b) => b.r - a.r || a.id - b.id);
    candidates.push(bucket[0]!.id);
  }

  // distinct BFS routes spawn->base (accumulating avoid, like typeTerrain alts)
  const sectors: Sector[] = [];
  const avoid = new Set<CellId>();
  for (const spawn of candidates) {
    const route = bfsPath(cells, spawn, base, avoid);
    if (!route || route.length < 3) continue;
    sectors.push({ spawn, route });
    for (const id of route.slice(1, -1)) avoid.add(id);
  }
  if (sectors.length === 0) throw new Error('typeCentralSiege: no spawn route to base');

  // paint terrain: default blocked, buildable band around ALL routes, then paths
  const mainRoute = sectors[0]!.route;
  const pathSet = new Set(mainRoute);
  const buildableSet = new Set<CellId>();
  for (const s of sectors) {
    for (const p of s.route) {
      for (const c of cellsWithin(cells, p, buildableRadius)) {
        if (!pathSet.has(c)) buildableSet.add(c);
      }
    }
  }
  for (const cell of cells.values()) cell.terrain = 'blocked';
  for (const id of buildableSet) cells.get(id)!.terrain = 'buildable';
  for (const id of pathSet) cells.get(id)!.terrain = 'path';

  // mountain scatter (deterministic, id-sorted)
  for (const id of [...buildableSet].sort((a, b) => a - b)) {
    if (rng() < mountainFraction) cells.get(id)!.terrain = 'blocked';
  }

  // sectors 1+ start CLOSED: interiors blocked; exposed as altPaths for openPath
  const altPaths: CellId[][] = [];
  for (let i = 1; i < sectors.length; i++) {
    for (const id of sectors[i]!.route.slice(1, -1)) cells.get(id)!.terrain = 'blocked';
    altPaths.push(sectors[i]!.route);
  }

  // spawn/base overwrite endpoints
  for (const s of sectors) cells.get(s.spawn)!.terrain = 'spawn';
  cells.get(base)!.terrain = 'base';

  return { cells, seed, spawns: sectors.map((s) => s.spawn), base, path: mainRoute, altPaths, sectors };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/board/terrain-central.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Export from the board barrel + add `generateEndlessBoard`**

In `src/board/index.ts`, add after the `typeTerrain` exports:

```typescript
export { typeCentralSiege } from './terrain-central';
export type { CentralParams } from './terrain-central';
```

Add `Sector` to the type re-export line (`export type { Board, Cell, CellId, TerrainKey, Vec2, Sector } from './types';`), then add this function after `generateBoard`:

```typescript
/** Central-siege board for Endless mode: heart at centre, rim spawns, sectors. */
export function generateEndlessBoard(
  seed: number,
  params: { targetCells?: number; spawnCount?: number } = {},
): Board {
  const { targetCells = 300, spawnCount = 6 } = params;
  const cells = generateCells(seed, targetCells);
  return typeCentralSiege(cells, seed, { spawnCount });
}
```

Add the import at the top: `import { typeCentralSiege } from './terrain-central';`

- [ ] **Step 7: Verify + commit**

Run: `npx tsc --noEmit` (clean) and `npx vitest run src/board` (green).

```bash
git add src/board/terrain-central.ts src/board/terrain-central.test.ts src/board/types.ts src/board/index.ts
git commit -m "feat(board): central-siege terrain pass for Endless mode"
```

---

## Task 2: Endless wave generator (pure)

**Files:**
- Create: `src/game/endless.ts`
- Create: `src/game/endless.test.ts`
- Modify: `src/game/game.ts` (export `SpawnGroup`)

**Interfaces:**
- Consumes: `SpawnGroup` type from `game.ts`.
- Produces:
  - `endlessWave(waveIndex: number, enemyKeys: string[]): SpawnGroup[]` — composition for a 0-based `waveIndex` (used for indices ≥ 12, i.e. wave 13+).
  - `endlessHpScale(waveIndex: number): number` — continuing HP multiplier for wave 13+.

- [ ] **Step 1: Export `SpawnGroup` from game.ts**

In `src/game/game.ts`, change `type SpawnGroup = ...` to `export type SpawnGroup = { key: string; count: number; interval: number };`

- [ ] **Step 2: Write the failing test**

Create `src/game/endless.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { endlessWave, endlessHpScale } from './endless';

const KEYS = ['butterfly', 'ghost', 'scoutufo', 'gslime', 'shell', 'barbed'];

describe('endlessWave', () => {
  it('draws only from the provided enemy keys', () => {
    const groups = endlessWave(15, KEYS);
    for (const g of groups) expect(KEYS).toContain(g.key);
  });

  it('grows total enemy count with depth', () => {
    const total = (w: number) => endlessWave(w, KEYS).reduce((n, g) => n + g.count, 0);
    expect(total(20)).toBeGreaterThan(total(13));
    expect(total(40)).toBeGreaterThan(total(20));
  });

  it('adds variety (more distinct groups) as it deepens', () => {
    const variety = (w: number) => new Set(endlessWave(w, KEYS).map((g) => g.key)).size;
    expect(variety(30)).toBeGreaterThanOrEqual(variety(13));
  });

  it('is deterministic', () => {
    expect(endlessWave(25, KEYS)).toEqual(endlessWave(25, KEYS));
  });

  it('endlessHpScale increases monotonically past wave 12', () => {
    expect(endlessHpScale(20)).toBeGreaterThan(endlessHpScale(13));
    expect(endlessHpScale(13)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/game/endless.test.ts`
Expected: FAIL — module/functions not defined.

- [ ] **Step 4: Implement the generator**

Create `src/game/endless.ts`:

```typescript
// endless.ts — procedural wave composition for Endless mode (wave 13+). PURE +
// deterministic: no RNG, derived purely from the wave index so the same depth
// always produces the same wave. Escalates total count, variety, and tempo.

import type { SpawnGroup } from './game';

/** Composition for a 0-based `waveIndex` (call for indices >= 12 → wave 13+). */
export function endlessWave(waveIndex: number, enemyKeys: string[]): SpawnGroup[] {
  const depth = Math.max(0, waveIndex - 11); // 1 at wave 13, 2 at 14, ...
  // total budget grows ~linearly; variety grows slowly (up to all keys)
  const budget = 14 + depth * 4;
  const variety = Math.min(enemyKeys.length, 2 + Math.floor(depth / 2));
  // pick `variety` keys, rotating by depth so successive waves feel different
  const picks: string[] = [];
  for (let i = 0; i < variety; i++) picks.push(enemyKeys[(depth + i) % enemyKeys.length]!);

  const per = Math.max(3, Math.floor(budget / variety));
  const interval = Math.max(0.3, 0.75 - depth * 0.015); // spawns speed up with depth
  return picks.map((key) => ({ key, count: per, interval }));
}

/** Continuing HP multiplier for Endless waves past 12 (gentle, compounding). */
export function endlessHpScale(waveIndex: number): number {
  const depth = Math.max(0, waveIndex - 11);
  return 3.0 * 1.08 ** depth; // starts where HP_SCALE[11]=3.0 leaves off
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/game/endless.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/game/endless.ts src/game/endless.test.ts src/game/game.ts
git commit -m "feat(game): procedural endless wave generator"
```

---

## Task 3: Reveal-camera pose helper (pure)

**Files:**
- Modify: `src/render/camera-views.ts`
- Modify: `src/render/camera-views.test.ts`

**Interfaces:**
- Consumes: `Pose`, `Vec3` types from `camera-views.ts`.
- Produces: `revealPose(revealed: number, total: number, firstDir: Vec3): Pose` — camera pose for the reveal progression. `revealed` = sectors shown so far (≥1); at `revealed===1` the camera is low and pushed toward `firstDir` (framing sector 0); at `revealed>=total` it is high, centred overhead. Looks at world origin (the Heart sits at board centre ≈ origin).

- [ ] **Step 1: Write the failing test**

Add to `src/render/camera-views.test.ts` (and add `revealPose` to the import from `./camera-views`):

```typescript
describe('revealPose', () => {
  const dir: Vec3 = [0, 0, 1];
  it('starts low and offset toward the first sector', () => {
    const p = revealPose(1, 6, dir);
    expect(p.position[1]).toBeLessThan(1.6); // low-ish at the start
    expect(p.target[0]).toBeCloseTo(0, 6);
    expect(p.target[2]).toBeCloseTo(0, 6); // looks at the centre (Heart)
    expect(Math.sign(p.position[2])).toBe(1); // pushed toward +z (firstDir side)
  });
  it('pulls back (higher) as more sectors reveal', () => {
    expect(revealPose(6, 6, dir).position[1]).toBeGreaterThan(revealPose(1, 6, dir).position[1]);
  });
  it('ends high and centred overhead', () => {
    const p = revealPose(6, 6, dir);
    expect(p.position[1]).toBeGreaterThan(2.0);
    expect(Math.hypot(p.position[0], p.position[2])).toBeLessThan(0.6); // near-centred
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/camera-views.test.ts`
Expected: FAIL — `revealPose` not exported.

- [ ] **Step 3: Implement `revealPose`**

Add to `src/render/camera-views.ts` (after `trenchPose`):

```typescript
// Endless reveal: camera pulls up/back over the centre (the Heart) as sectors
// reveal. Early it sits low and offset toward the first sector so that approach
// fills the frame; late it is a high, centred overhead of the whole board.
const REVEAL_Y_NEAR = 1.15;
const REVEAL_Y_FAR = 2.5;
const REVEAL_OFFSET_NEAR = 0.9; // how far the camera is pushed toward firstDir early
const REVEAL_FOV = 46;

/** Camera pose for the reveal progression. `revealed` >= 1; `firstDir` is the
 * unit XZ direction from centre to sector 0's spawn. */
export function revealPose(revealed: number, total: number, firstDir: Vec3): Pose {
  const t = total <= 1 ? 1 : Math.min(1, (revealed - 1) / (total - 1)); // 0 at first, 1 when all shown
  const y = REVEAL_Y_NEAR + (REVEAL_Y_FAR - REVEAL_Y_NEAR) * t;
  const offset = REVEAL_OFFSET_NEAR * (1 - t); // shrinks to 0 (centred) as it pulls back
  return {
    position: [firstDir[0] * offset, y, firstDir[2] * offset],
    target: [0, 0, 0],
    fov: REVEAL_FOV,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/camera-views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/camera-views.ts src/render/camera-views.test.ts
git commit -m "feat(render): reveal-camera pose helper for Endless"
```

---

## Task 4: Sectored board + `revealSector` in the scene

**Files:**
- Modify: `src/render/scene.ts`

**Interfaces:**
- Consumes: `Board.sectors`, `revealPose` (Task 3), existing `openPath(index)`, `applyPose`, `toWorld`.
- Produces:
  - `BoardView.revealSector(sectorIndex: number): void` — opens sector `sectorIndex` (≥1) via `openPath(sectorIndex - 1)` and tweens the camera to `revealPose(sectorIndex + 1, totalSectors, firstDir)`.
  - `BoardView` sets the reveal camera to `revealPose(1, total, firstDir)` in `setBoard` when the board has `sectors`.

- [ ] **Step 1: Add reveal state + initial framing in `setBoard`**

In `scene.ts`, add a private field near `camTween`:

```typescript
  /** Central-siege reveal state (Endless): total sectors + first-sector dir. */
  private revealTotal = 0;
  private revealFirstDir: Vec3 = [0, 0, 1];
```

At the end of `setBoard(board)`, after the heart is created, add:

```typescript
    // Endless central-siege board: frame tight on sector 0's approach.
    if (board.sectors && board.sectors.length) {
      this.revealTotal = board.sectors.length;
      const s0 = board.cells.get(board.sectors[0]!.spawn)!;
      const w = toWorld(s0.center); // spawn world pos; dir from centre (~origin) to it
      const len = Math.hypot(w[0], w[2]) || 1;
      this.revealFirstDir = [w[0] / len, 0, w[2] / len];
      this.camTween = null;
      this.applyPose(revealPose(1, this.revealTotal, this.revealFirstDir));
    }
```

Add `revealPose` to the `camera-views` import.

- [ ] **Step 2: Add `revealSector`**

Add this public method to `BoardView` (near `setView`):

```typescript
  /** Endless fraying: open sector `i` (>=1) and pull the camera back to reveal it. */
  revealSector(i: number): void {
    if (i < 1 || i > this.revealTotal - 1) return;
    this.openPath(i - 1); // sectors 1+ map onto altPaths[0..] (tear-open animation)
    this.camTween = {
      from: this.currentPose(),
      to: revealPose(i + 1, this.revealTotal, this.revealFirstDir),
      t: 0,
      dur: 1.6,
    };
    this.dynamicView = null;
  }
```

- [ ] **Step 3: Verify build + headless smoke**

Run: `npx tsc --noEmit` (clean), `npx vite build` (ok).

Create `/private/tmp/.../scratchpad/verify-t4.mjs` (adapt the existing CDP harness): load the dev app, then in-page:
```javascript
// expose an endless board for testing via the existing __hk hook is not present;
// instead drive through main once Task 6 lands. For now assert the API exists:
window.__hk.view.setBoard(/* an endless board built in-page is not available */);
```
Because `generateEndlessBoard` isn't wired to `__hk` yet, defer the full headless check to Task 6. For this task, verify only: `tsc` clean, `vite build` clean, and add a temporary console assertion — OR proceed and rely on Task 6's end-to-end smoke. (Do not add throwaway `__hk` surface here.)

- [ ] **Step 4: Commit**

```bash
git add src/render/scene.ts
git commit -m "feat(render): sectored setBoard framing + revealSector for Endless"
```

---

## Task 5: Endless game loop

**Files:**
- Modify: `src/game/game.ts`

**Interfaces:**
- Consumes: `endlessWave`, `endlessHpScale` (Task 2); `GameCallbacks` gains `onFraying`.
- Produces:
  - `Game.startEndless(enemyKeys: string[]): void` — begin an endless run (loop never wins).
  - `GameCallbacks.onFraying?: (sectorIndex: number) => void` — fired when it's time to reveal sector `sectorIndex` (≥1).
  - Depth score = deepest wave reached; result status is always `'lost'` (Endless has no win).

- [ ] **Step 1: Add endless state + callback**

In `src/game/game.ts`:
- Add to `GameCallbacks`:
```typescript
  /** Endless: reveal the next sector (>=1) at a fraying milestone. */
  onFraying?: (sectorIndex: number) => void;
```
- Add private fields: `private endless = false;` and `private enemyKeys: string[] = [];`
- Import at top: `import { endlessWave, endlessHpScale } from './endless';`

- [ ] **Step 2: Add `startEndless`**

```typescript
  /** Begin an Endless run: authored waves 1-12 as the ramp, procedural after,
   * never wins (result only on lives-out). `enemyKeys` seeds procedural waves. */
  startEndless(enemyKeys: string[]): void {
    this.reset();
    this.endless = true;
    this.enemyKeys = enemyKeys;
  }
```
In `reset()`, add `this.endless = false;` (so Campaign reset clears it).

- [ ] **Step 3: Endless wave sourcing + no-win + fraying**

In `startNextWave()`, after `this.waveIndex++;`, add (before the `status = 'active'` line is fine):

```typescript
    // Endless: past the 12 authored waves, generate composition procedurally.
    if (this.endless && this.waveIndex >= this.waves.length) {
      this.waves[this.waveIndex] = endlessWave(this.waveIndex, this.enemyKeys);
    }
    // Fraying cadence: every 5th wave reveals the next sector (1-based sector idx).
    if (this.endless && (this.waveIndex + 1) % 5 === 0) {
      this.cb.onFraying?.((this.waveIndex + 1) / 5);
    }
```

In the `tick()` "active" branch where it checks for win, change the win condition to skip winning in endless:

```typescript
      if (this.spawningDone && this.view.enemyCount === 0) {
        if (!this.endless && this.waveIndex >= this.waves.length - 1) {
          this.status = 'won';
          this.cb.onResult('won', this.runStats());
        } else {
          this.status = 'ready';
          this.countdown = BETWEEN_DELAY;
          // (Campaign) path-opening after waves 6/9 stays as-is below
          ...
        }
      }
```

In `stepSpawning`, use the endless HP curve past wave 12:

```typescript
      const hpBase = this.endless && this.waveIndex >= 12
        ? endlessHpScale(this.waveIndex)
        : (HP_SCALE[this.waveIndex] ?? 1);
      const hp = hpBase * LOOP_HP_MULT ** (this.loop - 1);
```

(Depth score: `runStats()` already returns `score`; the result screen will show `wave` from the last HUD — see Task 6. No change needed here beyond `status` staying non-'won'.)

- [ ] **Step 4: Write a focused unit test for the loop logic**

Create `src/game/game-endless.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Game } from './game';

// minimal fake BoardView: only what Game.tick touches
function fakeView() {
  return { enemyCount: 0, spawnEnemy: vi.fn(() => 'x') } as any;
}

describe('Game endless mode', () => {
  it('never reports a win and keeps advancing past wave 12', () => {
    const onResult = vi.fn();
    const onFraying = vi.fn();
    const g = new Game(fakeView(), { onHud: () => {}, onResult, onFraying });
    g.startEndless(['butterfly', 'ghost']);
    // fast-forward many waves: force each wave to "finish" instantly
    for (let i = 0; i < 20; i++) {
      // drive the ready->active->cleared cycle with large dt
      g.tick(100); // countdown elapses -> startNextWave
      g.tick(0.001); // active; enemyCount 0 + spawningDone -> next ready (no win)
    }
    expect(onResult).not.toHaveBeenCalledWith('won', expect.anything());
    expect(onFraying).toHaveBeenCalled(); // fired on a wave-5 milestone
  });
});
```

Note: if `stepSpawning` needs `enemyCount` to hit 0 to advance, the fake returns 0; adjust the fast-forward if the real cycle needs an extra tick. Run and iterate until green.

- [ ] **Step 5: Run tests + verify**

Run: `npx vitest run src/game` and `npx tsc --noEmit`. Green + clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/game.ts src/game/game-endless.test.ts
git commit -m "feat(game): endless loop — procedural waves, no-win, fraying cadence"
```

---

## Task 6: Mode wiring + UI + end-to-end smoke

**Files:**
- Modify: `src/ui/overlay/types.ts`, `src/ui/overlay/screens.ts`, `src/ui/overlay.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `generateEndlessBoard` (Task 1), `Game.startEndless` + `onFraying` (Task 5), `BoardView.revealSector` (Task 4).
- Produces: an **Endless** button on the title; `main.startEndless()`; result screen shows depth.

- [ ] **Step 1: Add the handler + title button**

In `src/ui/overlay/types.ts`, add to `OverlayHandlers`:
```typescript
  /** Start an Endless run. */
  onEndless: () => void;
```

In `src/ui/overlay/screens.ts` `createTitleScreen`, add an Endless button beside Play:
```typescript
  const endlessBtn = el('button', 'hk-play hk-play-endless', '∞ ENDLESS');
  endlessBtn.addEventListener('click', () => handlers.onEndless());
  titleInner.append(titleName, titleTag, playBtn, endlessBtn, titleDemo);
```
(remove `playBtn` from the old `append` line if it double-adds; keep one append.)

Add minimal CSS in `src/ui/styles.css` (reuse `.hk-play` look, smaller):
```css
.hk-play-endless { margin-top: 8px; font-size: 15px; opacity: 0.92; }
```

- [ ] **Step 2: Wire it through the overlay composer**

In `src/ui/overlay.ts`, the handlers object is passed straight to `createTitleScreen(handlers)` already — no change needed beyond ensuring `onEndless` is part of the `OverlayHandlers` the consumer supplies (Step 3).

- [ ] **Step 3: `startEndless` in main.ts**

In `src/main.ts`:
- Import: `generateEndlessBoard` from `./board`, and `ENEMIES` is already imported.
- Add to the `createOverlay(app, { ... })` handlers: `onEndless: () => startEndless(),`
- Add to the `Game` callbacks: `onFraying: (i) => view.revealSector(i),`
- Add the function:
```typescript
/** Endless mode: central-siege board, procedural waves, unravels over time. */
function startEndless(): void {
  mode = 'play'; // reuse the play input path (tap-to-build, game.tick)
  overlay.closePalette();
  overlay.hideResult();
  overlay.hideTitle();
  board = generateEndlessBoard(rand(), { targetCells: boardSize > 240 ? boardSize : 300 });
  view.setBoard(board); // sectored → frames tight on sector 0 (Task 4)
  view.highlightCell(null);
  setSeedInfo();
  overlay.setCellInfo('Endless — hold the Heart. It will come apart around you.');
  game.startEndless(ENEMIES.map((e) => e.key));
}
```
Note: `mode = 'play'` so `view.onTick` calls `game.tick` and taps place towers. The camera is driven by `revealSector`; the attract rotation does not run (mode !== 'attract').

- [ ] **Step 4: Result screen shows depth**

The result screen already shows the score line. In `src/ui/overlay/screens.ts` `createResultScreen`, the `show(won, stats)` sets a blurb; for Endless (`won === false` always) it already shows "The base was overrun. · Score N". Add the depth: main passes the reached wave via the existing HUD `wave` (already rendered in the HUD). No code change required for v1 — the HUD shows `W N/12`+ and the result shows score. (Optional polish deferred.)

- [ ] **Step 5: End-to-end headless smoke**

Create `scratchpad/verify-endless.mjs` (adapt the existing CDP harness). After boot:
```javascript
// click Endless on the title
document.querySelector('.hk-play-endless').click();
await sleep(400);
const out = { enemyCountStart: __hk.view.enemyCount, hasSectors: !!__hk.board.sectors, sectors: __hk.board.sectors?.length };
// only sector 0 active: exactly 1 spawn feeding enemies initially
// force a fraying reveal directly:
__hk.view.revealSector(1);
await sleep(1800);
out.afterReveal = 'ok';
return out;
```
Assert: `hasSectors === true`, `sectors >= 3`, `revealSector(1)` runs without error, camera pose changed (read `__hk.view.camera.position.y` before/after — it should increase as it pulls back). Capture a screenshot of the tight start and one after reveal; eyeball that the Heart is centred and a new approach opened.

- [ ] **Step 6: Full verification + commit**

Run: `npx tsc --noEmit` (clean), `npx vitest run` (all green), `npx vite build` (clean), and the headless smoke (PASS).

```bash
git add src/ui/overlay/types.ts src/ui/overlay/screens.ts src/ui/overlay.ts src/ui/styles.css src/main.ts
git commit -m "feat: wire Endless mode (title button, central board, fraying reveal)"
```

---

## Self-Review

**Spec coverage:**
- Mode entry / Endless button → Task 6. ✓
- Central-siege board (centroid base, rim spawns, sectors) → Task 1. ✓
- Reveal + fraying (openPath + camera pull-back, tight start) → Tasks 3 (pose), 4 (scene), 5 (cadence), 6 (wiring). ✓
- Procedural waves 13+ (reuse authored 1-12) → Task 2 + Task 5. ✓
- Depth score / no-win → Task 5 + Task 6 Step 4. ✓
- Reuse openPath/openAltPaths + camera tween → Tasks 4, 3. ✓
- Campaign untouched → additive only; `typeTerrain`/`buildWaves`/`startPlay` unmodified. ✓
- Deferred v2 items → not implemented (correct). ✓

**Type consistency:** `Sector` used consistently (board `sectors`, scene `revealTotal`/`revealSector`). `SpawnGroup` exported (Task 2 Step 1) and consumed by `endlessWave`. `revealPose(revealed, total, firstDir)` signature identical in Tasks 3 and 4. `onFraying(sectorIndex)` fired in Task 5, consumed in Task 6. `startEndless(enemyKeys)` defined Task 5, called Task 6.

**Known soft spots to resolve during execution (not placeholders — flagged):**
- Task 5 Step 3 shows the `tick()` win-branch edit as an excerpt; apply it to the real block (keep the existing wave-6/9 `PATH_OPENINGS` logic intact for Campaign).
- Task 5 Step 4's fake-view fast-forward may need one extra `tick` per wave depending on the exact ready→active→cleared cycle; iterate until the test is green.
- Task 4 headless verification is deferred into Task 6 (the `__hk` surface only exists through `main`); this is intentional, not a gap.
