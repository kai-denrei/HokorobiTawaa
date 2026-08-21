import { describe, it, expect } from 'vitest';
import { CAMERA_VIEWS, ease, poseAt, advanceTween, type Pose, type CamTween } from './camera-views';

const A: Pose = { position: [0, 0, 0], target: [0, 0, 0], fov: 40 };
const B: Pose = { position: [2, 4, 6], target: [1, 1, 1], fov: 60 };

describe('ease (smoothstep)', () => {
  it('pins the endpoints', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });
  it('is symmetric through the midpoint', () => {
    expect(ease(0.5)).toBeCloseTo(0.5, 6);
    expect(ease(0.25) + ease(0.75)).toBeCloseTo(1, 6);
  });
  it('clamps out-of-range input', () => {
    expect(ease(-3)).toBe(0);
    expect(ease(7)).toBe(1);
  });
  it('is monotonic non-decreasing', () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = ease(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('poseAt', () => {
  it('returns `from` at k=0 and `to` at k=1', () => {
    expect(poseAt(A, B, 0)).toEqual(A);
    expect(poseAt(A, B, 1)).toEqual(B);
  });
  it('eases the midpoint (smoothstep(0.5)=0.5) across position, target and fov', () => {
    const m = poseAt(A, B, 0.5);
    expect(m.position).toEqual([1, 2, 3]);
    expect(m.target).toEqual([0.5, 0.5, 0.5]);
    expect(m.fov).toBeCloseTo(50, 6);
  });
  it('does not mutate its inputs', () => {
    poseAt(A, B, 0.3);
    expect(A.position).toEqual([0, 0, 0]);
    expect(B.fov).toBe(60);
  });
});

describe('advanceTween', () => {
  it('accumulates dt and interpolates while running', () => {
    const tw: CamTween = { from: A, to: B, t: 0, dur: 1 };
    const step = advanceTween(tw, 0.5);
    expect(tw.t).toBe(0.5);
    expect(step.done).toBe(false);
    expect(step.pose.position).toEqual([1, 2, 3]); // ease(0.5)=0.5
  });
  it('finishes exactly at `to` once elapsed reaches the duration', () => {
    const tw: CamTween = { from: A, to: B, t: 0.9, dur: 1 };
    const step = advanceTween(tw, 0.2); // t -> 1.1, past dur
    expect(step.done).toBe(true);
    expect(step.pose).toEqual(B); // snapped, not overshooting past k=1
  });
  it('treats a zero-duration tween as an instant cut', () => {
    const tw: CamTween = { from: A, to: B, t: 0, dur: 0 };
    const step = advanceTween(tw, 0);
    expect(step.done).toBe(true);
    expect(step.pose).toEqual(B);
  });
});

describe('CAMERA_VIEWS presets', () => {
  it('exposes exactly three selectable views', () => {
    expect(CAMERA_VIEWS).toHaveLength(3);
  });
  it('view 1 is the original default framing (no regression to the existing shot)', () => {
    expect(CAMERA_VIEWS[0]).toEqual({ position: [0, 1.62, 1.12], target: [0, 0, 0.04], fov: 44 });
  });
  it('every preset is a well-formed pose', () => {
    for (const v of CAMERA_VIEWS) {
      expect(v.position).toHaveLength(3);
      expect(v.target).toHaveLength(3);
      expect(v.fov).toBeGreaterThan(0);
      expect(v.fov).toBeLessThan(120);
    }
  });
});
