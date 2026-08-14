// effects.ts — projectiles + transient visual FX for the board view.
//
// Owns the pooled projectile point-cloud (one THREE.Points with per-vertex
// size/colour, updated each frame) plus the fading effect lines (laser,
// lightning) and shockwave rings. BoardView keeps tower AI + enemy ownership;
// it drives this via fireX()/spawnLaser() on fire, updateProjectiles()/
// updateEffects() each frame, and reset()/dispose() on teardown. Enemies and the
// current enemy scale are read back through the getters passed in, so this stays
// decoupled from BoardView's state.

import * as THREE from 'three';
import { Enemy, dotTexture } from '../units/unit';

const MAX_PROJ = 4096;

type Projectile = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  kind: 'single' | 'homing' | 'mortar' | 'spark';
  target: Enemy | null;
  damage: number;
  splash: number;
  gravity: number;
  ttl: number;
  maxTtl: number;
  color: THREE.Color;
  size: number;
  trail: THREE.Vector3[];
  trailMax: number;
  slowF?: number;
  slowD?: number;
};

export type BurstOpts = { speed: number; up: number; size: number; color: THREE.Color; ttl: number; gravity: number };

export class EffectsSystem {
  private projGeo = new THREE.BufferGeometry();
  private projPos = new Float32Array(MAX_PROJ * 3);
  private projCol = new Float32Array(MAX_PROJ * 3);
  private projSize = new Float32Array(MAX_PROJ);
  private projPoints: THREE.Points;
  private projMat: THREE.ShaderMaterial;
  private projectiles: Projectile[] = [];
  private effects: { line: THREE.Line; mat: THREE.LineBasicMaterial; ttl: number; max: number }[] = [];
  private rings: { mesh: THREE.LineLoop; mat: THREE.LineBasicMaterial; ttl: number; max: number; maxScale: number }[] = [];
  private tmp = new THREE.Vector3();

