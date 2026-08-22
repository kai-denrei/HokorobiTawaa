// camera-views.ts — the HUD-selectable camera views and the pure math behind
// them. Kept free of THREE so it unit-tests like coords.ts; the scene owns the
// live THREE.Camera and applies the poses these functions produce.
//
// Board space is the XZ ground plane spanning [-0.5, 0.5]², Y up (see scene.ts).
// A "pose" is where the camera sits, what it looks at, and its vertical FOV.
//
// Two flavours of view:
//   static  (1-3) — a fixed pose the camera tweens to and then holds.
//   dynamic (4-5) — a pose recomputed every frame from live enemy positions,
//                   which the camera eases toward continuously (a follow cam).

export type Vec3 = [number, number, number];
export type Pose = { position: Vec3; target: Vec3; fov: number };

export type ViewDef =
  | { kind: 'static'; name: string; pose: Pose }
  | { kind: 'dynamic'; name: string; mode: 'action' | 'trench' };

// The static camera poses (named, order-independent). Tactical is the game's
// original camera; the other two FOVs match its board coverage (fov ∝ 1/distance)
// so whatever aspect frames Tactical frames these too.
const POSE_TACTICAL: Pose = { position: [0, 1.62, 1.12], target: [0, 0, 0.04], fov: 44 };
const POSE_CINEMATIC: Pose = { position: [0, 0.85, 1.32], target: [0, 0.06, -0.06], fov: 54 };
const POSE_OVERHEAD: Pose = { position: [0, 2.35, 0.42], target: [0, 0, 0], fov: 36 };

/** HUD numbering — button 1..5 maps to VIEWS[0..4]:
 *  1 Overhead (default), 2 Trench, 3 Tactical, 4 Action, 5 Cinematic. */
export const VIEWS: ViewDef[] = [
  { kind: 'static', name: 'Overhead', pose: POSE_OVERHEAD }, // 1 — default top-down
  { kind: 'dynamic', name: 'Trench', mode: 'trench' }, // 2 — low chase behind a wave
  { kind: 'static', name: 'Tactical', pose: POSE_TACTICAL }, // 3 — steep 3/4 overview
  { kind: 'dynamic', name: 'Action', mode: 'action' }, // 4 — close-up on the busiest fight
  { kind: 'static', name: 'Cinematic', pose: POSE_CINEMATIC }, // 5 — low hero angle
];

/** The view the camera starts on (index into VIEWS). */
export const DEFAULT_VIEW = 0;
/** Pose for the default view; the scene initialises the camera to this. */
export const DEFAULT_POSE: Pose = POSE_OVERHEAD;

// ---- easing / interpolation (static tweens) -------------------------------

/** Smoothstep eased 0..1 (ease-in-out), clamped. */
export function ease(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Pose along from→to at raw progress `k` (0..1), with smoothstep easing. */
export function poseAt(from: Pose, to: Pose, k: number): Pose {
  const e = ease(k);
  return { position: lerp3(from.position, to.position, e), target: lerp3(from.target, to.target, e), fov: lerp(from.fov, to.fov, e) };
}

/** A static camera move in flight: eased from→to over `dur` seconds. */
export type CamTween = { from: Pose; to: Pose; t: number; dur: number };

/** Advance a tween by `dt`; returns the eased pose and whether it has arrived
 * (snapped exactly to `to`, never overshooting). */
export function advanceTween(tw: CamTween, dt: number): { pose: Pose; done: boolean } {
  tw.t += dt;
  const k = tw.dur > 0 ? tw.t / tw.dur : 1;
  const done = k >= 1;
  return { pose: done ? tw.to : poseAt(tw.from, tw.to, k), done };
}

/** Frame-rate-independent exponential ease of `cur` toward `target`. `tau` is
 * the smoothing time constant (~seconds to close most of the gap). Used by the
 * dynamic follow cams so they glide instead of snapping to jittery live data. */
export function smoothPose(cur: Pose, target: Pose, dt: number, tau: number): Pose {
  const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
  return { position: lerp3(cur.position, target.position, k), target: lerp3(cur.target, target.target, k), fov: lerp(cur.fov, target.fov, k) };
}

// ---- dynamic view targets (from live enemy data) --------------------------

/** Follow-cam smoothing time constant (seconds). */
export const DYN_TAU = 0.35;

// view 4 (Action): close-up on the densest knot of enemies.
export const ACTION_RADIUS = 0.16; // XZ neighbourhood counted as one "fight"
const ACTION_OFFSET: Vec3 = [0, 0.34, 0.42]; // camera offset from the hotspot
const ACTION_LOOK_Y = 0.04;
const ACTION_FOV = 40;

// view 5 (Trench): low camera behind a wave, looking along its heading.
const TRENCH_BEHIND = 0.32; // how far back from the pack centroid
const TRENCH_AHEAD = 0.22; // look this far ahead of the centroid
const TRENCH_HEIGHT = 0.06; // low — down among the walls (WALL_HEIGHT is 0.06)
const TRENCH_LOOK_Y = 0.038;
const TRENCH_FOV = 64; // wide + immersive

/** Centroid of the densest XZ cluster: for each point, average its neighbours
 * within `radius`; return the centroid of whichever neighbourhood is biggest.
 * O(n²) but n = live enemies (tens). Returns null for an empty list. */
export function densestCluster(points: Vec3[], radius: number): Vec3 | null {
  if (points.length === 0) return null;
  const r2 = radius * radius;
  let bestCount = -1;
  let best: Vec3 = points[0]!;
  for (let i = 0; i < points.length; i++) {
    let cx = 0, cy = 0, cz = 0, n = 0;
    const pi = points[i]!;
    for (let j = 0; j < points.length; j++) {
      const pj = points[j]!;
      const dx = pi[0] - pj[0];
      const dz = pi[2] - pj[2];
      if (dx * dx + dz * dz <= r2) { cx += pj[0]; cy += pj[1]; cz += pj[2]; n++; }
    }
    if (n > bestCount) { bestCount = n; best = [cx / n, cy / n, cz / n]; }
  }
  return best;
}

/** View 4 pose: a fixed close 3/4 offset looking down at the action `hotspot`. */
export function actionPose(hotspot: Vec3): Pose {
  return {
    position: [hotspot[0] + ACTION_OFFSET[0], hotspot[1] + ACTION_OFFSET[1], hotspot[2] + ACTION_OFFSET[2]],
    target: [hotspot[0], ACTION_LOOK_Y, hotspot[2]],
    fov: ACTION_FOV,
  };
}

/** View 5 pose: sit low behind the followed enemy `anchor` (opposite its heading
 * `dir`) and look forward along the trench, so it streams away from the camera. */
export function trenchPose(anchor: Vec3, dir: Vec3): Pose {
  return {
    position: [anchor[0] - dir[0] * TRENCH_BEHIND, TRENCH_HEIGHT, anchor[2] - dir[2] * TRENCH_BEHIND],
    target: [anchor[0] + dir[0] * TRENCH_AHEAD, TRENCH_LOOK_Y, anchor[2] + dir[2] * TRENCH_AHEAD],
    fov: TRENCH_FOV,
  };
}

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
