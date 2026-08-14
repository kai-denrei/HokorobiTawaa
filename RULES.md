# HokorobiTawaa — Rules

## The game (target V1)

A mobile tower-defense game on a procedurally generated organic board.

- **Board.** Each level is a fresh procedural Stålberg mesh of irregular cells.
  Cells are typed: **spawn** (enemies enter), **base** (their goal — reaching
  it costs you a life), **path** (the fixed route between them), **buildable**
  (place towers here), **blocked** (mountains — impassable, not buildable).
- **Routes open over time.** Enemies always walk pre-computed routes; towers
  never block or reroute them. You start with one path — a **second opens after
  wave 6** and a **third after wave 9** (board permitting), so late waves attack
  on multiple fronts. Placement is about coverage, not maze-building.
- **Towers** (mechanical, static) are placed on buildable cells and attack
  enemies in range. Roles: basic single-shot, splash/AoE mortar, rapid,
  homing, **sniper** (heavy, slow, long-range round), **spread**, a **slow
  field** (lightning that tethers the tower to every enemy in range and slows
  them), and a lightning-beam capstone.
- **Enemies** (organic/aquatic, animated) walk from spawn to base in escalating
  waves — agile swarms, regenerators, aura-boosters, armored virions, and a
  boss. They vary in HP, speed, and payout.
- **Economy.** Kills pay currency by enemy type (tankier = more). A kill-streak
  multiplier grows while you don't leak and resets when an enemy reaches the
  base. Currency buys and upgrades towers.
- **Lives.** A fixed pool per level; the level ends at zero.

## Playing

- **Press PLAY** to start a run. Twelve escalating waves; clear them all to win.
- **Tap a buildable cell** to open the radial menu and place a tower; tap a
  placed tower to upgrade or sell it. **On PC**, with a tower selected, press
  **W** or **↑** to buy its next upgrade. See the **Towers** and **Enemies**
  tabs for each unit's sprite, role, and stats.
- **Continue.** Beating wave 12 offers **Continue →** — the same board with your
  towers and gold kept, lives refilled, and a fresh 12 waves at higher
  difficulty (enemy HP compounds each loop).
- **Setup tab** sets the maze size (cell count); it applies to the next board.
- **Regenerate** makes a new random board (new seed). Board layout is procedural
  and independent of wave difficulty.
- **Version badge** (top-right) confirms which build you're running and opens
  this panel and the Dev Log.

## Project rules

- No PII anywhere in code, comments, assets, or commits.
- Wireframe = board/terrain; dotted-halftone = actors (towers/enemies).
- Tilted camera only — never ground-level/first-person.
- Deterministic generation: the same seed always produces the same board.