  constructor(
    private group: THREE.Group,
    private getEnemies: () => Enemy[],
    private getEnemyScale: () => number,
  ) {
    // pooled projectile point cloud — per-vertex size + colour so each damage
    // type has its own look (positions/colours/sizes updated per frame).
    this.projGeo.setAttribute('position', new THREE.BufferAttribute(this.projPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.projGeo.setAttribute('aColor', new THREE.BufferAttribute(this.projCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.projGeo.setAttribute('aSize', new THREE.BufferAttribute(this.projSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.projGeo.setDrawRange(0, 0);
    this.projMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dotTexture() }, uScale: { value: 620 } },
      vertexShader: `
        uniform float uScale;
        attribute vec3 aColor;
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.05) discard;
          gl_FragColor = vec4(vColor, 1.0) * t;
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.projPoints = new THREE.Points(this.projGeo, this.projMat);
    this.projPoints.frustumCulled = false;
    this.group.add(this.projPoints);
  }

  private pushProj(p: Projectile): void {
    if (this.projectiles.length < MAX_PROJ) this.projectiles.push(p);
  }

  fireStraight(from: THREE.Vector3, toPos: THREE.Vector3, dmg: number, speed: number, color: THREE.Color, size: number, trailMax: number): void {
    const dir = new THREE.Vector3().subVectors(toPos, from);
    const l = dir.length() || 1;
    dir.multiplyScalar(speed / l);
    this.pushProj({ pos: from.clone(), vel: dir, kind: 'single', target: null, damage: dmg, splash: 0, gravity: 0, ttl: 2, maxTtl: 2, color, size, trail: [], trailMax });
  }

  fireHoming(from: THREE.Vector3, target: Enemy, dmg: number, speed: number, color: THREE.Color, size: number, trailMax: number): void {
    const dir = new THREE.Vector3().subVectors(target.object.position, from);
    const l = dir.length() || 1;
    dir.multiplyScalar(speed / l);
    this.pushProj({ pos: from.clone(), vel: dir, kind: 'homing', target, damage: dmg, splash: 0, gravity: 0, ttl: 3, maxTtl: 3, color, size, trail: [], trailMax });
  }

  /** Slow field: on each shot, tether lightning from the tower to EVERY enemy in
   * range, damaging and slowing them all at once (area debuff). */
  fireSlowField(from: THREE.Vector3, range: number, dmg: number, color: THREE.Color, slowF: number, slowD: number): void {
    let hit = 0;
    for (const e of this.getEnemies()) {
      if (!e.alive) continue;
      const ep = e.object.position;
      if (Math.hypot(from.x - ep.x, from.z - ep.z) > range) continue; // XZ range, like targeting
      e.damage(dmg);
      e.applySlow(slowF, slowD);
      this.spawnLightning(from, ep, color);
      this.spawnBurst(ep, 3, { speed: 0.12, up: 0.02, size: 0.03, color, ttl: 0.16, gravity: 0 }); // zap spark
      hit++;
    }
    if (hit) this.spawnBurst(from, 5, { speed: 0.2, up: 0.04, size: 0.035, color, ttl: 0.12, gravity: 0 }); // emitter flash
  }

  /** A jagged lightning bolt (fading additive line) from the tower to a target. */
  private spawnLightning(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color): void {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length() || 1;
    dir.multiplyScalar(1 / len);
    const up = new THREE.Vector3(0, 1, 0);
    let n1 = new THREE.Vector3().crossVectors(dir, up);
    if (n1.lengthSq() < 1e-6) n1.set(1, 0, 0);
    n1.normalize();
    const n2 = new THREE.Vector3().crossVectors(dir, n1).normalize();
    const seg = 7;
    const amp = 0.06 * len;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      const f = i / seg;
      const p = from.clone().addScaledVector(dir, len * f);
      if (i > 0 && i < seg) {
        p.addScaledVector(n1, (Math.random() - 0.5) * amp);
        p.addScaledVector(n2, (Math.random() - 0.5) * amp);
      }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    this.group.add(line);
    this.effects.push({ line, mat, ttl: 0.16, max: 0.16 });
  }

  fireSpread(from: THREE.Vector3, toPos: THREE.Vector3, dmg: number, speed: number, pellets: number, color: THREE.Color, size: number): void {
    const dx = toPos.x - from.x;
    const dz = toPos.z - from.z;
    const base = Math.atan2(dz, dx);
    for (let i = 0; i < pellets; i++) {
      const ang = base + (i - (pellets - 1) / 2) * 0.16;
      const vel = new THREE.Vector3(Math.cos(ang) * speed, 0, Math.sin(ang) * speed);
      this.pushProj({ pos: from.clone(), vel, kind: 'single', target: null, damage: dmg, splash: 0, gravity: 0, ttl: 1.5, maxTtl: 1.5, color, size, trail: [], trailMax: 0 });
    }
    this.spawnBurst(from, 6, { speed: 0.25, up: 0.03, size: size * 1.4, color, ttl: 0.12, gravity: 0 }); // muzzle flash
  }

  fireMortar(from: THREE.Vector3, targetPos: THREE.Vector3, dmg: number, splash: number, color: THREE.Color, size: number): void {
    const g = 1.8;
    const vy0 = 0.5;
    const T = (2 * vy0) / g; // time to return to launch height
    const vel = new THREE.Vector3((targetPos.x - from.x) / T, vy0, (targetPos.z - from.z) / T);
    this.pushProj({ pos: from.clone(), vel, kind: 'mortar', target: null, damage: dmg, splash, gravity: g, ttl: 3, maxTtl: 3, color, size, trail: [], trailMax: 4 });
  }

  updateProjectiles(dt: number): void {
    const enemies = this.getEnemies();
    if (this.projectiles.length === 0) {
      this.projGeo.setDrawRange(0, 0);
      return;
    }
    const LAND_Y = 0.02;
    const hitR = this.getEnemyScale() * 1.3 + 0.012;
    const alive: Projectile[] = [];
    for (const p of this.projectiles) {
      p.ttl -= dt;
      if (p.kind === 'mortar' || p.kind === 'spark') {
        p.vel.y -= p.gravity * dt;
      } else if (p.kind === 'homing' && p.target && p.target.alive) {
        const d = this.tmp.subVectors(p.target.object.position, p.pos);
        const dl = d.length() || 1;
        const speed = p.vel.length();
        d.multiplyScalar(speed / dl);
        const k = Math.min(1, 6 * dt); // steer rate
        p.vel.x += (d.x - p.vel.x) * k;
        p.vel.y += (d.y - p.vel.y) * k;
        p.vel.z += (d.z - p.vel.z) * k;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.trailMax > 0) {
        p.trail.unshift(p.pos.clone());
        while (p.trail.length > p.trailMax) p.trail.pop();
      }

      let done = false;
      if (p.kind === 'spark') {
        // decorative only — no collision, expires on ttl
      } else if (p.kind === 'mortar') {
        if (p.vel.y < 0 && p.pos.y <= LAND_Y) {
          for (const e of enemies) {
            if (!e.alive) continue;
            const ep = e.object.position;
            if (Math.hypot(ep.x - p.pos.x, ep.z - p.pos.z) <= p.splash) e.damage(p.damage);
          }
          const landing = new THREE.Vector3(p.pos.x, LAND_Y, p.pos.z);
          this.spawnRing(landing, p.splash * 1.7, p.color); // shockwave
          this.spawnBurst(landing, 16, { speed: 0.5, up: 0.13, size: p.size * 0.5, color: p.color, ttl: 0.4, gravity: 1.2 }); // debris
          done = true;
        }
      } else {
        for (const e of enemies) {
          if (!e.alive) continue;
          const ep = e.object.position;
          if (Math.hypot(ep.x - p.pos.x, ep.y - p.pos.y, ep.z - p.pos.z) <= hitR) {
            e.damage(p.damage);
            if (p.slowF) e.applySlow(p.slowF, p.slowD ?? 1.5);
            this.spawnBurst(p.pos, 4, { speed: 0.14, up: 0.02, size: p.size * 0.9, color: p.color, ttl: 0.14, gravity: 0 }); // hit spark
            done = true;
            break;
          }
        }
      }
      if (!done && p.ttl > 0) alive.push(p);
    }
    this.projectiles = alive;

    // fill render buffer: each projectile + its fading trail ghosts, capped.
    let n = 0;
    const push = (x: number, y: number, z: number, c: THREE.Color, bright: number, size: number): void => {
      if (n >= MAX_PROJ) return;
      this.projPos[n * 3] = x;
      this.projPos[n * 3 + 1] = y;
      this.projPos[n * 3 + 2] = z;
      this.projCol[n * 3] = c.r * bright;
      this.projCol[n * 3 + 1] = c.g * bright;
      this.projCol[n * 3 + 2] = c.b * bright;
      this.projSize[n] = size;
      n++;
    };
    for (const p of alive) {
      const bright = p.kind === 'spark' ? Math.max(0, p.ttl / p.maxTtl) : 1;
      push(p.pos.x, p.pos.y, p.pos.z, p.color, bright, p.size);
      for (let i = 0; i < p.trail.length; i++) {
        const tp = p.trail[i]!;
        const f = 1 - (i + 1) / (p.trail.length + 1);
        push(tp.x, tp.y, tp.z, p.color, bright * f * 0.85, p.size * (0.4 + 0.6 * f));
      }
    }
    this.projGeo.setDrawRange(0, n);
    (this.projGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.projGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.projGeo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Beam/laser: a bright lance from the tower extending past the target, plus a
   * halo flash at the impact point. Lingers a touch for a "laser" read. */
  spawnLaser(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color): void {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length() || 1;
    dir.multiplyScalar(1 / len);
    const end = to.clone().addScaledVector(dir, 0.05); // extend beyond the target
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), end]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    this.group.add(line);
    this.effects.push({ line, mat, ttl: 0.18, max: 0.18 });
    this.spawnBurst(to, 5, { speed: 0.12, up: 0.02, size: 0.05, color, ttl: 0.18, gravity: 0 }); // impact halo
  }

  /** Emit `count` decorative spark particles (muzzle flash, impact, debris, poof). */
  spawnBurst(pos: THREE.Vector3, count: number, o: BurstOpts): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * 1.2;
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.abs(Math.sin(el)), Math.sin(a) * Math.cos(el));
      const vel = dir.multiplyScalar(o.speed * (0.5 + Math.random()));
      vel.y += o.up;
      this.pushProj({ pos: pos.clone(), vel, kind: 'spark', target: null, damage: 0, splash: 0, gravity: o.gravity, ttl: o.ttl, maxTtl: o.ttl, color: o.color.clone(), size: o.size, trail: [], trailMax: 0 });
    }
  }

  /** Expanding shockwave ring on the ground (mortar splash). */
  private spawnRing(pos: THREE.Vector3, radius: number, color: THREE.Color): void {
    const seg = 28;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.LineLoop(geo, mat);
    ring.position.set(pos.x, 0.02, pos.z);
    ring.scale.setScalar(0.001);
    this.group.add(ring);
    this.rings.push({ mesh: ring, mat, ttl: 0.45, max: 0.45, maxScale: radius });
  }

  updateEffects(dt: number): void {
    if (this.effects.length) {
      const keep: typeof this.effects = [];
      for (const e of this.effects) {
        e.ttl -= dt;
        if (e.ttl <= 0) {
          this.group.remove(e.line);
          e.line.geometry.dispose();
          e.mat.dispose();
        } else {
          e.mat.opacity = e.ttl / e.max;
          keep.push(e);
        }
      }
      this.effects = keep;
    }
    if (this.rings.length) {
      const keep: typeof this.rings = [];
      for (const r of this.rings) {
        r.ttl -= dt;
        if (r.ttl <= 0) {
          this.group.remove(r.mesh);
          r.mesh.geometry.dispose();
          r.mat.dispose();
        } else {
          const t = 1 - r.ttl / r.max;
          r.mesh.scale.setScalar(Math.max(0.001, r.maxScale * (0.2 + 0.8 * t)));
          r.mat.opacity = 1 - t;
          keep.push(r);
        }
      }
      this.rings = keep;
    }
  }

  /** Clear all live projectiles + fading effects/rings (board reset). */
  reset(): void {
    for (const e of this.effects) {
      this.group.remove(e.line);
      e.line.geometry.dispose();
      e.mat.dispose();
    }
    this.effects = [];
    for (const r of this.rings) {
      this.group.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mat.dispose();
    }
    this.rings = [];
    this.projectiles = [];
    this.projGeo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.reset();
    this.group.remove(this.projPoints);
    this.projGeo.dispose();
    this.projMat.dispose();
  }
}
