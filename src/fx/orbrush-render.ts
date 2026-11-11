import * as THREE from 'three';
import { RUSH_RADIUS, type Orb, type OrbKind, type OrbRush } from '../game/orbrush';

// 빛구슬 그림. 구슬은 떠다니며 돌고, 위로 뻗는 빛기둥이 멀리서도 보이게 한다.
// 실행 중일 때만 구역 링과 중심 기둥을 보여준다. 지오메트리는 공유하고 재질은 이 인스턴스가 가진다.

const COLORS: Record<OrbKind, string> = { normal: '#6fe3ff', gold: '#ffd36b', time: '#ff9bd0' };
const BEAM_H = 8;
const CENTER_BEAM_H = 12;

const CORE_GEO = new THREE.OctahedronGeometry(0.4, 0);
const SPHERE_GEO = new THREE.SphereGeometry(0.36, 12, 8);
const RING_GEO = new THREE.TorusGeometry(0.62, 0.035, 6, 28);
const BEAM_GEO = new THREE.CylinderGeometry(0.06, 0.06, BEAM_H, 6, 1, true).translate(0, BEAM_H / 2, 0);
const CENTER_BEAM_GEO = new THREE.CylinderGeometry(0.22, 0.22, CENTER_BEAM_H, 12, 1, true).translate(0, CENTER_BEAM_H / 2, 0);
const FIELD_GEO = new THREE.RingGeometry(RUSH_RADIUS - 0.35, RUSH_RADIUS, 128).rotateX(-Math.PI / 2);

const additive = (color: string, opacity: number) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
});
const solid = (color: string) => new THREE.MeshBasicMaterial({ color, fog: false });

interface Entry {
  root: THREE.Group;
  core: THREE.Mesh;
  ring: THREE.Group | null;
  phase: number;
}

export class OrbRushRender {
  readonly group = new THREE.Group();
  private readonly entries = new Map<number, Entry>();
  private readonly coreMats: Record<OrbKind, THREE.Material>;
  private readonly beamMats: Record<OrbKind, THREE.Material>;
  private readonly ringMat: THREE.Material;
  private readonly fieldMat: THREE.Material;
  private readonly centerMat: THREE.Material;
  private readonly field: THREE.Mesh;
  private readonly centerBeam: THREE.Mesh;

  constructor() {
    this.coreMats = { normal: solid(COLORS.normal), gold: solid(COLORS.gold), time: solid(COLORS.time) };
    this.beamMats = {
      normal: additive(COLORS.normal, 0.35), gold: additive(COLORS.gold, 0.4), time: additive(COLORS.time, 0.35),
    };
    this.ringMat = solid(COLORS.time);
    this.fieldMat = additive('#9de4ff', 0.4);
    this.centerMat = additive('#ffe9a6', 0.3);
    this.field = new THREE.Mesh(FIELD_GEO, this.fieldMat);
    this.centerBeam = new THREE.Mesh(CENTER_BEAM_GEO, this.centerMat);
    this.field.visible = false;
    this.centerBeam.visible = false;
    this.group.add(this.field, this.centerBeam);
  }

  /** 현재 판에 맞춘다. time은 초 단위 시계. 매 프레임 불러도 된다 */
  sync(rush: OrbRush, time: number) {
    const c = rush.center;
    const running = rush.state === 'running' && c !== null;
    this.field.visible = running;
    this.centerBeam.visible = running;
    if (!running || !c) {
      this.clearOrbs();
      return;
    }

    this.field.position.set(c.x, c.y + 0.15, c.z);
    this.centerBeam.position.set(c.x, c.y, c.z);
    (this.fieldMat as THREE.MeshBasicMaterial).opacity = 0.3 + 0.12 * Math.sin(time * 2.2);

    const seen = new Set<number>();
    for (const o of rush.orbs) {
      seen.add(o.id);
      let e = this.entries.get(o.id);
      if (!e) {
        e = this.create(o);
        this.entries.set(o.id, e);
        this.group.add(e.root);
      }
      this.update(e, o, time);
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      this.group.remove(e.root);
      this.entries.delete(id);
    }
  }

  /** 자원 해제 */
  dispose() {
    this.clearOrbs();
    for (const m of [...Object.values(this.coreMats), ...Object.values(this.beamMats),
      this.ringMat, this.fieldMat, this.centerMat]) m.dispose();
    this.group.clear();
  }

  private clearOrbs() {
    for (const e of this.entries.values()) this.group.remove(e.root);
    this.entries.clear();
  }

  private create(o: Orb): Entry {
    const root = new THREE.Group();
    const core = new THREE.Mesh(o.kind === 'time' ? SPHERE_GEO : CORE_GEO, this.coreMats[o.kind]);
    if (o.kind === 'gold') core.scale.setScalar(1.25);
    const beam = new THREE.Mesh(BEAM_GEO, this.beamMats[o.kind]);
    beam.position.y = 0.3;
    root.add(core, beam);

    let ring: THREE.Group | null = null;
    if (o.kind === 'time') {
      // 시계 구슬은 가로로 도는 작은 링을 달고 있다
      ring = new THREE.Group();
      const torus = new THREE.Mesh(RING_GEO, this.ringMat);
      torus.rotation.x = Math.PI / 2;
      ring.add(torus);
      root.add(ring);
    }
    return { root, core, ring, phase: (o.id * 2.3) % (Math.PI * 2) };
  }

  private update(e: Entry, o: Orb, time: number) {
    e.root.position.set(o.x, o.y, o.z);
    const bob = Math.sin(time * 2 + e.phase) * 0.25;
    e.core.position.y = bob;
    e.core.rotation.set(time * 0.8 + e.phase, time * 1.3, 0);
    if (e.ring) {
      e.ring.position.y = bob;
      e.ring.rotation.y = time * 2 + e.phase;
    }
  }
}
