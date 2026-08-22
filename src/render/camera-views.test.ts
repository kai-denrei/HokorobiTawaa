import { describe, it, expect } from 'vitest';
import {
  VIEWS, DEFAULT_VIEW, DEFAULT_POSE, ease, poseAt, advanceTween, smoothPose,
  densestCluster, actionPose, trenchPose, bastionPose, revealPose,
  type Pose, type CamTween, type Vec3,
} from './camera-views';

const A: Pose = { position: [0, 0, 0], target: [0, 0, 0], fov: 40 };
const B: Pose = { position: [2, 4, 6], target: [1, 1, 1], fov: 60 };

describe('ease (smoothstep)', () => {
  it('pins the endpoints', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });
  it('is symmetric through the midpoint and clamps', () => {
    expect(ease(0.5)).toBeCloseTo(0.5, 6);
    expect(ease(-3)).toBe(0);
    expect(ease(7)).toBe(1);
  });
  it('is monotonic non-decreasing', () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) { const v = ease(i / 20); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
});

describe('poseAt / advanceTween', () => {
  it('returns from at k=0 and to at k=1', () => {
    expect(poseAt(A, B, 0)).toEqual(A);
    expect(poseAt(A, B, 1)).toEqual(B);
  });
  it('eases the midpoint across position, target and fov', () => {
    const m = poseAt(A, B, 0.5);
    expect(m.position).toEqual([1, 2, 3]);
    expect(m.fov).toBeCloseTo(50, 6);
  });
  it('advanceTween finishes exactly at `to` (no overshoot)', () => {
    const tw: CamTween = { from: A, to: B, t: 0.9, dur: 1 };
    const step = advanceTween(tw, 0.2);
    expect(step.done).toBe(true);
    expect(step.pose).toEqual(B);
  });
});

describe('smoothPose (exponential follow)', () => {
  it('does not move when already at the target', () => {
    expect(smoothPose(A, A, 0.016, 0.35)).toEqual(A);
  });
  it('moves a fraction toward the target and converges over time', () => {
    const one = smoothPose(A, B, 0.1, 0.3);
    // partway, never past the target
    expect(one.position[0]).toBeGreaterThan(0);
    expect(one.position[0]).toBeLessThan(2);
    let p = A;
    for (let i = 0; i < 300; i++) p = smoothPose(p, B, 0.016, 0.3);
    expect(p.position[0]).toBeCloseTo(2, 3);
    expect(p.fov).toBeCloseTo(60, 3);
  });
  it('a larger tau eases more slowly (smaller first step)', () => {
    const fast = smoothPose(A, B, 0.1, 0.1).position[0];
    const slow = smoothPose(A, B, 0.1, 1.0).position[0];
    expect(fast).toBeGreaterThan(slow);
  });
});

describe('densestCluster', () => {
  it('returns null for no points', () => {
    expect(densestCluster([], 0.1)).toBeNull();
  });
  it('finds the centroid of the tight knot, ignoring a far outlier', () => {
    // three points clustered near (1,·,1) plus one loner far away
    const pts: Vec3[] = [[1, 0, 1], [1.05, 0, 0.98], [0.95, 0, 1.02], [-5, 0, -5]];
    const c = densestCluster(pts, 0.16)!;
    expect(c[0]).toBeCloseTo(1, 1);
    expect(c[2]).toBeCloseTo(1, 1);
    expect(c[0]).toBeGreaterThan(0); // not dragged toward the (-5,-5) outlier
  });
});

describe('actionPose (view 4)', () => {
  it('offsets the camera above/behind the hotspot and looks at it', () => {
    const p = actionPose([0.2, 0.03, -0.1]);
    expect(p.target[0]).toBeCloseTo(0.2, 6);
    expect(p.target[2]).toBeCloseTo(-0.1, 6);
    expect(p.position[1]).toBeGreaterThan(p.target[1]); // camera is above the action
    expect(p.fov).toBeLessThan(44); // tighter than the default → a close-up
  });
});

describe('bastionPose (view 5)', () => {
  it('sits behind the Heart and looks through it toward the enemies', () => {
    const heart: Vec3 = [0, 0.1, 0];
    const dir: Vec3 = [0, 0, 1]; // enemies approach from +z
    const p = bastionPose(heart, dir);
    expect(p.position[2]).toBeLessThan(heart[2]); // camera behind the Heart (−z side)
    expect(p.target[2]).toBeGreaterThan(heart[2]); // looks through it toward +z (enemies)
    expect(p.position[1]).toBeGreaterThan(heart[1]); // slightly above the Heart
  });
});

describe('trenchPose (view 2)', () => {
  it('sits behind the centroid (opposite dir) and looks ahead, low + wide', () => {
    const c: Vec3 = [0, 0, 0];
    const dir: Vec3 = [0, 0, 1]; // wave heading +z
    const p = trenchPose(c, dir);
    expect(p.position[2]).toBeLessThan(0); // camera is behind (−z of) the pack
    expect(p.target[2]).toBeGreaterThan(0); // looking ahead (+z), where they're going
    expect(p.position[1]).toBeLessThan(0.12); // low to the ground — inside the trench
    expect(p.fov).toBeGreaterThan(54); // wider than the default → immersive
  });
});

describe('revealPose', () => {
  const dir: Vec3 = [0, 0, 1];
  it('starts low and offset toward the first sector', () => {
    const p = revealPose(1, 6, dir);
    expect(p.position[1]).toBeLessThan(1.6); // low-ish at the start
    expect(p.target[0]).toBeCloseTo(0, 6);
    expect(p.target[2]).toBeCloseTo(0, 6); // looks at the centre (Heart)
    expect(Math.sign(p.position[2])).toBe(1); // pushed toward +z (firstDir side)
  });
  it('pulls back (higher) as more sectors reveal', () => {
    expect(revealPose(6, 6, dir).position[1]).toBeGreaterThan(revealPose(1, 6, dir).position[1]);
  });
  it('ends high and centred overhead', () => {
    const p = revealPose(6, 6, dir);
    expect(p.position[1]).toBeGreaterThan(2.0);
    expect(Math.hypot(p.position[0], p.position[2])).toBeLessThan(0.6); // near-centred
  });
});

describe('VIEWS', () => {
  it('exposes the five views in HUD-number order (1 Overhead … 5 Bastion)', () => {
    expect(VIEWS).toHaveLength(5);
    expect(VIEWS.map((v) => v.name)).toEqual(['Overhead', 'Trench', 'Tactical', 'Action', 'Bastion']);
    expect(VIEWS[1]).toMatchObject({ kind: 'dynamic', mode: 'trench' }); // #2
    expect(VIEWS[3]).toMatchObject({ kind: 'dynamic', mode: 'action' }); // #4
    expect(VIEWS[4]).toMatchObject({ kind: 'dynamic', mode: 'bastion' }); // #5
  });
  it('defaults to Overhead (#1) and preserves the original Tactical pose at #3', () => {
    expect(DEFAULT_VIEW).toBe(0);
    expect(VIEWS[DEFAULT_VIEW]).toMatchObject({ kind: 'static', name: 'Overhead' });
    expect(DEFAULT_POSE).toEqual({ position: [0, 2.35, 0.42], target: [0, 0, 0], fov: 36 }); // Overhead
    expect(VIEWS[2]).toMatchObject({
      kind: 'static',
      name: 'Tactical',
      pose: { position: [0, 1.62, 1.12], target: [0, 0, 0.04], fov: 44 }, // the original camera
    });
  });
});
