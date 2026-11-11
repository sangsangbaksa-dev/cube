import * as THREE from 'three';

// 플레이어를 따라다니는 꼬마별 동반자.

interface Vec3 { x: number; y: number; z: number }

// 목표 자세: 플레이어 뒤쪽 어깨 위
const BACK = 1.3; // 뒤 거리
const SIDE = 0.7; // 옆 거리 (플레이어 오른쪽)
const UP = 1.1; // 높이
const BOB_AMP = 0.12; // 둥실거림 진폭
const BOB_SPEED = 2.2; // 둥실거림 속도 (rad/s)

// 임계감쇠 스프링
const K = 28; // 강성
const C = 2 * Math.sqrt(K); // 감쇠 (임계)
const SNAP_DIST = 25; // 이만큼 떨어지면(순간이동) 바로 붙는다
const MAX_DT = 0.5; // 한 번에 적분하는 최대 시간 (프레임이 멈춰도 폭주하지 않게)
const MAX_H = 1 / 120; // 서브스텝 최대 길이

const AXES = ['x', 'y', 'z'] as const;

function isFiniteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** 목표를 따라가는 스프링 운동. DOM/THREE 없이 테스트할 수 있다. */
export class FollowerMotion {
  private readonly pos: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly vel: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly face = { x: 0, z: -1 }; // 정규화된 바라보는 방향 (수평)
  private started = false;

  /** 현재 위치 (복사본) */
  get position(): Vec3 { return { ...this.pos }; }
  /** 현재 속도 (기울기 연출용) */
  get velocity(): Readonly<Vec3> { return this.vel; }
  /** 마지막으로 쓴 바라보는 방향 (정규화, 수평) */
  get facing(): Readonly<{ x: number; z: number }> { return this.face; }

  /**
   * dt(초) 동안 목표(플레이어 위치)를 따라간다. 돌아온 값은 새 위치 복사본.
   * faceX/faceZ는 플레이어가 보는 방향(0이면 직전 방향 유지), time은 둥실거림용 누적 시간.
   */
  step(dt: number, target: Vec3, faceX: number, faceZ: number, time: number): Vec3 {
    if (!isFiniteVec(target) || !Number.isFinite(faceX) || !Number.isFinite(faceZ) || !Number.isFinite(time)) {
      return this.position;
    }

    const fl = Math.hypot(faceX, faceZ);
    if (fl > 1e-6) { this.face.x = faceX / fl; this.face.z = faceZ / fl; }
    const fx = this.face.x;
    const fz = this.face.z;
    const rx = -fz; // 오른쪽 방향 (바라보는 방향 기준)
    const rz = fx;

    const bob = Math.sin(time * BOB_SPEED) * BOB_AMP;
    const want: Vec3 = {
      x: target.x - fx * BACK + rx * SIDE,
      y: target.y + UP + bob,
      z: target.z - fz * BACK + rz * SIDE,
    };

    if (!this.started) {
      this.started = true;
      Object.assign(this.pos, want);
      return this.position;
    }

    const gap = Math.hypot(want.x - this.pos.x, want.y - this.pos.y, want.z - this.pos.z);
    if (gap > SNAP_DIST) {
      Object.assign(this.pos, want);
      this.vel.x = this.vel.y = this.vel.z = 0;
      return this.position;
    }

    if (!(dt > 0)) return this.position;

    // 서브스텝 (반암시적 오일러): dt가 커도 스프링이 튀지 않는다
    const total = Math.min(dt, MAX_DT);
    const n = Math.ceil(total / MAX_H);
    const h = total / n;
    for (let i = 0; i < n; i++) {
      for (const k of AXES) {
        const a = K * (want[k] - this.pos[k]) - C * this.vel[k];
        this.vel[k] += a * h;
        this.pos[k] += this.vel[k] * h;
      }
    }
    return this.position;
  }
}

