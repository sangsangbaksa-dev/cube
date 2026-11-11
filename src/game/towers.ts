import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Obstacle, PhysicsState } from '../physics/world';
import { STORY_ROUTE_COUNT, type Site, type World } from '../world/terrain';
import { makeRoute, routeInfo, type RouteCourse } from './routes';
import { buildLandmark } from './landmarks';
import { createShard } from './shard';
import type { PlatformSpec } from './types';
import { CourseMechanisms, phaseState, relayColor } from './course-mechanisms';

// 별의 탑: 기둥 둘레를 나선으로 오르는 파쿠르. 발판은 물리 충돌체이자 메시다.
const COLORS: Partial<Record<PlatformSpec['kind'], string>> = {
  moving: '#8ae4d5', crumble: '#ef9666', bounce: '#f092cd', checkpoint: '#a5efbd', goal: '#ffd98f',
  ice: '#ace9fc', sling: '#ffb77a',
};
const EDGE = new THREE.BoxGeometry();
const OUTLINE = new THREE.EdgesGeometry(EDGE);
const LIGHT = new THREE.OctahedronGeometry(0.27, 0);

interface Plat {
  spec: PlatformSpec;
  ob: Obstacle;
  mesh: THREE.Mesh;
  bx: number; by: number; bz: number;
  crumbleT: number;
  goneT: number;
  ghost?: THREE.LineSegments;
  warning?: THREE.Mesh;
}

export interface TowerEvents { checkpoint?: { x: number; y: number; z: number }; shard?: string }

export class Tower {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  readonly plats: Plat[] = [];
  readonly course: RouteCourse;
  readonly id: string;
  readonly info;
  readonly expedition: boolean;
  readonly mechanisms?: CourseMechanisms;
  readonly relayCount: number;
  readonly cameraBlocks: Obstacle[] = [];
  private readonly shard = createShard();
  private readonly beam: THREE.Mesh;
  private rewardEnabled: boolean;
  collected = false;
  private t = 0;
  private relay = 0;
  get relayStage() { return this.relay; }

