import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HALF } from '../physics/world';

/** 꼬리 잔상 개수 */
const TRAIL = 4;
/** 잔상용 위치를 남기는 간격(초) */
const HIST_STEP = 0.06;
/** 이만큼 한 번에 순간이동하면(리스폰 등) 잔상을 지운다 */
const JUMP_DIST = 4;

// 반투명 고스트 큐브. 진행 방향으로 돌고, 발광이 살짝 깜빡이며, 이전 위치에 잔상을 남긴다.
export class GhostCube {
  readonly group = new THREE.Group();
  private readonly color: THREE.Color;
  private readonly geo: RoundedBoxGeometry;
  private readonly head: THREE.Mesh;
  private readonly headMat: THREE.MeshLambertMaterial;
  private readonly trails: THREE.Mesh[] = [];
  private readonly trailMats: THREE.MeshLambertMaterial[] = [];
  /** 최근 위치 (맨 앞이 가장 최근) */
  private readonly hist: THREE.Vector3[] = [];
  private readonly headPos = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private hasPos = false;
  private yaw = 0;
  private targetYaw = 0;
  private nextHistAt = -Infinity;
  private lastTime: number | null = null;

  constructor(color = '#e5d6ff') {
    this.color = new THREE.Color(color);
    this.geo = new RoundedBoxGeometry(HALF * 2, HALF * 2, HALF * 2, 5, 0.16);

    this.headMat = new THREE.MeshLambertMaterial({
      color: this.color,
      emissive: this.color,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.head = new THREE.Mesh(this.geo, this.headMat);
    this.head.renderOrder = 3;
    this.head.visible = false;
    this.group.add(this.head);

    for (let i = 0; i < TRAIL; i++) {
      // 뒤로 갈수록 옅고 작게
      const mat = new THREE.MeshLambertMaterial({
        color: this.color,
        emissive: this.color,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.22 * (1 - i / TRAIL),
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.scale.setScalar(1 - 0.07 * (i + 1));
      mesh.renderOrder = 2 - i * 0.1;
      mesh.visible = false;
      this.trailMats.push(mat);
      this.trails.push(mesh);
      this.group.add(mesh);
    }
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  /**
   * 위치와 바라볼 방향. faceX/faceZ가 0이면 방향은 그대로 둔다.
   * 순간이동하면 잔상을 지운다.
   */
  setPosition(x: number, y: number, z: number, faceX = 0, faceZ = 0) {
    this.tmp.set(x, y, z);
    if (this.hasPos && this.tmp.distanceTo(this.headPos) > JUMP_DIST) {
      this.hist.length = 0;
      this.nextHistAt = -Infinity;
    }
    this.headPos.copy(this.tmp);
    this.hasPos = true;
    if (faceX * faceX + faceZ * faceZ > 0.01) this.targetYaw = Math.atan2(faceX, faceZ);
    this.head.position.copy(this.headPos);
    this.head.visible = true;
  }

  /** 매 프레임 호출. time은 초 단위 누적 시각 */
  update(time: number) {
    if (!this.group.visible || !this.hasPos) return;
    const dt = this.lastTime === null ? 0 : THREE.MathUtils.clamp(time - this.lastTime, 0, 0.1);
    this.lastTime = time;

    // 방향 회전 (최단 경로로 부드럽게)
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 10);
    this.head.rotation.y = this.yaw;

    // 발광 깜빡임
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
    this.headMat.emissiveIntensity = 0.3 + 0.35 * pulse;

    // 잔상용 이전 위치 기록
    if (time >= this.nextHistAt) {
      this.hist.unshift(this.headPos.clone());
      if (this.hist.length > TRAIL) this.hist.length = TRAIL;
      this.nextHistAt = time + HIST_STEP;
    }
    for (let i = 0; i < TRAIL; i++) {
      const p = this.hist[i];
      const mesh = this.trails[i];
      mesh.visible = p !== undefined;
      if (p) {
        mesh.position.copy(p);
        mesh.rotation.y = this.yaw;
        this.trailMats[i].emissiveIntensity = 0.15 + 0.2 * pulse;
      }
    }
  }
}
