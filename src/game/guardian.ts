import * as THREE from 'three';
import type { PhysicsState } from '../physics/world';
import type { PlatformSpec } from './types';

type Phase = 'idle' | 'warn' | 'pulse' | 'exposed' | 'defeated';
const REST = 1.7;
const WARN = 1.05;
const EXPOSED = 2.75;
const MAX_WAVE = 12;

export class Guardian {
  readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly crown = new THREE.Group();
  private readonly shell = new THREE.Group();
  private readonly seal = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly telegraph: THREE.Mesh;
  private readonly crystal = new THREE.MeshLambertMaterial({ color: '#bf9aff', emissive: '#9865f2', emissiveIntensity: .6, flatShading: true });
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: '#ffaf93', transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false });
  private readonly telegraphMat = new THREE.MeshBasicMaterial({ color: '#ffc491', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false });
  private elapsed = 0;
  private invulnerable = 0;
  private waveHit = false;
  private armed = false;
  private hasEntered = false;
  phase: Phase = 'idle';
  health = 3;
  hearts = 3;
  get active() { return this.armed && this.hasEntered && this.phase !== 'defeated'; }
  get defeated() { return this.phase === 'defeated'; }

  constructor(readonly arena: PlatformSpec) {
    this.group.position.set(arena.x, arena.y, arena.z);
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(1.04), this.crystal);
    this.shell.add(this.core, this.crown);
    this.group.add(this.shell, this.seal);
    const stone = new THREE.MeshLambertMaterial({ color: '#53486e', flatShading: true });
    const trim = new THREE.MeshBasicMaterial({ color: '#cdb6f7' });
    const armor = new THREE.BoxGeometry(1, .68, .84);
    const fragment = new THREE.OctahedronGeometry(.17);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, r = 1.7;
      const plate = new THREE.Mesh(armor, stone);
      plate.position.set(Math.sin(a) * r, -.18 + (i % 2) * .32, Math.cos(a) * r);
      plate.rotation.set(.18, a, .2 * (i % 2 ? 1 : -1));
      this.crown.add(plate);
      const rivet = new THREE.Mesh(fragment, trim);
      rivet.position.set(0, .07, .5);
      plate.add(rivet);
    }
    for (let i = 0; i < 3; i++) {
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.5 + i * .42, .027, 4, 32), trim);
      orbit.rotation.set(.45 + i * .46, i * Math.PI / 3, i * .55);
      this.seal.add(orbit);
    }
    const circle = new THREE.RingGeometry(.9, 1, 52);
    this.ring = new THREE.Mesh(circle, this.ringMat);
    this.telegraph = new THREE.Mesh(circle, this.telegraphMat);
    this.ring.rotation.x = this.telegraph.rotation.x = -Math.PI / 2;
    this.ring.position.y = .085; this.telegraph.position.y = .075;
    this.ring.visible = this.telegraph.visible = false;
    this.group.add(this.ring, this.telegraph);
  }

  onArena(s: PhysicsState) {
    const p = this.arena;
    return s.y >= p.y + .38 && Math.abs(s.x - p.x) < p.hx + .3 && Math.abs(s.z - p.z) < p.hz + .3;
  }

  reset() {
    this.phase = 'idle'; this.elapsed = 0; this.health = this.hearts = 3;
    this.invulnerable = 0; this.waveHit = this.hasEntered = false;
  }

  step(dt: number, s: PhysicsState, unlocked: boolean, cleared: boolean): 'hit' | 'strike' | 'retry' | 'defeated' | undefined {
    this.armed = unlocked;
    if (cleared || this.defeated) { this.phase = 'defeated'; return; }
    if (!unlocked) return;
    if (!this.onArena(s)) {
      if (this.hasEntered) {
        this.reset();
        return 'retry';
      }
      return;
    }
    this.hasEntered = true;
    this.elapsed += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const d = Math.hypot(s.x - this.arena.x, s.z - this.arena.z);
    const pace = this.health === 1 ? 1.25 : 1;
    if (this.phase === 'idle' && this.elapsed >= REST / pace) this.enter('warn');
    if (this.phase === 'warn' && this.elapsed >= WARN / pace) { this.waveHit = false; this.enter('pulse'); }
    if (this.phase === 'pulse') {
      const radius = this.radius();
      if (!this.waveHit && this.invulnerable === 0 && Math.abs(d - radius) < .63 && s.y - this.arena.y < 1.26) {
        this.waveHit = true;
        if (--this.hearts === 0) { this.reset(); return 'retry'; }
        this.invulnerable = 1.5;
        return 'hit';
      }
      if (radius >= MAX_WAVE) this.enter('exposed');
    }
    if (this.phase === 'exposed') {
      if (s.slamLanded && d < 2.1) {
        if (--this.health === 0) { this.enter('defeated'); return 'defeated'; }
        this.enter('idle'); return 'strike';
      }
      if (this.elapsed >= EXPOSED) this.enter('idle');
    }
  }

  private enter(phase: Phase) { this.phase = phase; this.elapsed = 0; }
  private radius() { return .55 + this.elapsed * (this.health === 1 ? 11.3 : 8.8); }

  update(time: number) {
    this.shell.visible = !this.defeated;
    this.seal.visible = !this.armed && !this.defeated;
    this.shell.position.y = (this.phase === 'exposed' ? 1.12 : 2.64) + Math.sin(time * 2.6) * .15;
    this.shell.rotation.y = time * .55;
    this.seal.position.y = this.shell.position.y;
    this.seal.rotation.y = -time * .37;
    this.core.rotation.set(time * .36, -time * .48, .1);
    this.crown.scale.setScalar(this.phase === 'exposed' ? 1.48 : 1);
    this.crystal.color.set(this.phase === 'exposed' ? '#ffe2a8' : this.phase === 'warn' ? '#ed8797' : '#b397f9');
    this.crystal.emissive.copy(this.crystal.color);
    this.crystal.emissiveIntensity = this.phase === 'exposed' ? 1.25 : .46;
    this.ring.visible = this.phase === 'pulse';
    this.ring.scale.setScalar(this.radius());
    this.ringMat.opacity = Math.min(.91, (MAX_WAVE + .3 - this.radius()) * .25);
    this.telegraph.visible = this.phase === 'warn' || this.phase === 'exposed';
    this.telegraph.scale.setScalar(this.phase === 'exposed' ? 2.1 : 1.2 + .72 * Math.sin(this.elapsed * 2));
    this.telegraphMat.color.set(this.phase === 'exposed' ? '#ffe2a8' : '#ed8797');
    this.telegraphMat.opacity = .56 + Math.sin(time * 10) * .23;
  }
}
