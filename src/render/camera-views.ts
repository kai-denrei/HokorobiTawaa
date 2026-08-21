// camera-views.ts — selectable "cinematic" camera presets and the pure math for
// easing between them. Kept free of THREE so it unit-tests like coords.ts: the
// scene (scene.ts) owns the live THREE.Camera and just applies the poses this
// module produces.
//
// Board space is the XZ ground plane spanning [-0.5, 0.5]², Y up (see scene.ts).
// A "pose" is where the camera sits, what it looks at, and its vertical FOV.

export type Vec3 = [number, number, number];
export type Pose = { position: Vec3; target: Vec3; fov: number };

/** The three HUD-selectable views. View 1 is the game's original shot verbatim;
 * views 2 and 3 pick different distances but their FOVs are chosen to match view
 * 1's board coverage (fov ∝ 1/distance), so whatever aspect ratio frames view 1
 * acceptably frames these too. Tune the numbers freely — they're just data. */
export const CAMERA_VIEWS: Pose[] = [
  // 1 · Tactical — the default steep 3/4 overview (unchanged from the old shot).
  { position: [0, 1.62, 1.12], target: [0, 0, 0.04], fov: 44 },
  // 2 · Cinematic — low, grazing hero angle; wider FOV for dramatic perspective.
  { position: [0, 0.85, 1.32], target: [0, 0.06, -0.06], fov: 54 },
  // 3 · Overhead — steep near-top-down (but never vertical, so tap-picking and
  //     the extruded silhouettes stay well-behaved); tighter FOV, pulled up.
  { position: [0, 2.35, 0.42], target: [0, 0, 0], fov: 36 },
];

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
  return {
    position: lerp3(from.position, to.position, e),
    target: lerp3(from.target, to.target, e),
    fov: lerp(from.fov, to.fov, e),
  };
}

/** A camera move in flight: eased from→to over `dur` seconds, `t` elapsed. */
export type CamTween = { from: Pose; to: Pose; t: number; dur: number };

/** Advance a tween by `dt`, returning the current eased pose and whether it has
 * reached its destination (snapped exactly to `to`, never overshooting). */
export function advanceTween(tw: CamTween, dt: number): { pose: Pose; done: boolean } {
  tw.t += dt;
  const k = tw.dur > 0 ? tw.t / tw.dur : 1;
  const done = k >= 1;
  return { pose: done ? tw.to : poseAt(tw.from, tw.to, k), done };
}
