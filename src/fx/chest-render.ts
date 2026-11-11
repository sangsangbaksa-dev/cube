import * as THREE from 'three';
import type { ChestSpec, ChestTier } from '../game/chests';

// 보물 상자 그림. 나무 상자 + 등급별 띠. 안 연 상자는 밤에 작은 빛 점이 깜빡여 멀리서도 찾기 쉽다.
// 상자 수가 적어서(24개 안팎) 상자마다 메시와 재질을 따로 가진다.

const WOOD = new THREE.Color('#8b5a2b');
const WOOD_OPEN = new THREE.Color('#4a3220');
const BAND: Record<ChestTier, string> = { bronze: '#d9925a', silver: '#d9e2ee', gold: '#ffd36b' };
const OPEN_ANGLE = -1.75;
/** 뚜껑이 열리고 닫히는 속도(1/초) */
const LID_SPEED = 4;

interface Entry {
  spec: ChestSpec;
  root: THREE.Group;
  lid: THREE.Group;
  woodMat: THREE.MeshStandardMaterial;
  bandMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshBasicMaterial;
  glow: THREE.Mesh;
  /** 뚜껑 현재 각도 (0 = 닫힘) */
  angle: number;
  /** 빛 깜빡임 위상 */
  phase: number;
  /** 마지막 sync 시각 (뚜껑 애니메이션 dt 계산용) */
  lastTime: number;
  opened: boolean;
}

export class ChestRender {
  readonly group = new THREE.Group();
  private readonly entries = new Map<number, Entry>();
  private readonly geos: THREE.BufferGeometry[];
  private readonly mats: THREE.Material[] = [];

  private readonly bodyGeo = new THREE.BoxGeometry(1.1, 0.6, 0.8);
  private readonly lidGeo = new THREE.BoxGeometry(1.1, 0.2, 0.8).translate(0, 0.1, 0.4);
  private readonly bandGeo = new THREE.BoxGeometry(1.14, 0.12, 0.84);
  private readonly glowGeo = new THREE.SphereGeometry(0.16, 8, 6);

  constructor(specs: ChestSpec[]) {
    this.geos = [this.bodyGeo, this.lidGeo, this.bandGeo, this.glowGeo];
    for (const s of specs) this.entries.set(s.id, this.create(s));
  }

  /** 상자 상태를 장면에 맞춘다. time은 초 단위 시계, night는 0~1 */
  sync(chests: { spec: ChestSpec; opened: boolean }[], time: number, night: number) {
    const glowLevel = THREE.MathUtils.clamp((night - 0.3) / 0.5, 0, 1);
    for (const c of chests) {
      const e = this.entries.get(c.spec.id);
      if (!e) continue;
      if (c.opened !== e.opened) this.setOpened(e, c.opened);

      const target = e.opened ? OPEN_ANGLE : 0;
      if (e.lastTime < 0) {
        // 처음 그릴 때는 애니메이션 없이 바로 맞춘다 (이미 열린 상자)
        e.angle = target;
      } else {
        const dt = Math.min(0.1, Math.max(0, time - e.lastTime));
        e.angle += (target - e.angle) * Math.min(1, dt * LID_SPEED);
      }
      e.lastTime = time;
      e.lid.rotation.x = e.angle;

      // 안 연 상자만 빛을 낸다. 낮에는 보이지 않는다
      const blink = 0.5 + 0.5 * Math.sin(time * 3 + e.phase);
      e.glow.visible = !e.opened && glowLevel > 0.01;
      e.glowMat.opacity = glowLevel * (0.45 + 0.55 * blink);
    }
  }

  /** 모든 자원 해제 */
  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
    this.entries.clear();
    this.group.clear();
  }

  private create(spec: ChestSpec): Entry {
    const woodMat = this.material(new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85, flatShading: true }));
    const bandMat = this.material(new THREE.MeshStandardMaterial({
      color: BAND[spec.tier], roughness: 0.4, metalness: 0.5, flatShading: true,
    }));
    const glowMat = this.material(new THREE.MeshBasicMaterial({
      color: BAND[spec.tier], transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }));

    const root = new THREE.Group();
    root.position.set(spec.x, spec.y, spec.z);
    // 상자마다 방향을 조금씩 다르게
    root.rotation.y = (spec.id * 2.4) % (Math.PI * 2);

    const body = new THREE.Mesh(this.bodyGeo, woodMat);
    body.position.y = 0.3;
    const band = new THREE.Mesh(this.bandGeo, bandMat);
    band.position.y = 0.3;

    // 뚜껑은 뒤쪽 모서리에 경첩이 달린 피벗 그룹에 붙는다
    const lid = new THREE.Group();
    lid.position.set(0, 0.6, -0.4);
    lid.add(new THREE.Mesh(this.lidGeo, woodMat));

    const glow = new THREE.Mesh(this.glowGeo, glowMat);
    glow.position.y = 1.6;
    glow.visible = false;

    root.add(body, band, lid, glow);
    this.group.add(root);
    return {
      spec, root, lid, woodMat, bandMat, glowMat, glow,
      angle: 0, phase: (spec.id * 1.9) % (Math.PI * 2), lastTime: -1, opened: false,
    };
  }

  private setOpened(e: Entry, opened: boolean) {
    e.opened = opened;
    // 열린 상자는 어둡게
    e.woodMat.color.copy(opened ? WOOD_OPEN : WOOD);
    e.bandMat.color.set(BAND[e.spec.tier]).multiplyScalar(opened ? 0.5 : 1);
  }

  private material<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }
}
