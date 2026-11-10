import * as THREE from 'three';
import { HALF, type PhysicsState } from '../physics/world';
import type { World } from '../world/islands';
import type { HitBox } from './combat';
import { createMonsterModel, createOrb, type MonsterModel } from './monsterModels';
import type { BaseKind, MonsterAnim, MonsterKind } from './types';

// 몬스터 AI와 플레이어와의 주고받기. 렌더 프레임 단위로 돈다.
type Phase = 'idle' | 'windup' | 'attack' | 'recover';

interface Def { hp: number; dmg: number; speed: number; aggro: number; gems: number; fly: boolean; ai: BaseKind; scale: number; boss?: string }
const DEFS: Record<MonsterKind, Def> = {
  slime: { hp: 2, dmg: 1, speed: 4.5, aggro: 13, gems: 2, fly: false, ai: 'slime', scale: 1 },
  spiker: { hp: 3, dmg: 1, speed: 1.6, aggro: 15, gems: 3, fly: false, ai: 'spiker', scale: 1 },
  bat: { hp: 1, dmg: 1, speed: 6, aggro: 18, gems: 1, fly: true, ai: 'bat', scale: 1 },
  caster: { hp: 3, dmg: 1, speed: 3, aggro: 19, gems: 3, fly: false, ai: 'caster', scale: 1 },
  golem: { hp: 18, dmg: 2, speed: 2.3, aggro: 30, gems: 15, fly: false, ai: 'golem', scale: 1, boss: '바위 골렘' },
  bigslime: { hp: 6, dmg: 1, speed: 4, aggro: 14, gems: 4, fly: false, ai: 'slime', scale: 1.9 },
  batking: { hp: 16, dmg: 2, speed: 7, aggro: 30, gems: 15, fly: true, ai: 'bat', scale: 2.8, boss: '그림자 박쥐왕' },
  eyelord: { hp: 16, dmg: 2, speed: 3.2, aggro: 30, gems: 15, fly: false, ai: 'caster', scale: 2.3, boss: '눈알 대마법사' },
};

export class Monster {
  readonly model: MonsterModel;
  readonly def: Def;
  x: number; y: number; z: number;
  vx = 0; vy = 0; vz = 0;
  yaw = Math.random() * 6;
  hp: number;
  phase: Phase = 'idle';
  pt = Math.random() * 2;
  cd = 1 + Math.random();
  hurt = 0;
  dying = -1;
  grounded = true;
  lastHit = 0;
  dirX = 0; dirZ = 1;
  /** 소속 균열 (있으면 그 근처를 벗어나지 않는다) */
  owner: string | null = null;
  homeX: number; homeZ: number;
  readonly anim: MonsterAnim = { time: 0, moving: 0, airborne: false, vy: 0, telegraph: 0, attacking: false, hurt: 0, dying: 0, night: 0 };

  constructor(readonly kind: MonsterKind, x: number, y: number, z: number) {
    this.def = DEFS[kind];
    this.hp = this.def.hp;
    this.model = createMonsterModel(this.def.ai);
    const sc = this.def.scale;
    if (sc !== 1) { this.model.group.scale.setScalar(sc); this.model.height *= sc; this.model.radius *= sc; }
    this.x = this.homeX = x; this.y = y; this.z = this.homeZ = z;
  }
  get alive() { return this.dying < 0; }
  get cy() { return this.y + this.model.height / 2; }
}

interface Orb { mesh: THREE.Object3D; upd: (t: number) => void; dispose: () => void; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; reflected: boolean }
interface Wave { mesh: THREE.Mesh; x: number; y: number; z: number; r: number; hit: boolean }
interface Pickup { mesh: THREE.Mesh; x: number; y: number; z: number; vy: number; kind: 'gem' | 'heart'; t: number }

