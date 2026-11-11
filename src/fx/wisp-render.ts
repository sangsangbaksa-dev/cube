import * as THREE from 'three';
import type { ActiveWisp } from '../game/wisps';

// 정령 그림. 작은 발광 구 + 가산 혼합 후광 + 꼬리 점 3개가 둥실 떠다닌다.
// epic은 더 크고 고리(토러스)가 돈다. 지오메트리는 공유하고, 재질은 정령(id)마다 따로 가져 독립적으로 둔다.

const CORE_GEO = new THREE.SphereGeometry(0.16, 10, 8);
const GLOW_GEO = new THREE.SphereGeometry(0.42, 10, 8);
const TAIL_GEO = new THREE.SphereGeometry(0.07, 6, 5);
const RING_GEO = new THREE.TorusGeometry(0.42, 0.025, 6, 24);
const EPIC_SCALE = 1.35;

interface Entry {
  root: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  tails: THREE.Mesh[];
  ring: THREE.Mesh;
  mats: THREE.Material[];
  epic: boolean;
}

export class WispRender {
  readonly group = new THREE.Group();
  private readonly entries = new Map<number, Entry>();

  /** 현재 떠 있는 정령 목록을 장면에 맞춘다. time은 초 단위 시계 */
  sync(active: readonly ActiveWisp[], time: number) {
    const seen = new Set<number>();
    for (const w of active) {
      seen.add(w.id);
      let e = this.entries.get(w.id);
      if (!e) {
        e = this.create(w);
        this.entries.set(w.id, e);
        this.group.add(e.root);
      }
      this.update(e, w, time);
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      this.group.remove(e.root);
      this.disposeEntry(e);
      this.entries.delete(id);
    }
  }

  /** 모든 정령 자원 해제 */
  dispose() {
    for (const e of this.entries.values()) this.disposeEntry(e);
    this.entries.clear();
    this.group.clear();
  }

  private create(w: ActiveWisp): Entry {
    const color = w.species.color;
    const epic = w.species.rarity === 'epic';
    const coreMat = new THREE.MeshBasicMaterial({ color, fog: false });
    const glowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const tailMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });

    const root = new THREE.Group();
    const glow = new THREE.Mesh(GLOW_GEO, glowMat);
    const core = new THREE.Mesh(CORE_GEO, coreMat);
    const tails = [0, 1, 2].map(() => new THREE.Mesh(TAIL_GEO, tailMat));
    const ring = new THREE.Mesh(RING_GEO, ringMat);
    ring.visible = epic;
    root.add(glow, core, ring, ...tails);
    root.scale.setScalar(epic ? EPIC_SCALE : 1);

    return { root, core, glow, tails, ring, mats: [coreMat, glowMat, tailMat, ringMat], epic };
  }

  private update(e: Entry, w: ActiveWisp, time: number) {
    // 둥실거림: 위아래로 천천히
    e.root.position.set(w.x, w.y + Math.sin(time * 2 + w.phase) * 0.18, w.z);

    const pulse = 1 + 0.08 * Math.sin(time * 5 + w.phase);
    e.glow.scale.setScalar(pulse);

    // 꼬리 점: 아래쪽 나선을 따라 뒤로 갈수록 작아진다
    for (let i = 0; i < e.tails.length; i++) {
      const a = time * 2.2 + w.phase - i * 0.45;
      const r = 0.22 + i * 0.05;
      const tail = e.tails[i];
      tail.position.set(Math.cos(a) * r, -0.2 - i * 0.16, Math.sin(a) * r);
      tail.scale.setScalar(1 - i * 0.25);
    }

    if (e.epic) {
      e.ring.rotation.set(1.1, time * 1.4 + w.phase, 0);
    }
  }

  private disposeEntry(e: Entry) {
    for (const mat of e.mats) mat.dispose();
  }
}
