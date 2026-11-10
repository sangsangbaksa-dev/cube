import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MonsterAnim, BaseKind as MonsterKind } from './types';

// 몬스터 모델: three.js 기본 도형만으로 만든 저폴리 귀여운 적들.
// 원점은 발바닥(지면 접촉점), 정면은 +Z.

export interface MonsterModel {
  /** Root object. Its origin is at the monster's FEET (ground contact point), facing +Z. Game code sets group.position / rotation.y. */
  group: THREE.Group;
  /** collision height and radius in world units (used by gameplay) */
  height: number;
  radius: number;
  /** animate every frame */
  update(dt: number, a: MonsterAnim): void;
  dispose(): void;
}

const M = THREE.MathUtils;
const TAU = Math.PI * 2;
const WHITE = new THREE.Color(1, 1, 1);

// ---------------------------------------------------------------------------
// 공유 지오메트리 (모듈 레벨, 인스턴스끼리 공유하고 dispose하지 않는다)
// ---------------------------------------------------------------------------

function makeWingGeometry(): THREE.ShapeGeometry {
  // 피벗(0,0)에서 -X 방향으로 뻗는 박쥐 날개. 오른쪽 날개는 scale.x = -1 로 뒤집어 쓴다.
  const s = new THREE.Shape();
  s.moveTo(0.02, 0.05);
  s.lineTo(-0.22, 0.2);
  s.lineTo(-0.3, 0.06);
  s.lineTo(-0.5, 0.16);
  s.lineTo(-0.46, -0.06);
  s.lineTo(-0.3, -0.1);
  s.lineTo(-0.18, -0.02);
  s.lineTo(0.02, -0.04);
  s.closePath();
  return new THREE.ShapeGeometry(s, 1);
}

const GEO = {
  slimeBody: new THREE.SphereGeometry(0.5, 14, 10),
  slimeCore: new THREE.SphereGeometry(0.26, 9, 7),
  eye: new THREE.SphereGeometry(0.07, 9, 7),
  shine: new THREE.SphereGeometry(0.022, 6, 5),
  cheek: new THREE.CircleGeometry(0.07, 10),
  mouth: new THREE.TorusGeometry(0.05, 0.012, 5, 12, Math.PI),
  spikeCone: new THREE.ConeGeometry(0.1, 0.32, 5),
  spikerBody: new RoundedBoxGeometry(1.1, 1.1, 1.1, 3, 0.14),
  brow: new THREE.BoxGeometry(0.24, 0.06, 0.05),
  batBody: new THREE.SphereGeometry(0.26, 9, 7),
  wing: makeWingGeometry(),
  casterBody: new THREE.ConeGeometry(0.45, 1.1, 10),
  casterBrim: new THREE.TorusGeometry(0.42, 0.05, 5, 12),
  rune: new THREE.SphereGeometry(0.05, 5, 4),
  legBox: new RoundedBoxGeometry(0.5, 0.5, 0.55, 2, 0.12),
  torsoBox: new RoundedBoxGeometry(1.3, 1.1, 1.0, 2, 0.16),
  headBox: new RoundedBoxGeometry(0.9, 0.8, 0.85, 2, 0.14),
  armBox: new RoundedBoxGeometry(0.4, 1.1, 0.4, 2, 0.12),
  crystal: new THREE.ConeGeometry(0.14, 0.5, 5),
  moss: new THREE.SphereGeometry(0.22, 6, 4),
  crack: new THREE.BoxGeometry(0.04, 0.5, 0.02),
  coreGem: new THREE.IcosahedronGeometry(0.22, 0),
  // 오브
  orbCore: new THREE.SphereGeometry(0.2, 10, 8),
  orbHalo: new THREE.SphereGeometry(0.4, 10, 8),
  // 균열 코어
  riftDisc: new THREE.CircleGeometry(1.5, 24),
  riftRing: new THREE.TorusGeometry(1.35, 0.07, 6, 28),
  riftCrystal: new THREE.IcosahedronGeometry(0.75, 0),
  riftOrbitRing: new THREE.TorusGeometry(1.0, 0.05, 5, 32),
  riftCrack: new THREE.BoxGeometry(0.05, 0.6, 0.05),
  // 별조각
  shardGem: new THREE.OctahedronGeometry(0.22, 0),
  shardHalo: new THREE.SphereGeometry(0.4, 10, 8),
};

