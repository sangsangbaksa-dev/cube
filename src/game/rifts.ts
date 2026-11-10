import * as THREE from 'three';
import type { PhysicsState } from '../physics/world';
import type { Island, World } from '../world/islands';
import type { HitBox } from './combat';
import { createRiftCore, createShard } from './monsterModels';
import type { Monster, Monsters } from './monsters';
import type { MonsterKind } from './types';

// 어둠의 균열: 다가가면 몬스터가 파도처럼 몰려오고, 마지막에 바위 골렘이 나온다.
// 골렘을 쓰러뜨리면 핵이 약해지고, 핵을 부수면 정화되며 별조각이 나온다.
export type RiftState = 'dormant' | 'fight' | 'core' | 'shard' | 'cleansed';
export interface RiftEvents { started?: boolean; wave?: number; boss?: Monster; coreOpen?: boolean; coreHit?: boolean; cleansed?: boolean; shard?: string; reset?: boolean }

const CORE_HP = 5;

export class Rift {
  readonly group = new THREE.Group();
  readonly id: string;
  state: RiftState = 'dormant';
  private wave = 0;
  private coreHp = CORE_HP;
  private readonly core = createRiftCore();
  private readonly shard = createShard();
  private readonly beam: THREE.Mesh;
  private readonly floor: THREE.Mesh;
  private lastHit = 0;
  private readonly cx: number; private readonly cz: number; private readonly cy: number;

  constructor(world: World, readonly island: Island, private readonly monsters: Monsters, private readonly bossKind: MonsterKind = 'golem') {
    this.id = `rift${island.id}`;
    this.cx = island.x; this.cz = island.z; this.cy = world.height(island.x, island.z);
    this.core.group.position.set(this.cx, this.cy, this.cz);
    this.shard.group.position.set(this.cx, this.cy + 2.2, this.cz);
    this.shard.group.visible = false;
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(15, 40), new THREE.MeshBasicMaterial({ color: '#2a0d4a', transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(this.cx, this.cy + 0.05, this.cz);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 2.2, 180, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#a14dff', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.beam.position.set(this.cx, this.cy + 95, this.cz);
    this.group.add(this.core.group, this.shard.group, this.floor, this.beam);
  }

  get center() { return { x: this.cx, y: this.cy, z: this.cz }; }

  setCleansed() {
    this.state = 'cleansed';
    this.beam.visible = false;
    this.floor.visible = false;
    this.shard.group.visible = false;
  }

  /** 플레이어가 쓰러지면 싸움을 처음으로 되돌린다 */
  reset() {
    if (this.state !== 'fight' && this.state !== 'core') return;
    this.monsters.clearOwned(this.id);
    this.state = 'dormant';
    this.wave = 0;
    this.coreHp = CORE_HP;
  }

  private spawnWave(night: number): Monster | undefined {
    const waves: MonsterKind[][] = [
      ['slime', 'slime', 'slime', 'spiker'],
      night > 0.4 ? ['caster', 'caster', 'slime', 'bat', 'bat'] : ['caster', 'caster', 'slime', 'slime', 'spiker'],
      [this.bossKind, 'bigslime', 'slime'],
    ];
    let boss: Monster | undefined;
    const list = waves[this.wave];
    list.forEach((k, n) => {
      const a = (n / list.length) * Math.PI * 2 + this.wave;
      const d = k === this.bossKind ? 6 : 9 + (n % 2) * 2;
      const m = this.monsters.spawn(k, this.cx + Math.cos(a) * d, this.cz + Math.sin(a) * d, this.id);
      m.homeX = this.cx; m.homeZ = this.cz;
      m.cd = 1.5;
      if (k === this.bossKind) boss = m;
    });
    return boss;
  }

  update(dt: number, time: number, st: PhysicsState, hit: HitBox | null, slam: number, night: number): RiftEvents {
    const ev: RiftEvents = {};
    const d = Math.hypot(st.x - this.cx, st.z - this.cz);
    this.core.update(time, this.state === 'core' ? this.coreHp / CORE_HP : 1, this.state !== 'cleansed' && this.state !== 'shard');
    this.shard.update(time);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.08 * Math.sin(time * 1.7) + night * 0.1;
    void dt;
    switch (this.state) {
      case 'dormant':
        if (d < 19 && Math.abs(st.y - this.cy) < 8) {
          this.state = 'fight'; this.wave = 0; ev.started = true;
          this.spawnWave(night); ev.wave = 1;
        }
        break;
      case 'fight': {
        if (d > 46) { this.reset(); ev.reset = true; break; }
        const left = this.monsters.list.filter((m) => m.owner === this.id && m.alive).length;
        if (left === 0) {
          this.wave++;
          if (this.wave >= 3) { this.state = 'core'; ev.coreOpen = true; }
          else { const b = this.spawnWave(night); ev.wave = this.wave + 1; if (b) ev.boss = b; }
        }
        break;
      }
      case 'core': {
        if (d > 46) { this.reset(); ev.reset = true; break; }
        const cd = Math.hypot(st.x - this.cx, st.y - (this.cy + 1.8), st.z - this.cz);
        const struck = (hit && hit.id !== this.lastHit && cd < hit.radius + 1) || (slam > 0 && d < 4);
        if (struck) {
          if (hit) this.lastHit = hit.id;
          this.coreHp -= slam > 0 ? 2 : hit!.damage;
          this.core.flash();
          ev.coreHit = true;
          if (this.coreHp <= 0) {
            this.state = 'shard';
            this.shard.group.visible = true;
            this.beam.visible = false;
            ev.cleansed = true;
          }
        }
        break;
      }
      case 'shard':
        (this.floor.material as THREE.MeshBasicMaterial).opacity *= 0.98;
        if (Math.hypot(st.x - this.cx, st.y - (this.cy + 2.2), st.z - this.cz) < 1.8) {
          ev.shard = this.id;
          this.setCleansed();
        }
        break;
    }
    return ev;
  }
}
