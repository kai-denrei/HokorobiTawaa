// heart-base.ts — the big halftone Heart at the base/exit cell. Breathes green
// to show health (dot density = lives/maxLives); on a hit it flashes red and
// bursts to the Wave treatment with an explosion pulse, then settles.

import * as THREE from 'three';
import { dotTexture } from '../units/unit';
import { dotLOD } from '../units/proximity';
import { heartPointsShuffled, breathe, wave } from '../units/heart';

const HURT_DUR = 0.75;
const GREEN = new THREE.Color(0x5affd0);
const RED = new THREE.Color(0xff4636);

export class HeartBase {
  readonly object: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.PointsMaterial;
  private pts = heartPointsShuffled();
  private count = this.pts.length;
  private buf: Float32Array;
  private livesFrac = 1;
  private hurtT = 0;
  private readonly baseSize: number;

  constructor(worldX: number, worldZ: number, private scale: number) {
    this.baseSize = scale * 0.12;
    this.buf = new Float32Array(this.count * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.buf, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({
      color: GREEN.clone(),
      size: this.baseSize,
      map: dotTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.object = new THREE.Points(this.geo, this.mat);
    this.object.position.set(worldX, scale * 0.95, worldZ);
    this.object.frustumCulled = false;
  }

  setLives(frac: number): void {
    this.livesFrac = Math.max(0, Math.min(1, frac));
  }

  hit(): void {
    this.hurtT = HURT_DUR;
  }

  update(dt: number, elapsed: number): void {
    let dots: number[][];
    if (this.hurtT > 0) {
      this.hurtT = Math.max(0, this.hurtT - dt);
      const ph = 1 - this.hurtT / HURT_DUR;
      const expl = Math.sin(Math.min(1, ph * 1.3) * Math.PI);
      dots = wave(this.pts, elapsed).map((p) => [p[0]! * (1 + 0.7 * expl), p[1]! * (1 + 0.7 * expl), p[2]! * (1 + 0.7 * expl)]);
      const flick = 0.55 + 0.45 * Math.abs(Math.sin(ph * 26));
      this.mat.color.copy(RED).multiplyScalar(flick);
    } else {
      dots = breathe(this.pts, elapsed);
      this.mat.color.copy(GREEN);
    }
    const k = this.livesFrac <= 0 ? 6 : Math.max(6, Math.floor(this.count * this.livesFrac));
    const s = this.scale;
    for (let i = 0; i < k; i++) {
      const p = dots[i]!;
      this.buf[i * 3] = p[0]! * s;
      this.buf[i * 3 + 1] = p[1]! * s;
      this.buf[i * 3 + 2] = p[2]! * s;
    }
    this.geo.setDrawRange(0, k);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Distance-based dot LOD, matching the units: shrink + dim when the camera is
   * close so the heart doesn't blow out to white in the close-up views. Must run
   * AFTER update() (which resets size/colour each frame): it multiplies the
   * current colour, so the green/red-flash hue is preserved and just dimmed. */
  applyLOD(cameraPos: THREE.Vector3 | null): void {
    const lod = cameraPos ? dotLOD(this.object.position.distanceTo(cameraPos)) : { size: 1, bright: 1 };
    this.mat.size = this.baseSize * lod.size;
    if (lod.bright < 1) this.mat.color.multiplyScalar(lod.bright);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