/** 다섯 꼭짓점 별 윤곽 */
function starShape(outer: number, inner: number, points: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

const CHEER_TIME = 0.8; // 초
const CHEER_SCALE = 0.4; // 커지는 정도
const TILT_MAX = 0.35; // 기울기 한계 (rad)

/** 꼬마별 동반자 (THREE 객체) */
export class Companion {
  readonly group = new THREE.Group();
  private readonly motion = new FollowerMotion();
  private readonly tilt = new THREE.Group(); // 이동 방향 기울기
  private readonly body = new THREE.Group(); // 축하 연출 크기
  private readonly spinner = new THREE.Group(); // 느린 Y축 회전
  private readonly starMat: THREE.MeshBasicMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly light: THREE.PointLight;
  private spin = 0;
  private cheerLeft = 0;

  constructor() {
    const geo = new THREE.ExtrudeGeometry(starShape(0.34, 0.15, 5), {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
      curveSegments: 1,
    });
    geo.center();
    this.starMat = new THREE.MeshBasicMaterial({ color: '#ffe066' }); // 조명 영향 없는 발광색
    this.spinner.add(new THREE.Mesh(geo, this.starMat));

    const eyeGeo = new THREE.SphereGeometry(0.035, 10, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#000000' });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(sx * 0.09, 0.03, 0.085);
      this.spinner.add(eye);
    }

    this.body.add(this.spinner);
    this.tilt.add(this.body);
    this.group.add(this.tilt);

    // 가산 혼합 후광 (작은 구)
    this.glowMat = new THREE.MeshBasicMaterial({
      color: '#ffd36b',
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), this.glowMat));

    // 밤길을 밝히는 빛 (밤일수록 강해짐)
    this.light = new THREE.PointLight('#ffd98a', 0, 7);
    this.group.add(this.light);
  }

  setVisible(v: boolean) { this.group.visible = v; }

  /** 별과 후광 색 */
  setColor(hex: string) {
    this.starMat.color.set(hex);
    this.glowMat.color.set(hex);
  }

  /** playerPos는 플레이어 위치, night는 0(낮)~1(밤) */
  update(dt: number, playerPos: Vec3, faceX: number, faceZ: number, time: number, night: number) {
    const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const n = Number.isFinite(night) ? Math.min(1, Math.max(0, night)) : 0;

    const p = this.motion.step(d, playerPos, faceX, faceZ, time);
    this.group.position.set(p.x, p.y, p.z);

    // 이동 방향으로 살짝 기울기
    const v = this.motion.velocity;
    const f = this.motion.facing;
    const fwd = v.x * f.x + v.z * f.z;
    const side = v.x * -f.z + v.z * f.x;
    const k = Math.min(1, d * 8);
    const lean = (val: number) => Math.min(TILT_MAX, Math.max(-TILT_MAX, val * 0.03));
    this.tilt.rotation.x += (-lean(fwd) - this.tilt.rotation.x) * k;
    this.tilt.rotation.z += (-lean(side) - this.tilt.rotation.z) * k;

    // 축하 연출: 한 바퀴 돌며 커졌다 작아진다
    let extraSpin = 0;
    let scale = 1;
    if (this.cheerLeft > 0) {
      this.cheerLeft = Math.max(0, this.cheerLeft - d);
      const t = 1 - this.cheerLeft / CHEER_TIME; // 0 → 1
      extraSpin = 2 * Math.PI * t * t * (3 - 2 * t);
      scale = 1 + CHEER_SCALE * Math.sin(Math.PI * t);
    }
    this.body.scale.setScalar(scale);

    this.spin += d * 1.0;
    this.spinner.rotation.y = this.spin + extraSpin;

    // 밤에 더 진해지는 후광과 빛
    this.glowMat.opacity = (0.09 + 0.04 * Math.sin(time * 3)) * (0.5 + 0.5 * n);
    this.light.intensity = 6 * n;
  }

  /** 업적/레벨업 때 호출: 0.8초 동안 빙글 돌고 커졌다 작아진다 */
  cheer() { this.cheerLeft = CHEER_TIME; }
}
