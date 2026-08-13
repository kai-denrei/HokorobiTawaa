# Dev Log

Newest first. Surfaced in-app via the version badge → Dev Log tab.

## 2026-08-13 — Enemy overhaul: bestiary, behaviours, colour schema

- Towers renamed to functions (Single Shot, AoE, Rapid, Homing, Sniper, Spread,
  Slow, Laser) and cool-shifted (white/cyan/ice/teal/azure) so enemies own the
  warm threat hues.
- Colour schema: hue = class (yellow=fast, green=heal, blue=aura, red=danger,
  orange=epic, purple=epic-rare), brightness = rank, size + dot-count = tier/HP
  (density still tracks live HP). Dual-code via a sprinkled secondary tint
  (vertex colours) — e.g. Drifter yellow+blue, Prime purple+pink.
- New shapes: Slime, Sea Mine (spiked), UFO (saucer). New animations: Wave &
  Twist (per-point geometry rewrite) + Jelly (squash/stretch).
- 12-enemy roster (agile→normal→tanky→epic→boss) with behaviours: erratic
  (RNG speed bursts), accelerate-when-hit, slow-when-hit, heal-when-not-hit,
  and a Blue-aura that speed-boosts nearby enemies (scene proximity pass).
- Reworked to 8 waves introducing the behaviours in turn.

## 2026-08-13 — Radial menu, range viz, role colours, Pyramid slow tower

- **Radial menu**: tapping a buildable cell opens a ring of options at the tap
  (mobile-friendly) instead of the bottom sheet — towers to place on an empty
  cell, Upgrade/Sell on an existing one. Each option shows a role-colour dot +
  cost; unaffordable dimmed.
- **Range viz**: a ground ring shows the effective range on placement preview
  (updates as options are focused) and when selecting an existing tower.
- **Role colour coding** (tower body + projectiles): white = single/sniper
  (Pine, Spiral, Teardrop), orange = mortar (Gear), teal = spread (SONGS),
  green = laser (DNA), red = homing (Double Spiral), purple = slow (Pyramid).
- **Pyramid** tower (new shape) with a `slow` attack: purple rounds that apply a
  speed debuff (enemies get a slow timer/factor honoured in movement).

## 2026-08-13 — Heart health meter at the exit + hurt effect

- The base/exit cell is now marked by a big 3D halftone **Heart** (replaces the
  teal hexagon), rendered as THREE.Points, **breathing** green to show health;
  dot density = lives/maxLives.
- On every arrival at the base it snaps to the **Wave** treatment and flashes
  **red with an explosion pulse** (dots scatter outward), then settles back —
  the requested "hurt" feedback, now at the point you're defending.
- src/units/heart.ts (pure shape + breathe/wave) + src/render/heart-base.ts (the
  3D meter, updated in the render loop). Driven by view.setBaseLives / hitBase
  from the game; numeric ♥ stays in the HUD. (Old DOM heart widget removed.)
- Removed the treatments' Y-spin and angled the heart to face the camera
  (lookAt) so its silhouette reads clearly as a ❤ instead of spinning edge-on.

## 2026-08-13 — Damage-type visual identity

- Projectiles now render via a per-vertex size+colour shader, so each tower has
  its own look: colour, size, and dotted tracer trails.
- Gear mortar → big amber shell + expanding shockwave ring + debris burst on
  impact (heavier splash). Teardrop → fast tight white sniper round with a long
  tracer. DNA → violet laser lance that extends past the target + impact halo.
  Spiral/Double Spiral get tracers; SONGS gets a muzzle flash.
