import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HALF } from '../physics/world';

const WHITE = new THREE.Color(1, 1, 1);
const DEFAULT_CHEEK = '#ff8fb8';

/** hex를 그대로 0~1 선형 값으로 쓴다 (기본 발광색 값과 동일하게 맞추기 위함) */
function rgbOf(hex: string): THREE.Color {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// 귀여운 큐브: 둥근 몸체 + 얼굴 + 블롭 그림자 + 스쿼시/스트레치(스프링).
export class Cube {
  readonly group = new THREE.Group();
  readonly shadow: THREE.Mesh;
  private readonly body: THREE.Group = new THREE.Group();
  private squash = 0; // +면 납작, -면 길쭉
  private squashV = 0;
  private yaw = 0;
  /** 회전 공격 등 연출용 추가 회전 (라디안) */
  spin = 0;
  /** 0~1: 맞았을 때 하얗게/깜빡임 */
  flash = 0;
  /** 무적 시간 동안 깜빡이게 한다 */
  blink = false;
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly cheekMat: THREE.MeshBasicMaterial;
  /** 기본 발광색. flash 때 여기서 흰색 쪽으로 섞는다 */
  private emissiveBase = rgbOf('#3d7dff');
  private readonly accessories = new Map<string, THREE.Object3D>();

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ color: '#5aa9ff', emissive: '#3d7dff', emissiveIntensity: 0.22 });
    this.mat = mat;
    const body = new THREE.Mesh(new RoundedBoxGeometry(HALF * 2, HALF * 2, HALF * 2, 5, 0.16), mat);
    body.castShadow = false;

    const eyeGeo = new THREE.SphereGeometry(0.075, 16, 12);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#2b2438' });
    const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.scale.set(1, 1.35, 0.5);
      eye.position.set(sx * 0.2, 0.08, HALF + 0.005);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), shineMat);
      shine.position.set(0.025, 0.04, 0.05);
      eye.add(shine);
      this.body.add(eye);
    }
    this.cheekMat = new THREE.MeshBasicMaterial({ color: DEFAULT_CHEEK, transparent: true, opacity: 0.5 });
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), this.cheekMat);
      cheek.scale.set(1.3, 0.8, 1);
      cheek.position.set(sx * 0.33, -0.08, HALF + 0.006);
      this.body.add(cheek);
    }
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI),
      new THREE.MeshBasicMaterial({ color: '#2b2438' }),
    );
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.06, HALF + 0.006);
    this.body.add(mouth);

    this.buildAccessories();
    this.body.add(body);
    this.group.add(this.body);

    // 블롭 그림자 (지면 위에 올려놓는 둥근 어두운 원)
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 24),
      new THREE.MeshBasicMaterial({ color: '#2b2438', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
  }

  /** 점프/착지 충격으로 스프링을 친다 */
  kickJump() { this.squashV -= 7; }
  kickLand(impact: number) { this.squashV += Math.min(impact, 30) * 0.55; }

  /** 스킨 적용: 몸 색, 기본 발광색, 볼 색, 액세서리. 기본 스킨은 기존 모양과 같다 */
  setSkin(skin: { body: string; emissive: string; cheek?: string; accessory?: string }) {
    this.mat.color.set(skin.body);
    this.emissiveBase = rgbOf(skin.emissive);
    this.cheekMat.color.set(skin.cheek ?? DEFAULT_CHEEK);
    for (const [key, obj] of this.accessories) obj.visible = key === skin.accessory;
  }

  /** 액세서리는 모두 만들어 두고 스킨에 따라 보이기만 바꾼다. 몸체 그룹 안이라 스쿼시를 따라간다 */
  private buildAccessories() {
    const top = HALF;
    const gold = new THREE.MeshLambertMaterial({ color: '#ffd36b', emissive: '#ffb938', emissiveIntensity: 0.35, flatShading: true });
    const leafMat = new THREE.MeshLambertMaterial({ color: '#7ed957', flatShading: true });
    const hornMat = new THREE.MeshLambertMaterial({ color: '#f4e6d0', flatShading: true });
    const bowMat = new THREE.MeshLambertMaterial({ color: '#ff7fb0', flatShading: true });
    const haloMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.9 });

    const add = (key: string, obj: THREE.Object3D) => {
      obj.visible = false;
      this.body.add(obj);
      this.accessories.set(key, obj);
    };

    // 왕관: 작은 원뿔 3개
    const crown = new THREE.Group();
    [[-0.14, 0.9], [0, 1.3], [0.14, 0.9]].forEach(([x, s]) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18 * s, 5), gold);
      cone.position.set(x, top + 0.08 * s, 0);
      crown.add(cone);
    });
    add('crown', crown);

    // 잎: 납작한 구 2개
    const leaves = new THREE.Group();
    const leafGeo = new THREE.SphereGeometry(0.11, 10, 6);
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.scale.set(1, 0.3, 0.55);
      leaf.position.set(sx * 0.09, top + 0.06, 0);
      leaf.rotation.z = -sx * 0.5;
      leaves.add(leaf);
    }
    add('leaf', leaves);

    // 후광: 머리 위에 떠 있는 토러스
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24), haloMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, top + 0.42, 0);
    add('halo', halo);

    // 뿔: 바깥으로 기운 원뿔 2개
    const horns = new THREE.Group();
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), hornMat);
      horn.position.set(sx * 0.2, top + 0.1, 0);
      horn.rotation.z = -sx * 0.35;
      horns.add(horn);
    }
    add('horns', horns);

    // 리본: 작은 상자 2개 + 매듭
    const bow = new THREE.Group();
    const ribbonGeo = new THREE.BoxGeometry(0.16, 0.1, 0.04);
    for (const sx of [-1, 1]) {
      const ribbon = new THREE.Mesh(ribbonGeo, bowMat);
      ribbon.position.set(sx * 0.11, top + 0.04, 0);
      ribbon.rotation.z = -sx * 0.45;
      bow.add(ribbon);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), bowMat);
    knot.position.set(0, top + 0.04, 0);
    bow.add(knot);
    add('bow', bow);
  }

  /**
   * @param pos 보간된 위치(중심)
   * @param vy 수직 속도 (공중에서 길쭉해지는 연출)
   * @param groundY 큐브 바로 아래 지면 높이 (그림자용)
   * @param faceDir 바라볼 수평 방향
   */
  update(
    dt: number, pos: THREE.Vector3, vy: number, grounded: boolean,
    groundY: number, faceX: number, faceZ: number, normal: THREE.Vector3,
  ) {
    // 임계 감쇠에 가까운 스프링
    const k = 260, c = 17;
    const target = grounded ? 0 : THREE.MathUtils.clamp(-Math.abs(vy) * 0.012, -0.22, 0);
    // 프레임이 느려도 튀지 않게 작은 간격으로 나눠 적분한다
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const sub = dt / n;
    for (let i = 0; i < n; i++) {
      this.squashV += (-k * (this.squash - target) - c * this.squashV) * sub;
      this.squash += this.squashV * sub;
    }
    this.squash = THREE.MathUtils.clamp(this.squash, -0.3, 0.3);

    const sy = 1 - this.squash;
    const sxz = 1 + this.squash * 0.5;
    this.body.scale.set(sxz, sy, sxz);
    // 납작해져도 바닥에 붙어 있도록 몸체를 내린다
    this.body.position.y = -HALF * (1 - sy);

    if (faceX * faceX + faceZ * faceZ > 0.01) {
      const want = Math.atan2(faceX, faceZ);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 14);
    }
    this.group.position.copy(pos);
    this.group.rotation.y = this.yaw + this.spin;
    this.mat.emissive.copy(this.emissiveBase).lerp(WHITE, this.flash);
    this.mat.emissiveIntensity = 0.22 + 0.7 * this.flash;
    this.body.visible = !this.blink || Math.floor(performance.now() / 70) % 2 === 0;

    // 그림자: 높이에 따라 작아지고 옅어진다
    const h = Math.max(0, pos.y - HALF - groundY);
    const s = THREE.MathUtils.clamp(1 - h * 0.12, 0.35, 1);
    this.shadow.scale.setScalar(s * (1 + this.squash * 0.4));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 * s;
    this.shadow.position.set(pos.x, groundY + 0.04, pos.z);
    // 비탈에 맞춰 눕힌다
    this.shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  }
}