export interface Hooks {
  hurtPlayer(dmg: number, fromX: number, fromZ: number): boolean;
  bouncePlayer(): void;
  onKill(m: Monster): void;
  onHit(m: Monster, x: number, y: number, z: number, big: boolean): void;
  onPickup(kind: 'gem' | 'heart' | 'core'): void;
  shake(a: number): void;
  sfx(name: 'orbShoot' | 'orbReflect' | 'roar' | 'slam' | 'enemyHurt' | 'stompHurt'): void;
  playerSafe: boolean;
  playerHp01: number;
}

const gemGeo = new THREE.OctahedronGeometry(0.22, 0);
const gemMat = new THREE.MeshLambertMaterial({ color: '#7ff0ff', emissive: '#38c8ff', emissiveIntensity: 0.8, flatShading: true });
const heartGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.3); s.bezierCurveTo(-0.5, 0, -0.3, 0.35, 0, 0.15); s.bezierCurveTo(0.3, 0.35, 0.5, 0, 0, -0.3);
  return new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
})();
const heartMat = new THREE.MeshLambertMaterial({ color: '#ff6f9a', emissive: '#ff3d7a', emissiveIntensity: 0.6 });
const waveMat = new THREE.MeshBasicMaterial({ color: '#c58bff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class Monsters {
  readonly group = new THREE.Group();
  readonly list: Monster[] = [];
  private readonly orbs: Orb[] = [];
  private readonly waves: Wave[] = [];
  private readonly pickups: Pickup[] = [];
  private dashId = 0;
  private lastDash = false;

  constructor(private readonly world: World) {}

  spawn(kind: MonsterKind, x: number, z: number, owner: string | null = null): Monster {
    const g = this.world.height(x, z);
    const m = new Monster(kind, x, g + (DEFS[kind].fly ? 3.5 : 0), z);
    m.owner = owner;
    m.model.group.position.set(m.x, m.y, m.z);
    this.group.add(m.model.group);
    this.list.push(m);
    return m;
  }

  remove(m: Monster) {
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(m.model.group);
    m.model.dispose();
  }

  clearOwned(owner: string) {
    for (const m of [...this.list]) if (m.owner === owner) this.remove(m);
  }

  /** 땅 위를 걸을 수 있는가: 허공이나 큰 낭떠러지는 피한다 */
  private walkable(m: Monster, x: number, z: number): boolean {
    const h = this.world.height(x, z);
    return h > m.y - 2.5 && h < m.y + 1.5 + (m.grounded ? 0 : 3);
  }

  /** 대시 판정 번호 갱신 (대시가 새로 시작될 때마다) */
  private dashKey(st: PhysicsState) {
    const on = st.dashT > 0;
    if (on && !this.lastDash) this.dashId = -(Date.now() % 1e9) - Math.random();
    this.lastDash = on;
    return on ? this.dashId : 0;
  }

  /** 내려찍기 충격파 */
  slamImpact(x: number, y: number, z: number, power: number, hooks: Hooks, bonus = 0) {
    const radius = 2.6 + power * 2 + bonus;
    const dmg = power > 0.6 ? 3 : 2;
    for (const m of this.list) {
      if (!m.alive) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < radius + m.model.radius && Math.abs(m.cy - y) < 3) this.damage(m, dmg, (m.x - x) / (d || 1), (m.z - z) / (d || 1), 11, hooks, true);
    }
  }

  private damage(m: Monster, dmg: number, nx: number, nz: number, knock: number, hooks: Hooks, big: boolean) {
    if (m.kind === 'spiker' && m.phase === 'recover') dmg *= 2; // 어지러울 때 약점
    m.hp -= dmg;
    m.hurt = 1;
    const kb = m.def.boss ? knock * 0.15 : knock;
    m.vx = nx * kb; m.vz = nz * kb;
    if (!m.def.fly && !m.def.boss) { m.vy = 6; m.grounded = false; }
    if ((m.def.ai === 'bat' || m.def.ai === 'caster') && !m.def.boss) { m.phase = 'recover'; m.pt = 0.5; }
    hooks.onHit(m, m.x, m.cy, m.z, big);
    if (m.hp <= 0) {
      m.dying = 0;
      hooks.onKill(m);
      this.drop(m, hooks);
    } else hooks.sfx('enemyHurt');
  }

  private drop(m: Monster, hooks: Hooks) {
    const n = m.def.gems;
    for (let k = 0; k < n; k++) this.addPickup('gem', m.x, m.cy, m.z);
    if (m.def.boss) this.coreDrop(m, hooks);
    if (m.kind === 'bigslime') for (let k = 0; k < 2; k++) { const c = this.spawn('slime', m.x + (k ? 1 : -1), m.z); c.owner = m.owner; c.homeX = m.homeX; c.homeZ = m.homeZ; }
    if (m.def.boss || (hooks.playerHp01 < 1 && Math.random() < 0.22)) this.addPickup('heart', m.x, m.cy, m.z);
  }

  private coreDrop(m: Monster, hooks: Hooks) { void m; hooks.onPickup('core'); }

  private addPickup(kind: 'gem' | 'heart', x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(kind === 'gem' ? gemGeo : heartGeo, kind === 'gem' ? gemMat : heartMat);
    const a = Math.random() * 6;
    const p: Pickup = { mesh, x: x + Math.cos(a) * 0.6, y, z: z + Math.sin(a) * 0.6, vy: 5 + Math.random() * 3, kind, t: 0 };
    this.group.add(mesh);
    this.pickups.push(p);
  }

  update(dt: number, time: number, st: PhysicsState, hit: HitBox | null, night: number, hooks: Hooks) {
    const px = st.x, py = st.y, pz = st.z;
    const dashKey = this.dashKey(st);
    const playerInvuln = st.dashT > 0;

    for (const m of [...this.list]) {
      const mdl = m.model;
      m.hurt = Math.max(0, m.hurt - dt * 4);
      if (!m.alive) {
        m.dying += dt * 2.2;
        if (m.dying >= 1) { this.remove(m); continue; }
        this.render(m, time, night, dt);
        continue;
      }
      const dx = px - m.x, dz = pz - m.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const ux = dx / dist, uz = dz / dist;
      const aggro = !hooks.playerSafe && (dist < m.def.aggro || (m.owner !== null && dist < 40)) && Math.abs(py - m.y) < 14;
      m.pt -= dt; m.cd -= dt;
      const ground = this.world.height(m.x, m.z);
      let tvx = 0, tvz = 0, faceX = ux, faceZ = uz, telegraph = 0;

      switch (m.def.ai) {
        case 'slime': {
          if (m.grounded && m.pt <= 0) {
            const a = aggro ? Math.atan2(uz, ux) + (Math.random() - 0.5) * 0.5 : Math.random() * Math.PI * 2;
            const sp = aggro ? m.def.speed : 2;
            m.vx = Math.cos(a) * sp; m.vz = Math.sin(a) * sp;
            m.vy = aggro ? 8.5 : 6; m.grounded = false;
            m.pt = aggro ? 0.55 + Math.random() * 0.4 : 1.4 + Math.random() * 2;
            m.dirX = Math.cos(a); m.dirZ = Math.sin(a);
          }
          faceX = m.dirX; faceZ = m.dirZ;
          break;
        }
        case 'spiker': {
          if (m.phase === 'idle') {
            if (aggro && dist < 13 && m.cd <= 0) { m.phase = 'windup'; m.pt = 0.6; }
            else if (aggro) { tvx = ux * m.def.speed; tvz = uz * m.def.speed; }
          } else if (m.phase === 'windup') {
            telegraph = 1 - m.pt / 0.6;
            m.dirX = ux; m.dirZ = uz;
            if (m.pt <= 0) { m.phase = 'attack'; m.pt = 0.75; }
          } else if (m.phase === 'attack') {
            tvx = m.dirX * 13; tvz = m.dirZ * 13; faceX = m.dirX; faceZ = m.dirZ;
            if (m.pt <= 0 || !this.walkable(m, m.x + m.dirX, m.z + m.dirZ)) { m.phase = 'recover'; m.pt = 1.1; }
          } else if (m.pt <= 0) { m.phase = 'idle'; m.cd = 0.8; }
          break;
        }
        case 'bat': {
          const hoverY = ground + 3.2 * (m.def.boss ? 1.6 : 1) + Math.sin(time * 2 + m.homeX) * 0.4;
          let ty = hoverY;
          if (m.phase === 'idle') {
            const a = time * 0.9 + m.homeZ;
            const cx = aggro ? px + Math.cos(a) * 4 : m.homeX + Math.cos(a) * 5;
            const cz = aggro ? pz + Math.sin(a) * 4 : m.homeZ + Math.sin(a) * 5;
            tvx = (cx - m.x) * 1.5; tvz = (cz - m.z) * 1.5;
            if (aggro) ty = py + 2.8;
            if (aggro && m.cd <= 0 && dist < (m.def.boss ? 14 : 9)) { m.phase = 'windup'; m.pt = m.def.boss ? 0.7 : 0.45; }
          } else if (m.phase === 'windup') {
            telegraph = 1 - m.pt / 0.45; ty = m.y;
            if (m.pt <= 0) {
              const d3 = Math.hypot(dx, py - m.y, dz) || 1;
              m.dirX = dx / d3; m.dirZ = dz / d3; m.vy = ((py - m.y) / d3) * 11;
              m.phase = 'attack'; m.pt = 0.7;
            }
          } else if (m.phase === 'attack') {
            tvx = m.dirX * 11; tvz = m.dirZ * 11; ty = NaN;
            if (m.pt <= 0 || m.y < ground + 0.5) { m.phase = 'recover'; m.pt = 0.9; }
          } else { ty = hoverY + 1; if (m.pt <= 0) { m.phase = 'idle'; m.cd = 1.8 + Math.random(); } }
          const sp = Math.hypot(tvx, tvz), mx = m.phase === 'attack' ? 11 : m.def.speed;
          if (sp > mx) { tvx *= mx / sp; tvz *= mx / sp; }
          if (!Number.isNaN(ty)) m.vy += ((ty - m.y) * 3 - m.vy) * Math.min(1, dt * 4);
          break;
        }
        case 'caster': {
          if (m.phase === 'idle') {
            if (aggro) {
              const want = dist < 8 ? -1 : dist > 13 ? 1 : 0;
              const side = Math.sin(time * 0.7 + m.homeX) > 0 ? 1 : -1;
              tvx = (ux * want - uz * side * 0.6) * m.def.speed; tvz = (uz * want + ux * side * 0.6) * m.def.speed;
              if (m.cd <= 0 && dist < 18) { m.phase = 'windup'; m.pt = 0.75; }
            }
          } else if (m.phase === 'windup') {
            telegraph = 1 - m.pt / 0.75;
            if (m.pt <= 0) {
              this.shoot(m, st, hooks, 0);
              if (m.def.boss) { this.shoot(m, st, hooks, 0.35); this.shoot(m, st, hooks, -0.35); }
              m.phase = 'recover'; m.pt = 0.5;
            }
          } else if (m.pt <= 0) { m.phase = 'idle'; m.cd = 2.2 + Math.random(); }
          break;
        }
        case 'golem': {
          if (m.phase === 'idle') {
            if (aggro) { tvx = ux * m.def.speed; tvz = uz * m.def.speed; }
            if (aggro && dist < 5.5 && m.cd <= 0) { m.phase = 'windup'; m.pt = 0.9; hooks.sfx('roar'); }
          } else if (m.phase === 'windup') {
            telegraph = 1 - m.pt / 0.9;
            if (m.pt <= 0) { m.phase = 'attack'; m.pt = 0.25; }
          } else if (m.phase === 'attack') {
            if (m.pt <= 0) {
              const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), waveMat);
              mesh.rotation.x = -Math.PI / 2;
              this.waves.push({ mesh, x: m.x + m.dirX * 1.5, y: ground + 0.15, z: m.z + m.dirZ * 1.5, r: 0.5, hit: false });
              this.group.add(mesh);
              hooks.shake(0.6); hooks.sfx('slam');
              m.phase = 'recover'; m.pt = 1.3;
            }
          } else if (m.pt <= 0) { m.phase = 'idle'; m.cd = 0.7; }
          if (m.phase !== 'attack') { m.dirX = ux; m.dirZ = uz; }
          break;
        }
      }

      // 이동 적분: 걷는 몬스터는 목표 속도로, 넉백은 서서히 줄어든다
      if (m.def.fly) {
        m.vx += (tvx - m.vx) * Math.min(1, dt * 5);
        m.vz += (tvz - m.vz) * Math.min(1, dt * 5);
        m.x += m.vx * dt; m.z += m.vz * dt; m.y += m.vy * dt;
        const g2 = this.world.height(m.x, m.z);
        if (m.y < g2 + 0.3) { m.y = g2 + 0.3; m.vy = Math.max(0, m.vy); }
      } else {
        if (m.grounded && m.kind !== 'slime') {
          const k = Math.min(1, dt * (m.hurt > 0.5 ? 2 : 10));
          m.vx += (tvx - m.vx) * k; m.vz += (tvz - m.vz) * k;
        } else if (m.grounded) { m.vx *= Math.max(0, 1 - dt * 10); m.vz *= Math.max(0, 1 - dt * 10); }
        const nx = m.x + m.vx * dt, nz = m.z + m.vz * dt;
        if (this.walkable(m, nx, nz) && !(hooks.playerSafe && Math.hypot(px - nx, pz - nz) < dist - 0.01 && m.owner === null)) { m.x = nx; m.z = nz; }
        else { m.vx *= -0.3; m.vz *= -0.3; }
        if (m.def.ai === 'caster') {
          m.y += (this.world.height(m.x, m.z) + 0.8 + Math.sin(time * 2 + m.homeX) * 0.2 - m.y) * Math.min(1, dt * 5);
          m.grounded = true;
        } else {
          m.vy -= 30 * dt;
          m.y += m.vy * dt;
          const g2 = this.world.height(m.x, m.z);
          if (m.y <= g2) { m.y = g2; m.vy = 0; m.grounded = true; } else if (m.y > g2 + 0.05) m.grounded = false;
        }
      }
      // 균열 수호 몬스터는 균열을 멀리 벗어나지 않는다
      if (m.owner) {
        const hx = m.x - m.homeX, hz = m.z - m.homeZ, hd = Math.hypot(hx, hz);
        if (hd > 16) { m.x = m.homeX + hx / hd * 16; m.z = m.homeZ + hz / hd * 16; }
      }
      if (m.y < -60) { this.remove(m); continue; }
      if (faceX * faceX + faceZ * faceZ > 0.01) {
        const want = Math.atan2(faceX, faceZ);
        let d = want - m.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        m.yaw += d * Math.min(1, dt * 8);
      }
      m.anim.telegraph = telegraph;

      // ---- 플레이어와의 접촉 ----
      const r = mdl.radius;
      const pd = Math.hypot(px - m.x, pz - m.z);
      const feet = py - HALF;
      if (hit && m.lastHit !== hit.id && Math.hypot(pd, py - m.cy) < hit.radius + r * 0.8) {
        m.lastHit = hit.id;
        this.damage(m, hit.damage, -ux, -uz, hit.knock, hooks, hit.combo === 3);
      } else if (dashKey && m.lastHit !== dashKey && pd < r + 0.7 && Math.abs(py - m.cy) < mdl.height / 2 + 0.6) {
        m.lastHit = dashKey;
        this.damage(m, 1, -ux, -uz, 9, hooks, false);
      } else if (pd < r + HALF * 0.8 && feet < m.y + mdl.height && py + HALF > m.y) {
        const stompable = st.vy < -1 && feet > m.y + mdl.height * 0.55;
        if (stompable) {
          if (m.kind === 'spiker' && m.phase !== 'recover') {
            hooks.bouncePlayer();
            hooks.hurtPlayer(1, m.x, m.z);
            hooks.sfx('stompHurt');
          } else {
            const slam = st.slamming;
            hooks.bouncePlayer();
            this.damage(m, (m.def.boss ? 2 : 1) + (slam ? 1 : 0), 0, 0, 0, hooks, slam);
          }
        } else if (!playerInvuln && m.hurt < 0.5) {
          hooks.hurtPlayer(m.def.dmg, m.x, m.z);
        }
      }
      this.render(m, time, night, dt);
    }

    // 몬스터끼리 밀어내기
    for (let a = 0; a < this.list.length; a++) for (let b = a + 1; b < this.list.length; b++) {
      const p = this.list[a], q = this.list[b];
      const ddx = q.x - p.x, ddz = q.z - p.z, d = Math.hypot(ddx, ddz), min = p.model.radius + q.model.radius;
      if (d > 0.001 && d < min && Math.abs(p.y - q.y) < 1.5) {
        const push = (min - d) / 2;
        p.x -= ddx / d * push; p.z -= ddz / d * push; q.x += ddx / d * push; q.z += ddz / d * push;
      }
    }

    this.updateOrbs(dt, time, st, hit, hooks);
    this.updateWaves(dt, st, hooks);
    this.updatePickups(dt, time, st, hooks);
  }

  private render(m: Monster, time: number, night: number, dt: number) {
    const a = m.anim;
    a.time = time; a.moving = Math.min(1, Math.hypot(m.vx, m.vz) / 6); a.airborne = !m.grounded; a.vy = m.vy;
    a.attacking = m.phase === 'attack'; a.hurt = m.hurt; a.dying = Math.max(0, m.dying); a.night = night;
    m.model.group.position.set(m.x, m.y, m.z);
    m.model.group.rotation.y = m.yaw;
    m.model.update(dt, a);
  }

  /** 별빛 지팡이의 별탄: 되받아친 구슬처럼 몬스터만 맞힌다 */
  fireBolt(x: number, y: number, z: number, dx: number, dz: number) {
    const o = createOrb();
    o.mesh.scale.setScalar(0.7);
    this.orbs.push({ mesh: o.mesh, upd: o.update, dispose: o.dispose, x, y, z, vx: dx * 16, vy: 0, vz: dz * 16, life: 1.1, reflected: true });
    this.group.add(o.mesh);
  }

  private shoot(m: Monster, st: PhysicsState, hooks: Hooks, spread: number) {
    const o = createOrb();
    const sx = m.x, sy = m.y + m.model.height * 0.7, sz = m.z;
    const t = Math.hypot(st.x - sx, st.z - sz) / 9;
    const tx = st.x + st.vx * t * 0.5, ty = st.y, tz = st.z + st.vz * t * 0.5;
    const d = Math.hypot(tx - sx, ty - sy, tz - sz) || 1;
    const c = Math.cos(spread), sn = Math.sin(spread);
    const vx = (tx - sx) / d * 9, vz = (tz - sz) / d * 9;
    this.orbs.push({ mesh: o.mesh, upd: o.update, dispose: o.dispose, x: sx, y: sy, z: sz, vx: vx * c - vz * sn, vy: (ty - sy) / d * 9, vz: vx * sn + vz * c, life: 4, reflected: false });
    this.group.add(o.mesh);
    hooks.sfx('orbShoot');
  }

  private updateOrbs(dt: number, time: number, st: PhysicsState, hit: HitBox | null, hooks: Hooks) {
    for (let k = this.orbs.length - 1; k >= 0; k--) {
      const o = this.orbs[k];
      o.life -= dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      o.mesh.position.set(o.x, o.y, o.z);
      o.upd(time);
      let dead = o.life <= 0 || o.y < this.world.height(o.x, o.z);
      const pd = Math.hypot(st.x - o.x, st.y - o.y, st.z - o.z);
      if (!dead && !o.reflected && hit && pd < hit.radius + 0.4) {
        // 회전 공격으로 되받아치면 가장 가까운 몬스터에게 날아간다
        const target = this.list.filter((m) => m.alive).sort((p, q) => Math.hypot(p.x - o.x, p.z - o.z) - Math.hypot(q.x - o.x, q.z - o.z))[0];
        const tx = target ? target.x : o.x - o.vx, ty = target ? target.cy : o.y, tz = target ? target.z : o.z - o.vz;
        const d = Math.hypot(tx - o.x, ty - o.y, tz - o.z) || 1;
        o.vx = (tx - o.x) / d * 16; o.vy = (ty - o.y) / d * 16; o.vz = (tz - o.z) / d * 16;
        o.reflected = true; o.life = 2;
        hooks.sfx('orbReflect');
      } else if (!dead && !o.reflected && pd < 0.75) {
        if (st.dashT <= 0) hooks.hurtPlayer(1, o.x, o.z);
        dead = true;
      } else if (!dead && o.reflected) {
        for (const m of this.list) {
          if (m.alive && Math.hypot(m.x - o.x, m.cy - o.y, m.z - o.z) < m.model.radius + 0.5) {
            this.damage(m, 2, o.vx / 16, o.vz / 16, 6, hooks, true);
            dead = true;
            break;
          }
        }
      }
      if (dead) { this.group.remove(o.mesh); o.dispose(); this.orbs.splice(k, 1); }
    }
  }

  private updateWaves(dt: number, st: PhysicsState, hooks: Hooks) {
    for (let k = this.waves.length - 1; k >= 0; k--) {
      const w = this.waves[k];
      w.r += dt * 10;
      w.mesh.position.set(w.x, w.y, w.z);
      w.mesh.scale.setScalar(w.r);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - w.r / 10);
      const d = Math.hypot(st.x - w.x, st.z - w.z);
      // 땅에 붙어 있으면 맞는다: 점프로 넘으면 된다
      if (!w.hit && Math.abs(d - w.r) < 0.7 && st.y - HALF - w.y < 0.6 && st.dashT <= 0) {
        w.hit = true;
        hooks.hurtPlayer(1, w.x, w.z);
      }
      if (w.r > 10) { this.group.remove(w.mesh); w.mesh.geometry.dispose(); this.waves.splice(k, 1); }
    }
  }

  private updatePickups(dt: number, time: number, st: PhysicsState, hooks: Hooks) {
    for (let k = this.pickups.length - 1; k >= 0; k--) {
      const p = this.pickups[k];
      p.t += dt;
      const d = Math.hypot(st.x - p.x, st.y - p.y, st.z - p.z);
      if (p.t > 0.5 && d < 4.5) {
        const s = Math.min(1, dt * 9);
        p.x += (st.x - p.x) * s; p.y += (st.y - p.y) * s; p.z += (st.z - p.z) * s;
      } else {
        p.vy -= 18 * dt; p.y += p.vy * dt;
        const g = this.world.height(p.x, p.z) + 0.35;
        if (p.y < g) { p.y = g; p.vy = 0; }
      }
      p.mesh.position.set(p.x, p.y + Math.sin(time * 3 + k) * 0.08, p.z);
      p.mesh.rotation.y = time * 2.5 + k;
      if ((p.t > 0.5 && d < 0.9) || p.t > 25) {
        if (p.t <= 25) hooks.onPickup(p.kind);
        this.group.remove(p.mesh);
        this.pickups.splice(k, 1);
      }
    }
  }

  /** 근처에서 싸우고 있는 몬스터 수 (음악/연출용) */
  threat(x: number, z: number): { level: number; boss: Monster | null } {
    let n = 0, boss: Monster | null = null;
    for (const m of this.list) {
      if (!m.alive) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < m.def.aggro) n += m.def.boss ? 3 : 1;
      if (m.def.boss && d < 40) boss = m;
    }
    return { level: Math.min(1, n / 4), boss };
  }
}