// 공유 머티리얼 (색이 바뀌지 않는 것만)
const MAT = {
  shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  dark: new THREE.MeshBasicMaterial({ color: '#2b2438' }),
  cheek: new THREE.MeshBasicMaterial({ color: '#ff6f93', transparent: true, opacity: 0.55, depthWrite: false }),
  rune: new THREE.MeshBasicMaterial({ color: '#ff9bdc' }),
  moss: new THREE.MeshLambertMaterial({ color: '#8fd6a0', emissive: '#3f8f5a', emissiveIntensity: 0.15 }),
  crack: new THREE.MeshBasicMaterial({ color: '#2a2040' }),
};

// ---------------------------------------------------------------------------
// 인스턴스별 머티리얼 관리
// ---------------------------------------------------------------------------

interface FlashMat {
  mat: THREE.MeshLambertMaterial;
  baseEmissive: THREE.Color;
  baseIntensity: number;
}

/** 한 몬스터 인스턴스가 소유하는 머티리얼 모음 */
class Ctx {
  /** 피격 플래시 대상 (몸체 머티리얼) */
  readonly flash: FlashMat[] = [];
  /** 밤에 빛나는 눈 머티리얼 */
  readonly glows: THREE.MeshLambertMaterial[] = [];
  /** dispose 대상 */
  readonly owned: THREE.Material[] = [];

  lambert(p: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial(p);
    this.owned.push(m);
    return m;
  }

  flashLambert(p: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
    const mat = this.lambert(p);
    this.flash.push({ mat, baseEmissive: mat.emissive.clone(), baseIntensity: mat.emissiveIntensity });
    return mat;
  }

  glow(glowColor: string): THREE.MeshLambertMaterial {
    const m = this.lambert({ color: '#2b2438', emissive: glowColor, emissiveIntensity: 0.4 });
    this.glows.push(m);
    return m;
  }
}

interface Rig {
  height: number;
  radius: number;
  animate(dt: number, a: MonsterAnim): void;
}

type Builder = (root: THREE.Group, ctx: Ctx) => Rig;

function place<T extends THREE.Object3D>(parent: THREE.Object3D, obj: T, x = 0, y = 0, z = 0): T {
  obj.position.set(x, y, z);
  parent.add(obj);
  return obj;
}

/** 눈 하나 (어두운 눈동자 + 빛나는 에미시브 + 흰 반짝임). 빛나는 머티리얼을 돌려준다. */
function addEye(parent: THREE.Object3D, ctx: Ctx, x: number, y: number, z: number, glowColor: string, s = 1): THREE.MeshLambertMaterial {
  const mat = ctx.glow(glowColor);
  const eye = place(parent, new THREE.Mesh(GEO.eye, mat), x, y, z);
  eye.scale.set(s, s * 1.3, s * 0.5);
  place(parent, new THREE.Mesh(GEO.shine, MAT.shine), x + 0.025 * s, y + 0.04 * s, z + 0.04 * s);
  return mat;
}

// ---------------------------------------------------------------------------
// 슬라임: 말랑한 라벤더 젤리 + 민트 속살
// ---------------------------------------------------------------------------
const buildSlime: Builder = (root, ctx) => {
  const shape = new THREE.Group();
  root.add(shape);

  const bodyMat = ctx.flashLambert({
    color: '#b9a7ff', emissive: '#7fe0d0', emissiveIntensity: 0.15,
    transparent: true, opacity: 0.85,
  });
  place(shape, new THREE.Mesh(GEO.slimeBody, bodyMat), 0, 0.4, 0).scale.set(1, 0.8, 1);
  const coreMat = ctx.flashLambert({
    color: '#8ff5d6', emissive: '#8ff5d6', emissiveIntensity: 0.2,
    transparent: true, opacity: 0.6,
  });
  place(shape, new THREE.Mesh(GEO.slimeCore, coreMat), 0, 0.36, 0);

  // 얼굴
  addEye(shape, ctx, -0.18, 0.5, 0.44, '#c9fff2');
  addEye(shape, ctx, 0.18, 0.5, 0.44, '#c9fff2');
  for (const sx of [-1, 1]) {
    const cheek = place(shape, new THREE.Mesh(GEO.cheek, MAT.cheek), sx * 0.3, 0.36, 0.41);
    cheek.scale.set(1.3, 0.8, 1);
  }
  place(shape, new THREE.Mesh(GEO.mouth, MAT.dark), 0, 0.34, 0.5).rotation.z = Math.PI;

  let sq = 0; // +면 납작, -면 길쭉
  let sqV = 0;
  let wasAir = false;

  return {
    height: 0.8,
    radius: 0.55,
    animate(dt, a) {
      // 착지 순간 납작하게 찌그러뜨린다
      if (wasAir && !a.airborne) sqV += 5;
      wasAir = a.airborne;
      const target = a.airborne ? M.clamp(-a.vy * 0.03, -0.25, 0.25) : 0;
      const k = 220, c = 15;
      sqV += (-k * (sq - target) - c * sqV) * dt;
      sq += sqV * dt;
      sq = M.clamp(sq, -0.35, 0.45);

      const wob = Math.sin(a.time * 6) * 0.03 + a.moving * Math.sin(a.time * 13) * 0.05;
      shape.scale.set(1 + sq * 0.5 - wob * 0.4, 1 - sq + wob * 0.6, 1 + sq * 0.5 - wob * 0.4);
    },
  };
};

