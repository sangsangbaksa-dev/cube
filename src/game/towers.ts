import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Obstacle, PhysicsState } from '../physics/world';
import type { Island, World } from '../world/islands';
import { generateCourse } from './courses';
import { createShard } from './monsterModels';
import type { CourseSpec, PlatformSpec } from './types';

// 별의 탑: 기둥 둘레를 나선으로 오르는 파쿠르. 발판은 물리 충돌체이자 메시다.
const COLORS: Record<string, string> = {
  static: '#d8d0ff', moving: '#7fd6ff', crumble: '#e0a56b', bounce: '#ff7ac8', checkpoint: '#8ff0c0', goal: '#ffd36b',
};

interface Plat {
  spec: PlatformSpec;
  ob: Obstacle;
  mesh: THREE.Mesh;
  bx: number; by: number; bz: number;
  crumbleT: number;
  goneT: number;
}

export interface TowerEvents { checkpoint?: { x: number; y: number; z: number }; shard?: string }

export class Tower {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  readonly plats: Plat[] = [];
  readonly course: CourseSpec;
  readonly id: string;
  private readonly shard = createShard();
  private readonly beam: THREE.Mesh;
  collected = false;
  private t = 0;

  constructor(world: World, readonly island: Island) {
    this.id = `tower${island.id}`;
    let course: CourseSpec | null = null;
    for (let s = 0; !course && s < 8; s++) {
      try { course = generateCourse(this.id, island.x, island.z, world.height(island.x, island.z), island.id * 977 + s); } catch { /* 다른 시드로 */ }
    }
    this.course = course!;
    const goal = this.course.platforms[this.course.platforms.length - 1];
    // 가운데 기둥
    const pillarH = goal.y - 0.2 - (island.y - 3);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.4, pillarH, 8), new THREE.MeshLambertMaterial({ color: '#5b4f8a', flatShading: true }));
    pillar.position.set(island.x, island.y - 3 + pillarH / 2, island.z);
    this.group.add(pillar);
    // 기둥을 감는 빛 띠
    for (let k = 0; k < 6; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.06, 4, 24), new THREE.MeshBasicMaterial({ color: '#9fe8ff' }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(island.x, island.y + 4 + k * (pillarH - 6) / 6, island.z);
      this.group.add(ring);
    }
    this.obstacles.push({ x: island.x, z: island.z, r: 2.2, top: goal.y - 0.2 });

    for (const spec of this.course.platforms) {
      const h = spec.thickness;
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(spec.hx * 2, h, spec.hz * 2, 2, 0.12),
        new THREE.MeshLambertMaterial({ color: COLORS[spec.kind], flatShading: true, emissive: COLORS[spec.kind], emissiveIntensity: spec.kind === 'bounce' || spec.kind === 'goal' ? 0.45 : 0.08 }),
      );
      mesh.position.set(spec.x, spec.y - h / 2, spec.z);
      this.group.add(mesh);
      if (spec.kind === 'checkpoint') {
        const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: '#b6ffd9' }));
        lamp.position.set(spec.hx * 0.6, h / 2 + 1.1, spec.hz * 0.6);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 4), new THREE.MeshLambertMaterial({ color: '#4a3d6b' }));
        post.position.set(spec.hx * 0.6, h / 2 + 0.45, spec.hz * 0.6);
        mesh.add(lamp, post);
      }
      const ob: Obstacle = {
        x: spec.x, z: spec.z, r: 0, hx: spec.hx, hz: spec.hz, top: spec.y, collisionBottom: spec.y - h,
        launch: spec.kind === 'bounce' ? spec.launch : undefined, dx: 0, dy: 0, dz: 0,
      };
      this.obstacles.push(ob);
      this.plats.push({ spec, ob, mesh, bx: spec.x, by: spec.y, bz: spec.z, crumbleT: -1, goneT: 0 });
    }
    this.shard.group.position.set(this.course.goal.x, this.course.goal.y, this.course.goal.z);
    this.group.add(this.shard.group);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 1.4, 160, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.beam.position.set(this.course.goal.x, this.course.goal.y + 80, this.course.goal.z);
    this.group.add(this.beam);
  }

  setCollected(c: boolean) {
    this.collected = c;
    this.shard.group.visible = !c;
    this.beam.visible = !c;
  }

  /** 물리 스텝 직전에 호출: 움직이는 발판과 부서지는 발판 */
  step(dt: number, st: PhysicsState) {
    this.t += dt;
    for (const p of this.plats) {
      const ob = p.ob, sp = p.spec;
      ob.dx = ob.dy = ob.dz = 0;
      if (sp.move) {
        const w = Math.sin((this.t / sp.move.period + sp.move.phase) * Math.PI * 2);
        const nx = p.bx + sp.move.ax * w, ny = p.by + sp.move.ay * w, nz = p.bz + sp.move.az * w;
        ob.dx = nx - ob.x; ob.dy = ny - ob.top; ob.dz = nz - ob.z;
        ob.x = nx; ob.z = nz; ob.top = ny; ob.collisionBottom = ny - sp.thickness;
      }
      if (sp.kind === 'crumble') {
        if (p.crumbleT < 0 && p.goneT <= 0 && st.standingOn === ob) p.crumbleT = 0;
        if (p.crumbleT >= 0) {
          p.crumbleT += dt;
          if (p.crumbleT > 0.55) {
            p.crumbleT = -1; p.goneT = 3.2;
            ob.top = -Infinity; ob.collisionBottom = Infinity; // 사라짐: 서지도 막히지도 않는다
          }
        } else if (p.goneT > 0) {
          p.goneT -= dt;
          if (p.goneT <= 0) { ob.top = p.by; ob.collisionBottom = p.by - sp.thickness; }
        }
      }
    }
  }

  /** 렌더 프레임마다: 메시 위치/연출, 체크포인트와 별조각 판정 */
  update(time: number, st: PhysicsState): TowerEvents {
    const ev: TowerEvents = {};
    for (const p of this.plats) {
      const sp = p.spec;
      const m = p.mesh;
      if (sp.kind === 'crumble') {
        const shake = p.crumbleT >= 0 ? Math.sin(time * 70) * 0.06 : 0;
        const gone = p.goneT > 0;
        m.visible = !gone || p.goneT > 2.6;
        m.position.set(p.ob.x + shake, (gone ? p.by - (3.2 - p.goneT) * 8 : p.by) - sp.thickness / 2, p.ob.z);
      } else {
        m.position.set(p.ob.x, p.ob.top - sp.thickness / 2, p.ob.z);
      }
      if (sp.kind === 'checkpoint' && st.standingOn === p.ob) ev.checkpoint = { x: sp.x, y: sp.y + 0.6, z: sp.z };
    }
    this.shard.update(time);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.06 * Math.sin(time * 2);
    const g = this.course.goal;
    if (!this.collected && Math.hypot(st.x - g.x, st.y - g.y, st.z - g.z) < 1.5) ev.shard = this.id;
    return ev;
  }
}
