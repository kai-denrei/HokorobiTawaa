import { describe, it, expect } from 'vitest';
import {
  VIEWS, STATIC_POSES, ease, poseAt, advanceTween, smoothPose,
  meanVec, densestCluster, waveDir, actionPose, trenchPose,
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

describe('meanVec / densestCluster', () => {
  it('meanVec averages componentwise', () => {
    expect(meanVec([[0, 0, 0], [2, 4, 6]])).toEqual([1, 2, 3]);
  });
  it('densestCluster returns null for no points', () => {
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

describe('waveDir', () => {
  it('averages and normalises headings to unit length', () => {
    const d = waveDir([[1, 0, 0], [0, 0, 1]]);
    expect(Math.hypot(d[0], d[2])).toBeCloseTo(1, 6);
    expect(d[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(d[2]).toBeCloseTo(Math.SQRT1_2, 6);
  });
  it('falls back when headings cancel out', () => {
    expect(waveDir([[1, 0, 0], [-1, 0, 0]], [0, 0, 1])).toEqual([0, 0, 1]);
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

describe('trenchPose (view 5)', () => {
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

describe('VIEWS', () => {
  it('exposes five views: three static then two dynamic', () => {
    expect(VIEWS).toHaveLength(5);
    expect(VIEWS.slice(0, 3).every((v) => v.kind === 'static')).toBe(true);
    expect(VIEWS[3]).toMatchObject({ kind: 'dynamic', mode: 'action' });
    expect(VIEWS[4]).toMatchObject({ kind: 'dynamic', mode: 'trench' });
  });
  it('view 1 is the original default framing (no regression)', () => {
    expect(STATIC_POSES[0]).toEqual({ position: [0, 1.62, 1.12], target: [0, 0, 0.04], fov: 44 });
    expect(VIEWS[0]).toMatchObject({ kind: 'static', pose: STATIC_POSES[0] });
  });
});