// ---------------------------------------------------------------------------
// 스파이커: 어두운 코랄/자두색 가시 큐브. 예고 시 흔들리고 가시가 달아오른다.
// ---------------------------------------------------------------------------
const buildSpiker: Builder = (root, ctx) => {
  const tilt = new THREE.Group(); // 앞으로 기울어지고 흔들리는 축 (발 기준)
  root.add(tilt);

  const bodyMat = ctx.flashLambert({ color: '#8c3f6a', emissive: '#ff6f61', emissiveIntensity: 0.12 });
  place(tilt, new THREE.Mesh(GEO.spikerBody, bodyMat), 0, 0.55, 0);

  const spikeMat = ctx.flashLambert({ color: '#c4504f', emissive: '#ff7a5c', emissiveIntensity: 0.2 });
  const SPIKE_HOT = new THREE.Color('#ffb36b');
  const spike = (x: number, y: number, z: number, rx: number, rz: number) => {
    const s = place(tilt, new THREE.Mesh(GEO.spikeCone, spikeMat), x, y, z);
    s.rotation.set(rx, 0, rz);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) spike(sx * 0.28, 1.26, sz * 0.28, 0, 0);
  spike(0.7, 0.55, 0, 0, -Math.PI / 2);
  spike(-0.7, 0.55, 0, 0, Math.PI / 2);
  spike(0, 0.55, -0.7, -Math.PI / 2, 0);

  // 화난 눈썹 (안쪽이 아래로)
  for (const sx of [-1, 1]) {
    place(tilt, new THREE.Mesh(GEO.brow, MAT.dark), sx * 0.22, 0.86, 0.57).rotation.z = sx * 0.4;
  }
  addEye(tilt, ctx, -0.22, 0.62, 0.56, '#ff9a7a');
  addEye(tilt, ctx, 0.22, 0.62, 0.56, '#ff9a7a');
  place(tilt, new THREE.Mesh(GEO.mouth, MAT.dark), 0, 0.36, 0.57); // 찡그린 입 (∩)

  return {
    height: 1.1,
    radius: 0.6,
    animate(dt, a) {
      const tele = M.clamp(a.telegraph, 0, 1);
      // 예고: 가시가 달아오르고 몸이 떤다
      spikeMat.emissive.lerp(SPIKE_HOT, tele * 0.8);
      spikeMat.emissiveIntensity += tele * 1.8;
      tilt.position.x = Math.sin(a.time * 55) * 0.03 * tele;
      tilt.position.y = a.moving > 0 ? Math.abs(Math.sin(a.time * 9)) * 0.05 * a.moving : 0;
      // 공격 중에는 앞으로 기운다
      const leanTarget = a.attacking ? 0.5 : 0;
      tilt.rotation.x = M.lerp(tilt.rotation.x, leanTarget, Math.min(1, dt * 10));
    },
  };
};