- Particle sparks: muzzle flashes, hit sparks, mortar debris, and enemy death
  poofs (the enemy's dot cloud scatters in its own colour on death).
- New spark projectile kind (decorative, no collision) + shockwave-ring effects.

## 2026-08-13 — Economy + damage scaling

- Gold economy (geoDefense model): start 120, income from kills only, bounty ×
  kill-streak multiplier (`min(5, 1+0.05×streak)`, resets on any leak). HUD shows
  gold + live ×multiplier.
- Towers cost gold; palette shows costs and greys out unaffordable ones. Tap a
  placed tower → Upgrade/Sell sheet: 2 tiers (0.7×/1.2× place cost) boosting
  damage/range/rate (+ a tier-2 signature per attack type); sell refunds 75% of
  total spent. Combat now uses per-tower effective stats; towers grow per tier.
- Re-tuned enemy HP/bounty + per-wave HP scaler [1.0…1.75]; redesigned the 6
  waves (spikes + boss). Design spec: docs/superpowers/specs/2026-08-13-economy-scaling-design.md.
- Verified: buy 120→80, upgrade →52, sell →103 (75% refund), kill income raised
  gold + multiplier, unaffordable towers locked. 0 errors.

## 2026-08-12 — Published

- Live: **https://kai-denrei.github.io/HokorobiTawaa/** (GitHub Pages, auto-deploy
  on push to main via `.github/workflows/pages.yml`).
- Repo: https://github.com/kai-denrei/HokorobiTawaa (public).
- Demo towers now placed dispersed evenly along the whole path.

## 2026-08-12 — Attract mode + PLAY

- On load the game now boots into an **attract demo**: one of each tower is
  auto-placed along the path and random enemies spawn on a timer, so towers fire
  and the whole capability set is on display. Leaks don't cost lives in the demo.
- A translucent title screen (name + tagline + big **PLAY** button) sits over
  the running demo. PLAY clears the demo units and starts the real game on the
  current board (countdown → waves). Tower placement is disabled during attract.
- App now has a `mode` ('attract' | 'play'); onTick routes to the demo spawner
  or the wave game accordingly. Regenerate is mode-aware.
- Next: economy/currency and thought-through damage scaling.

## 2026-08-12 — Varied attack patterns (projectiles)

- Towers no longer all hitscan. Each has an `attack` type + a pooled projectile
  system (single THREE.Points cloud, per-vertex colour, drawRange):
  - single — straight bullet (Pine Tree, Spiral rapid-fire)
  - spread — N-pellet fan (SONGS Domes)
  - homing — steers toward the moving target (Double Spiral, DNA)
  - mortar — ballistic arc under gravity, splash damage on impact (Gear)
  - beam — instant hitscan line (Teardrop sniper)
- Projectiles travel, detect proximity hits, apply damage (mortar = AoE within
  splash radius), and expire on TTL. Cleared on regenerate.
- Verified headless: bullet streams/arcs in flight, enemies take damage, 0 errors.

## 2026-08-12 — Core loop: lives, waves, timers, win/lose

- Enemies now walk the path ONCE (no looping); reaching the base sets reachedEnd.
  The scene culls leaked + killed enemies each frame and fires onLeak/onKill/onTick.
- New `src/game/game.ts`: 15-life pool, 6 escalating waves (two spike waves +
  a boss wave) spawned on per-group timers, an 8s pre-wave countdown and 6s
  between-wave countdown. Win = all waves cleared; lose = lives hit 0.
- HUD (top-centre): ♥ lives · WAVE x/N · countdown/status (lives turn red ≤3).
- Centred VICTORY / GAME OVER screen with "Play again" (regenerate).
- Verified headless: countdown → wave 1 spawns → towers fire; 15 leaks →
  GAME OVER screen. Board tests still green.

## 2026-08-12 — First combat (towers fire, enemies take damage)

- Enemies now have distinct colours: Butterfly cyan, Breathing Cloud violet,
  Torus Knot red, Nautilus Shell gold, Wave Ghost pink.
- Towers gained range / fire-rate / damage; enemies gained HP. Each frame every
  tower acquires the nearest live enemy within range and fires on cooldown,
  drawing a brief additive bolt to the target.
- Damage thins the enemy's dot cloud (HP-as-density, via a pre-shuffled point
  buffer + drawRange) and the enemy is removed at 0 HP. Tanky types (Cloud 130,
  Knot 220) visibly outlast swarm types (Butterfly 24).
- Enemy spawns are staggered along the path so they march as a column.
- Dev hook `__hk.spawnGauntlet()` lines the path with towers for testing.
- Still a first pass: single-target only (no AoE/slow/lightning specialisation),
  no economy/lives/waves yet.

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
