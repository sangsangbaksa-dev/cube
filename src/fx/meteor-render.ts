import * as THREE from 'three';
import type { Meteor } from '../game/meteors';

// 별똥별 그림. 낙하 중에는 머리+꼬리, 착지 후에는 금빛 별 조각과 빛기둥.
// 지오메트리는 모든 인스턴스가 공유하고, 재질은 별똥별마다 따로 가져 깜빡임을 독립적으로 준다.

const UP = new THREE.Vector3(0, 1, 0);
const TAIL_LEN = 6;
const BEAM_H = 25;

const HEAD_GEO = new THREE.OctahedronGeometry(0.45, 0);
// 꼬리: 뾰족한 끝이 원점, 몸통은 -y 방향으로 뻗는다
const TAIL_GEO = new THREE.ConeGeometry(0.3, 1, 8, 1, true).translate(0, -0.5, 0);
// 빛기둥: 바닥이 원점
const BEAM_GEO = new THREE.CylinderGeometry(0.07, 0.07, BEAM_H, 6, 1, true).translate(0, BEAM_H / 2, 0);
const STAR_GEO = makeStarGeometry();

function makeStarGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const points = 5, outer = 0.6, inner = 0.26;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
  g.center();
  return g;
}

interface Entry {
  root: THREE.Group;
  head: THREE.Mesh;
  tail: THREE.Mesh;
  star: THREE.Mesh;
  beam: THREE.Mesh;
  mats: THREE.Material[];
  /** 방향 계산용 직전 위치와 진행 방향(꼬리는 진행 반대로) */
  last: THREE.Vector3;
  dir: THREE.Vector3;
  phase: number;
}

export class MeteorRender {
  readonly group = new THREE.Group();
  private readonly entries = new Map<number, Entry>();

  /** 현재 별똥별 목록을 장면에 맞춘다. time은 초 단위 시계 */
  sync(meteors: Meteor[], time: number) {
    const seen = new Set<number>();
    for (const m of meteors) {
      seen.add(m.id);
      let e = this.entries.get(m.id);
      if (!e) {
        e = this.create(m);
        this.entries.set(m.id, e);
        this.group.add(e.root);
      }
      this.update(e, m, time);
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      this.group.remove(e.root);
      this.disposeEntry(e);
      this.entries.delete(id);
    }
  }

  /** 모든 별똥별 자원 해제 */
  dispose() {
    for (const e of this.entries.values()) this.disposeEntry(e);
    this.entries.clear();
    this.group.clear();
  }

  private create(m: Meteor): Entry {
    const headMat = new THREE.MeshBasicMaterial({ color: '#fff8d6', fog: false });
    const tailMat = new THREE.MeshBasicMaterial({
      color: '#ffd98a', transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const starMat = new THREE.MeshBasicMaterial({ color: '#ffd36b', fog: false });
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#ffe9a6', transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });

    const root = new THREE.Group();
    const head = new THREE.Mesh(HEAD_GEO, headMat);
    const tail = new THREE.Mesh(TAIL_GEO, tailMat);
    tail.scale.set(1, TAIL_LEN, 1);
    const star = new THREE.Mesh(STAR_GEO, starMat);
    const beam = new THREE.Mesh(BEAM_GEO, beamMat);
    root.add(head, tail, star, beam);
    root.position.set(m.x, m.y, m.z);

    return {
      root, head, tail, star, beam,
      mats: [headMat, tailMat, starMat, beamMat],
      last: new THREE.Vector3(m.x, m.y, m.z),
      dir: new THREE.Vector3(0, -1, 0),
      phase: (m.id * 1.7) % (Math.PI * 2),
    };
  }

  private update(e: Entry, m: Meteor, time: number) {
    e.root.position.set(m.x, m.y, m.z);

    if (m.phase === 'falling') {
      // 직전 프레임 대비 이동 방향으로 꼬리를 세운다
      const dx = m.x - e.last.x, dy = m.y - e.last.y, dz = m.z - e.last.z;
      if (dx * dx + dy * dy + dz * dz > 1e-8) {
        e.dir.set(dx, dy, dz).normalize();
      }
      e.last.set(m.x, m.y, m.z);
      e.tail.quaternion.setFromUnitVectors(UP, e.dir);
      const pulse = 1 + 0.08 * Math.sin(time * 20 + e.phase);
      e.head.scale.setScalar(pulse);
      e.head.visible = true;
      e.tail.visible = true;
      e.star.visible = false;
      e.beam.visible = false;
      return;
    }

    // 착지 후: 조각이 천천히 돌며 떠 있고, 빛기둥으로 위치를 알린다
    e.head.visible = false;
    e.tail.visible = false;
    const blink = m.fading && Math.floor(time * 8) % 2 === 1;
    e.star.visible = !blink;
    e.beam.visible = !blink;
    e.star.position.y = 1.3 + Math.sin(time * 2 + e.phase) * 0.15;
    e.star.rotation.y = time * 1.2;
  }

  private disposeEntry(e: Entry) {
    for (const mat of e.mats) mat.dispose();
  }
}
