# Lightning-Chain Capstone Tower (DNA Double Helix)

## Algorithm — port from `maze-lightning`
Read `/Users/minikai/Dev/maze-lightning` before writing this tower's
logic. Its documented algorithm, confirmed on the page itself:

1. BFS expands level-by-level in all four cardinal directions from a
   source, guaranteeing shortest path.
2. When the frontier reaches the target, the path is reconstructed by
   following parent pointers back to the source.
3. Three visual phases: frontier expansion (moving wavefront, fades
   behind itself), path trace (dim retrace of the shortest path), bolt
   (path flickers bright white-yellow, simulating the strike).

## Adaptation for this tower
- Source: the tower's own cell. Targets: enemy units currently within
  some radius, resolved via the board's cell **adjacency graph** (see
  `board.md`) rather than a uniform 4-directional grid — the Stålberg
  mesh is irregular, so "cardinal directions" becomes "graph neighbours."
- Run BFS from the tower across the adjacency graph, but only through
  cells currently occupied by an enemy (or within N hops of one) — the
  "maze" here is effectively the live enemy positions, not static walls.
  This gives a shortest chain-path through the enemies actually in range.
- Discharge only when the tower's charge (see `economy.md`) is full —
  this is a periodic burst, not a continuous beam.
- Reuse the three visual phases directly: frontier expansion as the
  charge-up tell (telegraphs the coming discharge), path trace as the
  chain-path lock-in, bolt as the actual damage-dealing flicker along
  every enemy in the resolved chain.

## Open question to resolve during implementation
maze-lightning's BFS finds shortest path to *any* point on the far edge.
This tower needs shortest path through *as many enemies as reachable*
within charge-appropriate range — that's closer to a coverage/traversal
problem than a single-source-single-target shortest path. Confirm
whether a straight BFS chain (hit enemies in the order BFS reaches them,
stop at some hop limit or enemy count) is sufficient for V1, versus
needing a proper multi-target traversal. Default to the simpler BFS
chain-in-order approach for V1; revisit only if it plays poorly.