// ---------------------------------------------------------------------------
// 박쥐: 작은 그림자 덩어리 + 펄럭이는 날개 + 노란 눈. 원점은 몸 아래쪽.
// ---------------------------------------------------------------------------
const buildBat: Builder = (root, ctx) => {
  const core = new THREE.Group();
  root.add(core);

  const bodyMat = ctx.flashLambert({ color: '#5e4f94', emissive: '#b9a6ff', emissiveIntensity: 0.15 });
  place(core, new THREE.Mesh(GEO.batBody, bodyMat), 0, 0.3, 0);

  const wingMat = ctx.flashLambert({ color: '#7a63b8', emissive: '#4a3a84', emissiveIntensity: 0.1, side: THREE.DoubleSide });
  const wingL = place(core, new THREE.Group(), -0.2, 0.32, 0);
  place(wingL, new THREE.Mesh(GEO.wing, wingMat));
  const wingR = place(core, new THREE.Group(), 0.2, 0.32, 0);
  wingR.scale.x = -1; // 오른쪽 날개는 좌우 반전
  place(wingR, new THREE.Mesh(GEO.wing, wingMat));

  addEye(core, ctx, -0.09, 0.36, 0.23, '#ffe27a', 0.8);
  addEye(core, ctx, 0.09, 0.36, 0.23, '#ffe27a', 0.8);

  return {
    height: 0.6,
    radius: 0.45,
    animate(_dt, a) {
      const speed = a.attacking ? 20 : 10 + a.moving * 4;
      const f = 0.25 + Math.sin(a.time * speed) * 0.6;
      wingL.rotation.z = f;
      wingR.rotation.z = -f;
      core.position.y = Math.sin(a.time * 3) * 0.03;
    },
  };
};

// ---------------------------------------------------------------------------
// 캐스터: 떠다니는 후드 원뿔 + 커다란 외눈 + 주변을 도는 룬 3개.
// ---------------------------------------------------------------------------
const buildCaster: Builder = (root, ctx) => {
  const core = new THREE.Group();
  root.add(core);

  const bodyMat = ctx.flashLambert({ color: '#4f5fa8', emissive: '#5fd3c9', emissiveIntensity: 0.12 });
  place(core, new THREE.Mesh(GEO.casterBody, bodyMat), 0, 0.8, 0);
  const brim = place(core, new THREE.Mesh(GEO.casterBrim, bodyMat), 0, 0.25, 0);
  brim.rotation.x = Math.PI / 2;

  const eyeMat = addEye(core, ctx, 0, 0.92, 0.22, '#7fffe0', 1.6);
  const EYE_IDLE = new THREE.Color('#7fffe0');
  const EYE_ALERT = new THREE.Color('#ff4fd8');

  const runes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    runes.push(place(core, new THREE.Mesh(GEO.rune, MAT.rune), 0, 0.8, 0.55));
  }

  return {
    height: 1.4,
    radius: 0.5,
    animate(_dt, a) {
      const tele = M.clamp(a.telegraph, 0, 1);
      core.position.y = 0.12 + Math.sin(a.time * 2.4) * 0.06;

      eyeMat.emissive.lerpColors(EYE_IDLE, EYE_ALERT, tele);
      eyeMat.emissiveIntensity += tele * 2.0;

      runes.forEach((r, i) => {
        const ang = a.time * 1.6 + (i * TAU) / 3;
        const rad = 0.55 + Math.sin(a.time * 3 + i) * 0.04;
        r.position.set(Math.cos(ang) * rad, 0.8 + Math.sin(a.time * 2 + i) * 0.12, Math.sin(ang) * rad);
      });
    },
  };
};

