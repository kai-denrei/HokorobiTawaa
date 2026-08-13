# Economy & Damage Scaling — Design Spec

Date: 2026-08-13
Status: Approved for implementation

Decisions: Classic TD challenge · income from kills+streak only · strong ~5×
streak · escalating upgrade tiers + 75% refund. All numbers are a tuned first
pass to playtest, not final balance.

## Income
- Start gold: **120**.
- Gold only from kills; leaked enemies pay nothing.
- Streak multiplier: `mult = min(5, 1 + 0.05 × streak)`, streak = consecutive
  kills with no leak; `streak++` per kill; any leak resets streak → 0.
- HUD shows gold + live ×multiplier.

## Enemies (base HP + flat bounty)
| key | HP | bounty |
|---|---|---|
| butterfly | 20 | 3 |
| ghost | 40 | 6 |
| shell | 70 | 8 |
| cloud | 120 | 15 |
| knot | 260 | 30 |

Per-wave HP scaler (waves 1–6): **[1.0, 1.12, 1.25, 1.40, 1.55, 1.75]**, applied
to HP only (bounty stays flat).

## Waves
1. butterfly ×10
2. butterfly ×10, shell ×4
3. (spike) shell ×8, cloud ×3
4. butterfly ×14, ghost ×6
5. (spike) knot ×3, shell ×8
6. (boss) butterfly ×10, cloud ×4, ghost ×5, knot ×3

88 enemies; ~643 gold at 1× → ~1,900 clean run / ~900–1,400 leaky.

## Towers (cost / upgrade / refund)
Place cost; 2 upgrade tiers at **0.7× / 1.2×** of place cost; sell = **75% of
total spent**.
| key | place |
|---|---|
| tree | 40 |
| spiral | 70 |
| songs | 80 |
| dspiral | 90 |
| gear | 110 |
| teardrop | 130 |
| dna | 220 |

Upgrade per tier: **+55% damage, +8% range, +10% fire-rate**; tier-2 signature:
mortar +40% splash, spread +2 pellets, beam +30% range, homing/single +30%/+20%.
Tower scales up slightly per tier for visual feedback.

## UI
- HUD: gold + multiplier (+ existing lives/wave/timer).
- Tower palette: show cost, grey out unaffordable.
- Tap an occupied buildable cell → Upgrade/Sell menu (bottom sheet).

## Deferred (docs/BACKLOG.md)
Double-Spiral slow and DNA lightning-chain remain damage-only; damage-type
visual identity pass.
