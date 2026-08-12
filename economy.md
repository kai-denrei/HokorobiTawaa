# Economy System

Modeled on geoDefense's structure. No local repo to port from — this is
original implementation based on documented mechanics, not ported code.

## Currency
- Per-kill payout depends on enemy type, not a flat amount — tankier/
  rarer enemies (Torus Knot, Breathing Cloud) pay out more than swarm
  units (Butterfly). This is what makes late-wave spikes feel earned
  rather than grindy.
- No partial credit for enemies that leak past the base — a leak costs a
  life and pays nothing.

## Streak multiplier
- A running kill-streak multiplier increases score/currency the longer
  the player kills without a leak.
- A leak resets the streak. Surface streak state on the HUD, and
  consider tying its visual to the same dotted-halftone particle system
  used for units (e.g. multiplier readout rendered as particle density)
  rather than a plain number, for visual consistency with the rest of
  the game.

## Waves
- Each level = several discrete waves, escalating HP/speed/count, with
  periodic "spike" waves that force tower-type diversity rather than
  pure tower-count scaling.
- Board (see `board.md`) regenerates per level — wave difficulty is
  authored independently of board layout, since layout is procedural.
- Lives: a fixed pool per level (geoDefense used 15); game over at zero.

## Capstone charge resource
The DNA Double Helix / lightning-chain tower (see `lightning-tower.md`)
does not fire continuously. It charges off nearby kills or hits, then
periodically discharges a BFS-routed chain burst through the current
enemy graph. This charge is a resource distinct from currency — track it
per-tower, not globally, so multiple capstone towers charge
independently.

## Tower economy
- Standard TD cost/upgrade curve: placement cost, then 2-3 upgrade tiers
  per tower (see `units.md` for how upgrade tiers map to shape detail).
- Selling/refunding a placed tower: include a partial refund (standard
  TD convention) unless there's a specific reason to omit it — flag if
  omitting is intentional rather than an oversight.