// ---------------------------------------------------------------------------
// 골렘 (보스): 돌 큐브 몸 + 보라 수정 어깨 + 가슴의 빛나는 핵.
// ---------------------------------------------------------------------------
const buildGolem: Builder = (root, ctx) => {
  const legs = new THREE.Group();
  root.add(legs);
  const upper = new THREE.Group(); // 기울기/흔들림 축 (발 기준)
  root.add(upper);

  const stoneMat = ctx.flashLambert({ color: '#8d82ac', emissive: '#6b5fa0', emissiveIntensity: 0.08 });
  const crystalMat = ctx.flashLambert({ color: '#7b5cc9', emissive: '#b28cff', emissiveIntensity: 0.5, flatShading: true });

  for (const sx of [-1, 1]) place(legs, new THREE.Mesh(GEO.legBox, stoneMat), sx * 0.38, 0.25, 0);
  place(upper, new THREE.Mesh(GEO.torsoBox, stoneMat), 0, 1.0, 0);
  place(upper, new THREE.Mesh(GEO.headBox, stoneMat), 0, 1.95, 0);

  // 이끼와 균열
  place(upper, new THREE.Mesh(GEO.moss, MAT.moss), 0.35, 1.52, 0.2).scale.set(1, 0.4, 1);
  place(upper, new THREE.Mesh(GEO.moss, MAT.moss), -0.3, 1.52, 0.25).scale.set(1, 0.4, 1);
  place(upper, new THREE.Mesh(GEO.crack, MAT.crack), 0.3, 0.9, 0.51).rotation.z = 0.4;
  place(upper, new THREE.Mesh(GEO.crack, MAT.crack), -0.25, 0.6, 0.51).rotation.z = -0.3;

  // 머리 위 수정 왕관
  for (let i = 0; i < 3; i++) {
    const c = place(upper, new THREE.Mesh(GEO.crystal, crystalMat), (i - 1) * 0.25, 2.47, 0);
    c.scale.set(1, 0.7, 1);
    c.rotation.z = (i - 1) * 0.25;
  }

  // 눈
  addEye(upper, ctx, -0.2, 2.02, 0.44, '#ff9fc4', 1.1);
  addEye(upper, ctx, 0.2, 2.02, 0.44, '#ff9fc4', 1.1);

  // 가슴의 핵
  const coreMat = ctx.glow('#ff8fb8');
  const coreMesh = place(upper, new THREE.Mesh(GEO.coreGem, coreMat), 0, 1.05, 0.52);

  // 팔 (어깨 피벗, 아래로 뻗은 박스). 어깨 수정 포함.
  const arms: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const pivot = place(upper, new THREE.Group(), sx * 0.85, 1.42, 0);
    place(pivot, new THREE.Mesh(GEO.armBox, stoneMat), 0, -0.55, 0);
    const shard = place(pivot, new THREE.Mesh(GEO.crystal, crystalMat), 0, 0.12, 0);
    shard.rotation.z = -sx * 0.5;
    arms.push(pivot);
  }

  let armPose = 0;
  let torsoLean = 0;

  return {
    height: 2.6,
    radius: 1.3,
    animate(dt, a) {
      const tele = M.clamp(a.telegraph, 0, 1);

      // 팔: 예고 시 머리 위로 들고, 공격 시 앞으로 내려친다
      const armTarget = a.attacking ? -1.35 : -2.6 * tele + Math.sin(a.time * 1.6) * 0.04;
      armPose = M.lerp(armPose, armTarget, Math.min(1, dt * (a.attacking ? 16 : 6)));
      for (const arm of arms) arm.rotation.x = armPose;

      // 상체 기울기와 예고 떨림
      const leanTarget = a.attacking ? 0.15 : 0;
      torsoLean = M.lerp(torsoLean, leanTarget, Math.min(1, dt * 8));
      upper.rotation.x = torsoLean;
      upper.position.x = Math.sin(a.time * 40) * 0.02 * tele;

      // 핵: 맥동 + 예고 시 밝아짐
      const pulse = 0.5 + 0.5 * Math.sin(a.time * 4);
      coreMesh.scale.setScalar(1 + pulse * 0.12 + tele * 0.2);
      coreMesh.rotation.y = a.time * 1.5;
      coreMat.emissiveIntensity += tele * 2.0 + pulse * 0.2;
      crystalMat.emissiveIntensity += tele * 0.8;
    },
  };
};

const BUILDERS: Record<MonsterKind, Builder> = {
  slime: buildSlime,
  spiker: buildSpiker,
  bat: buildBat,
  caster: buildCaster,
  golem: buildGolem,
};

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

export function createMonsterModel(kind: MonsterKind): MonsterModel {
  const group = new THREE.Group();
  const pivot = new THREE.Group(); // 죽음 연출(팝/스핀)을 담당. group.rotation.y 는 게임 코드 몫.
  group.add(pivot);
  const ctx = new Ctx();
  const rig = BUILDERS[kind](pivot, ctx);

  return {
    group,
    height: rig.height,
    radius: rig.radius,
    update(dt, a) {
      const night = M.clamp(a.night, 0, 1);
      const hurt = M.clamp(a.hurt, 0, 1);
      const dying = M.clamp(a.dying, 0, 1);

      // 1) 매 프레임 기본값으로 되돌린 뒤
      for (const f of ctx.flash) {
        f.mat.emissive.copy(f.baseEmissive);
        f.mat.emissiveIntensity = f.baseIntensity;
      }
      const glowI = 0.4 + 1.6 * night;
      for (const g of ctx.glows) g.emissiveIntensity = glowI;

      // 2) 종류별 애니메이션
      rig.animate(dt, a);

      // 3) 피격 플래시: 몸체를 흰색으로 밝힌다
      if (hurt > 0) {
        for (const f of ctx.flash) {
          f.mat.emissive.lerp(WHITE, hurt * 0.9);
          f.mat.emissiveIntensity += hurt * 1.2;
        }
      }

      // 4) 죽음: 0.15까지 팝(1.2배), 그 뒤 0으로 줄며 회전
      if (dying > 0) {
        const pop = dying < 0.15 ? M.lerp(1, 1.2, dying / 0.15) : M.lerp(1.2, 0, (dying - 0.15) / 0.85);
        pivot.scale.setScalar(Math.max(0.001, pop));
        pivot.rotation.y = dying * TAU * 1.5;
        pivot.visible = dying < 1;
      } else {
        pivot.scale.setScalar(1);
        pivot.rotation.y = 0;
        pivot.visible = true;
      }
    },
    dispose() {
      for (const m of ctx.owned) m.dispose();
      ctx.owned.length = 0;
    },
  };
}

