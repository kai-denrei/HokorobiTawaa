# Backlog / polish notes

Deferred work and design directions, captured so they aren't lost. Not a
changelog (see DEVLOG.md) — these are things we've decided are worth doing but
haven't scheduled yet.

## Visual identity of damage types — DONE 2026-08-13 (first pass)

Implemented: per-tower projectile colour + size (shader per-vertex size), dotted
tracers/trails (Spiral, Double Spiral, Teardrop), Gear mortar = big amber shell +
shockwave ring + debris burst, Teardrop = fast tight white round with long tracer,
DNA = violet laser lance extending past target + impact halo, SONGS muzzle flash,
enemy death poofs (scatter the enemy's colour), hit sparks. Still open below:
a sniper charge-up tell, and the DNA lightning-chain proper (its own milestone).

## Visual identity of damage types (original note)

The five attack patterns (single / spread / homing / mortar / beam) currently
all render as near-identical additive green dots + a fade line. They read as
"a projectile," not as *that tower's* projectile. Improve the visual
representation of each key damage type so each tower has a recognisable signature:

- **More idiosyncrasy per type** — distinct projectile shape, colour, size,
  trail, and impact:
  - single (Pine Tree / Spiral) — small tracer bolts; Spiral's should read as a
    rapid stream.
  - spread (SONGS) — a fan of pellets with a shared muzzle flash.
  - homing (Double Spiral / DNA) — a curving ribbon/tail that shows the arc.
  - mortar (Gear) — a heavy lobbed shell with a shadow/target reticle and a real
    splash burst on impact (ring shockwave + debris dots).
  - beam (Teardrop) — an instant bright lance with a lingering scorch, not a thin
    line; a charge-up tell would sell the sniper role.
- **Particle effects** — muzzle flashes, impact bursts, death poofs (enemy dot
  cloud scatters outward on death rather than just vanishing), splash rings.
- **Per-tower colour accents** — towers are all one green today; let each tower's
  projectile carry a subtle hue so the battlefield reads at a glance.
- **Enemy hit feedback** — a brief flash / knockback / colour pop on hit, beyond
  the dot-density thinning.

Also relates to the planned capstone: the DNA "lightning-chain" (maze-lightning
BFS) will need its own three-phase visual (frontier → path trace → bolt).