  constructor(world: World, readonly island: Site) {
    this.course = makeRoute(island);
    this.id = this.course.id;
    this.info = routeInfo(island);
    this.expedition = island.id > STORY_ROUTE_COUNT;
    this.relayCount = this.course.platforms.filter(sp => sp.relay).length;
    this.rewardEnabled = island.id !== STORY_ROUTE_COUNT;
    buildLandmark(world, island, this.course, this.group, this.obstacles);
    if (this.expedition) this.mechanisms = new CourseMechanisms(this.course, this.group);
    for (const b of this.course.barriers) {
      const ob = { x: b.x, z: b.z, r: 0, hx: b.hx, hz: b.hz, top: b.top, collisionBottom: b.bottom };
      this.obstacles.push(ob);
      this.cameraBlocks.push(ob);
    }

    const surfaces = new Map<string, THREE.MeshLambertMaterial>();
    const sides = new Map<string, THREE.MeshLambertMaterial>();
    const trims = new Map<string, THREE.MeshBasicMaterial>();
    for (const spec of this.course.platforms) {
      const h = spec.thickness;
      const relay = spec.relay ?? spec.requires;
      const tint = relay ? relayColor(relay) : island.id === STORY_ROUTE_COUNT && spec.kind === 'goal' ? '#8e809e' : COLORS[spec.kind] ?? this.info.color;
      if (!surfaces.has(tint)) {
        const col = new THREE.Color(tint);
        surfaces.set(tint, new THREE.MeshLambertMaterial({ color: col, flatShading: true, emissive: col, emissiveIntensity: .18 }));
        sides.set(tint, new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(.35), flatShading: true }));
        trims.set(tint, new THREE.MeshBasicMaterial({ color: col }));
      }
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(spec.hx * 2, h, spec.hz * 2, 1, 0.07),
        sides.get(tint),
      );
      mesh.position.set(spec.x, spec.y - h / 2, spec.z);
      this.group.add(mesh);
      const surface = new THREE.Mesh(EDGE, surfaces.get(tint));
      surface.position.y = h / 2 - .05;
      surface.scale.set(spec.hx * 1.99, .105, spec.hz * 1.99);
      mesh.add(surface);
      for (const f of [-1, 1]) {
        const trim = new THREE.Mesh(EDGE, trims.get(tint));
        trim.scale.set(spec.hx * 1.56, .033, .035);
        trim.position.set(0, h / 2 + .012, f * (spec.hz - .12));
        mesh.add(trim);
      }
      if (spec.kind === 'bounce') {
        const mark = new THREE.Mesh(new THREE.RingGeometry(.38, .47, 4), trims.get(tint));
        mark.rotation.x = -Math.PI / 2;
        mark.position.y = h / 2 + .02;
        mesh.add(mark);
      }
      if (spec.launchVector) {
        const arrow = new THREE.Shape().moveTo(-.2, -.62).lineTo(.2, -.62).lineTo(.2, .08)
          .lineTo(.48, .08).lineTo(0, .68).lineTo(-.48, .08).lineTo(-.2, .08).closePath();
        const glyph = new THREE.Mesh(new THREE.ShapeGeometry(arrow), new THREE.MeshBasicMaterial({ color: '#502b28', side: THREE.DoubleSide }));
        glyph.rotation.order = 'YXZ';
        glyph.rotation.x = -Math.PI / 2;
        glyph.rotation.y = Math.atan2(-spec.launchVector.x, -spec.launchVector.z);
        glyph.position.y = h / 2 + .018;
        mesh.add(glyph);
      }
      if (relay) {
        const dots = new THREE.MeshBasicMaterial({ color: '#35483e' });
        for (let i = 0; i < relay; i++) {
          const dot = new THREE.Mesh(EDGE, dots);
          dot.scale.set(.19, .025, .19);
          dot.rotation.y = Math.PI / 4;
          dot.position.set((i - (relay - 1) / 2) * .37, h / 2 + .02, 0);
          mesh.add(dot);
        }
      }
      let ghost: THREE.LineSegments | undefined, warning: THREE.Mesh | undefined;
      if (spec.kind === 'phase') {
        ghost = new THREE.LineSegments(OUTLINE, new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: .62 }));
        ghost.position.copy(mesh.position);
        ghost.scale.set(spec.hx * 2, h, spec.hz * 2);
        this.group.add(ghost);
        warning = new THREE.Mesh(EDGE, new THREE.MeshBasicMaterial({ color: '#ffe6a1' }));
        warning.position.y = h / 2 + .02;
        warning.scale.set(.38, .036, .38);
        warning.rotation.y = Math.PI / 4;
        mesh.add(warning);
      }
      if (spec.kind === 'checkpoint') {
        const lamp = new THREE.Mesh(LIGHT, trims.get(tint));
        lamp.position.set(spec.hx * 0.6, h / 2 + 1.1, spec.hz * 0.6);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 4), new THREE.MeshLambertMaterial({ color: '#4a3d6b' }));
        post.position.set(spec.hx * 0.6, h / 2 + 0.45, spec.hz * 0.6);
        mesh.add(lamp, post);
      }
      const ob: Obstacle = {
        x: spec.x, z: spec.z, r: 0, hx: spec.hx, hz: spec.hz, top: spec.y, collisionBottom: spec.y - h,
        launch: spec.launch, launchVector: spec.launchVector, ice: spec.kind === 'ice', dx: 0, dy: 0, dz: 0,
      };
      this.obstacles.push(ob);
      this.plats.push({ spec, ob, mesh, bx: spec.x, by: spec.y, bz: spec.z, crumbleT: -1, goneT: 0, ghost, warning });
    }
    this.shard.group.position.set(this.course.goal.x, this.course.goal.y, this.course.goal.z);
    this.group.add(this.shard.group);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, .66, 75, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: this.info.color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    const start = this.course.platforms[0];
    this.beam.position.set(start.x, start.y + 37.5, start.z);
    this.group.add(this.beam);
    this.setCollected(false);
  }

  setCollected(c: boolean) {
    this.collected = c;
    this.shard.group.visible = (!c || this.expedition) && this.rewardEnabled;
    this.beam.visible = !c;
  }

  setRewardEnabled(enabled: boolean) {
    this.rewardEnabled = enabled;
    this.shard.group.visible = enabled && !this.collected;
  }

  resetExpedition() {
    this.relay = 0;
    this.mechanisms?.reset();
  }

  /** 체크포인트로 부활할 때 그 시점의 스위치 단계로 되돌린다 */
  setRelay(n: number) { this.relay = Math.max(0, Math.min(this.relayCount, n)); }

  takeRelay(st: PhysicsState) {
    const pad = this.plats.find(p => p.ob === st.standingOn && p.spec.relay === this.relay + 1);
    if (!pad) return false;
    this.relay++;
    return true;
  }

  swept(st: PhysicsState) { return this.mechanisms?.hit(this.t, st) ?? false; }

  /** 물리 스텝 직전에 호출: 움직이는 발판과 부서지는 발판 */
  step(dt: number, st: PhysicsState) {
    this.t += dt;
    for (const p of this.plats) {
      const ob = p.ob, sp = p.spec;
      ob.dx = ob.dy = ob.dz = 0;
      if (sp.kind === 'phase') {
        const state = sp.phase ? phaseState(sp.phase, this.t) : 'solid';
        ob.disabled = state === 'ghost' || (sp.requires ?? 0) > this.relay;
        p.mesh.visible = !ob.disabled;
        p.ghost!.visible = ob.disabled;
        p.warning!.visible = state === 'warning';
      }
      if (sp.move || sp.orbit) {
        const m = sp.move, o = sp.orbit;
        const { period, phase } = (m ?? o)!;
        const a = (this.t / period + phase) * Math.PI * 2, w = Math.sin(a);
        const nx = p.bx + (m ? m.ax * w : o!.radius * Math.cos(a));
        const ny = p.by + (m ? m.ay * w : 0);
        const nz = p.bz + (m ? m.az * w : o!.radius * w);
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
      if ((!this.collected || this.expedition) && sp.kind === 'checkpoint' && st.standingOn === p.ob) ev.checkpoint = { x: sp.x, y: sp.y + 0.6, z: sp.z };
    }
    this.mechanisms?.draw(this.t);
    this.shard.update(time);
    const start = this.course.platforms[0];
    const beaconFade = this.expedition ? Math.min(1, Math.hypot(start.x - st.x, start.z - st.z) / 10) : 1;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = (0.12 + 0.06 * Math.sin(time * 2)) * beaconFade;
    const g = this.course.goal;
    if ((!this.collected || this.expedition) && this.relay >= this.relayCount && this.rewardEnabled && st.standingOn === this.plats.at(-1)?.ob
      && Math.hypot(st.x - g.x, st.y - g.y, st.z - g.z) < 1.5) ev.shard = this.id;
    return ev;
  }
}