/** 적 투사체 오브: 분홍 코어 + 맥동하는 가산 합성 할로 */
export function createOrb(): { mesh: THREE.Object3D; update(t: number): void; dispose(): void } {
  const mesh = new THREE.Group();
  const coreMat = new THREE.MeshBasicMaterial({ color: '#ffb3d1' });
  const haloMat = new THREE.MeshBasicMaterial({
    color: '#ff6fa3', transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const innerMat = new THREE.MeshBasicMaterial({
    color: '#ffd6e8', transparent: true, opacity: 0.25,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const core = new THREE.Mesh(GEO.orbCore, coreMat);
  const halo = new THREE.Mesh(GEO.orbHalo, haloMat);
  const inner = new THREE.Mesh(GEO.orbHalo, innerMat);
  inner.scale.setScalar(0.75);
  mesh.add(core, halo, inner);

  return {
    mesh,
    update(t: number) {
      halo.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
      inner.scale.setScalar(0.75 * (1 + Math.sin(t * 9 + 1) * 0.1));
      core.rotation.y = t * 2;
    },
    dispose() {
      coreMat.dispose();
      haloMat.dispose();
      innerMat.dispose();
    },
  };
}

/** 타락한 균열 코어. 원점은 지면. hp01 이 낮을수록 금이 가고 작아지고 어두워진다. */
export function createRiftCore(): { group: THREE.Group; update(t: number, hp01: number, active: boolean): void; flash(): void } {
  const group = new THREE.Group();

  // 바닥의 어두운 포털 원반 + 회전하는 링
  const discMat = new THREE.MeshBasicMaterial({ color: '#1d1433', transparent: true, opacity: 0.9, depthWrite: false });
  const disc = new THREE.Mesh(GEO.riftDisc, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  const groundRingMat = new THREE.MeshBasicMaterial({
    color: '#b98bff', transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const groundRing = new THREE.Mesh(GEO.riftRing, groundRingMat);
  groundRing.rotation.x = Math.PI / 2;
  groundRing.position.y = 0.05;
  group.add(disc, groundRing);

  // 떠 있는 수정
  const crystalRoot = new THREE.Group();
  crystalRoot.position.y = 2.0;
  group.add(crystalRoot);
  const crystalMat = new THREE.MeshLambertMaterial({
    color: '#2e2148', emissive: '#8a5cff', emissiveIntensity: 0.9, flatShading: true,
  });
  const crystal = new THREE.Mesh(GEO.riftCrystal, crystalMat);
  crystalRoot.add(crystal);

  // 금 (체력이 떨어질 때 단계적으로 나타남)
  const crackMat = new THREE.MeshBasicMaterial({ color: '#0d0820' });
  const cracks: THREE.Mesh[] = [];
  const crackThresholds = [0.8, 0.6, 0.4];
  for (let i = 0; i < crackThresholds.length; i++) {
    const c = new THREE.Mesh(GEO.riftCrack, crackMat);
    const ang = i * 2.1 + 0.5;
    c.position.set(Math.cos(ang) * 0.72, Math.sin(i * 1.7) * 0.2, Math.sin(ang) * 0.72);
    c.lookAt(0, 0, 0);
    crystal.add(c);
    cracks.push(c);
  }

  // 두 개의 궤도 링
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#c18bff', transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ring1 = new THREE.Mesh(GEO.riftOrbitRing, ringMat);
  ring1.rotation.x = Math.PI / 2.2;
  const ring2 = new THREE.Mesh(GEO.riftOrbitRing, ringMat);
  ring2.rotation.z = Math.PI / 2.6;
  crystalRoot.add(ring1, ring2);

  const DARK = new THREE.Color('#2e2148');
  const CREAM = new THREE.Color('#fff4d6');
  const PURPLE = new THREE.Color('#8a5cff');
  const GOLD = new THREE.Color('#ffd98a');
  const RING_PURPLE = new THREE.Color('#c18bff');
  const RING_GOLD = new THREE.Color('#ffe9a8');
  const DISC_DARK = new THREE.Color('#1d1433');
  const DISC_CALM = new THREE.Color('#fff1cf');
  const GROUND_RING_PURPLE = new THREE.Color('#b98bff');
  const GROUND_RING_GOLD = new THREE.Color('#ffe2a0');
  const FLASH = new THREE.Color(1, 1, 1);

  let flashT = 0;
  let lastT = 0;
  let hasLast = false;

  return {
    group,
    update(t: number, hp01: number, active: boolean) {
      const dt = hasLast ? M.clamp(t - lastT, 0, 0.1) : 0;
      lastT = t;
      hasLast = true;
      flashT = Math.max(0, flashT - dt * 4);

      const hp = M.clamp(hp01, 0, 1);
      const calm = active ? 0 : 1;
      const damage = 1 - hp;

      // 움직임: 정화되면 느려지고 떠오르는 높이가 안정된다
      crystal.rotation.y = t * M.lerp(0.6, 0.15, calm);
      crystal.rotation.x = Math.sin(t * 0.4) * 0.2;
      crystalRoot.position.y = 2.0 + Math.sin(t * M.lerp(2, 1, calm)) * M.lerp(0.12, 0.05, calm);
      crystalRoot.position.x = active ? Math.sin(t * 40) * 0.02 * damage : 0;
      ring1.rotation.y = t * M.lerp(1.4, 0.4, calm);
      ring2.rotation.x = t * M.lerp(-1.0, -0.3, calm);

      // 크기: 체력이 낮으면 줄어든다
      const s = M.lerp(0.55, 1, hp);
      crystal.scale.set(s, s * 1.2, s);

      // 금: 체력 임계값을 넘으면 하나씩 드러남
      for (let i = 0; i < cracks.length; i++) {
        cracks[i].visible = hp < crackThresholds[i];
      }

      // 색: 활성은 보라, 정화되면 크림/금
      crystalMat.color.lerpColors(DARK, CREAM, calm);
      crystalMat.emissive.lerpColors(PURPLE, GOLD, calm).lerp(FLASH, flashT * 0.7);
      crystalMat.emissiveIntensity = (0.3 + 0.9 * hp) + flashT * 2.5;

      ringMat.color.lerpColors(RING_PURPLE, RING_GOLD, calm);
      ringMat.opacity = M.lerp(0.35, 0.85, hp) * (calm ? 0.8 : 1);

      groundRingMat.color.lerpColors(GROUND_RING_PURPLE, GROUND_RING_GOLD, calm);
      groundRingMat.opacity = M.lerp(0.4, 0.85, hp);

      discMat.color.lerpColors(DISC_DARK, DISC_CALM, calm);
      discMat.opacity = M.lerp(0.5, 0.9, hp);
    },
    flash() {
      flashT = 1;
    },
  };
}

/** 수집용 별조각: 두 개의 늘어난 팔면체가 교차한 금색 4각 별 + 은은한 할로. 원점은 중심. */
export function createShard(): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group();
  const core = new THREE.Group();
  group.add(core);

  const goldMat = new THREE.MeshLambertMaterial({
    color: '#ffe27a', emissive: '#ffb938', emissiveIntensity: 0.6, flatShading: true,
  });
  const vertical = new THREE.Mesh(GEO.shardGem, goldMat);
  vertical.scale.set(1, 1.8, 0.45);
  const horizontal = new THREE.Mesh(GEO.shardGem, goldMat);
  horizontal.scale.set(1, 1.8, 0.45);
  horizontal.rotation.z = Math.PI / 2;
  core.add(vertical, horizontal);

  const haloMat = new THREE.MeshBasicMaterial({
    color: '#fff3b0', transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const halo = new THREE.Mesh(GEO.shardHalo, haloMat);
  group.add(halo);

  return {
    group,
    update(t: number) {
      core.rotation.y = t * 2;
      core.position.y = Math.sin(t * 2.2) * 0.12;
      halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    },
  };
}
