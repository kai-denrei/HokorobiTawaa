# Units System — Towers and Enemies

## Rendering engine — port from `braille-lab`
Read `/Users/minikai/Dev/braille-lab/primitives` before writing any unit
rendering code.

- Port the sphere-surface point `warp()` mechanism that re-points the
  halftone dot field onto arbitrary primitive geometry, and the
  underlying "Thinking Orbs" halftone engine it's built on (MIT ©
  Jakub Antalik — preserve attribution if that file is reused directly).
- All unit rendering (towers and enemies) uses this dotted-halftone
  point system. Terrain (mountains) uses wireframe instead — see
  `board.md`. This split is deliberate: dots = actor, wireframe = board.

## Two families, deliberately different registers
Towers and enemies must not share a visual vocabulary — the split itself
is the readability mechanism, more important than any single shape choice.

- **Towers = mechanical/architectural, static.** No idle animation
  needed (or only very subtle — e.g. slow rotation on GEAR).
- **Enemies = organic/aquatic, dynamic.** Idle-animate even when not
  moving (pulse, drift, ripple, flutter) — this alone does more to
  separate the two families at a glance than shape does.

Do not reuse a shape across families. Do not ship two enemy or two tower
shapes with near-duplicate silhouettes (see trims below).

## Tower shapes (static family)
Each is a distinct tower role. Use common primitives (cube, tetra, octa,
dodeca, icosa — already in braille-lab) as upgrade-tier detail added onto
the named shape, not as separate competing tower types.

| Shape | Role | Notes |
|---|---|---|
| Pine Tree | Basic/cheap tower | Upgrade = denser tetra/octa branch detail |
| GEAR | Splash/AoE | Rotation sells "area in progress"; upgrade = second interlocking gear |
| Spiral | Single-target DPS | Continuous-fire read |
| Double Spiral | Slow/debuff | Entangling/binding read |
| TearDrop | Precision/sniper single-target | Distinct from Spiral's continuous read |
| SONGS Dome | Support/buff | Dome silhouette doubles as the aura-radius indicator |
| DNA Double Helix | Capstone: lightning-chain (see `lightning-tower.md`) | Twin coil reads as "conducts/channels energy" |

## Enemy shapes (dynamic/organic family)
| Shape | Role | Notes |
|---|---|---|
| Butterfly | Fast/fragile swarm | Flutter path reads erratic and weak |
| Breathing Cloud | Tanky/amorphous | Slow pulse = "absorbs damage" |
| Torus Knot | Elite/boss | Knot density scales visually with HP |
| Wave Ghost | Flying/bypass | Translucent-ghost read sells "ignores ground path" |

**Trim before implementing:** Star and Wave Ghost read as near-duplicate
(both aerial/radiating) — ship Wave Ghost, drop Star, unless a genuine
second flying tier is needed. Jellyfish and Breathing Cloud are also
near-duplicates (pulsing bell vs. pulsing cloud) — pick one; Breathing
Cloud is the current default.

**Additional aquatic candidates**, not yet assigned a confirmed role —
evaluate and cut before V1 ships, don't carry all of them in:
- Manta Ray — wide flat glide, alternative to Wave Ghost
- Nautilus Shell — logarithmic spiral, alternative to Torus Knot
- Sea Urchin — spiky sphere, armored variant distinct from Torus Knot
- Anemone — waving tendrils, swarm-support enemy that buffs nearby creeps

## HP/readability convention
Point/dot density on the halftone field should scale with the unit's
current HP fraction, so damage is visible without a separate health bar.
Base dot density at full HP should already differ by shape/tier (e.g.
Torus Knot denser than Butterfly at 100%) so tankiness reads before any
damage is taken.

## Explicit exclusions
Heart and Butterfly-as-tower, or any literal representational shape
(vehicles, creatures) beyond the abstract geometric set above, are out of
scope for V1.
