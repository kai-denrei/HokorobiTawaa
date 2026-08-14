# HokorobiTawaa — Rules

## The game (target V1)

A mobile tower-defense game on a procedurally generated organic board.

- **Board.** Each level is a fresh procedural Stålberg mesh of irregular cells.
  Cells are typed: **spawn** (enemies enter), **base** (their goal — reaching
  it costs you a life), **path** (the fixed route between them), **buildable**
  (place towers here), **blocked** (mountains — impassable, not buildable).
- **Path is fixed.** Enemies always walk the pre-computed route; towers never
  block or reroute them. Placement is about coverage, not maze-building.
- **Towers** (mechanical, static) are placed on buildable cells and attack
  enemies in range. Each has a role: basic, splash/AoE, single-target DPS,
  slow/debuff, sniper, support/buff, and a lightning-chain capstone.
- **Enemies** (organic/aquatic, animated) walk the path from spawn to base in
  escalating waves. Different enemy types vary in HP, speed, and payout.
- **Economy.** Kills pay currency by enemy type (tankier = more). A kill-streak
  multiplier grows while you don't leak and resets when an enemy reaches the
  base. Currency buys and upgrades towers.
- **Lives.** A fixed pool per level; the level ends at zero.

## Playing

- **Press PLAY** to start a run. Enemies spawn in escalating waves and walk the
  fixed path to your base.
- **Tap a buildable cell** to open the radial menu and place a tower; tap a
  placed tower to upgrade or sell it. See the **Towers** and **Enemies** tabs
  for each unit's sprite, role, and stats.
- **Regenerate** makes a new random board (new seed). Board layout is procedural
  and independent of wave difficulty.
- **Version badge** (top-right) confirms which build you're running and opens
  this panel and the Dev Log.

## Project rules

- No PII anywhere in code, comments, assets, or commits.
- Wireframe = board/terrain; dotted-halftone = actors (towers/enemies).
- Tilted camera only — never ground-level/first-person.
- Deterministic generation: the same seed always produces the same board.
