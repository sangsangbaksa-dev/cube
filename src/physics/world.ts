import { surfaceNormal, waterHeightAt, type Terrain } from './terrain';
import { FIXED_DT } from './clock';

// ---- 손맛 상수 (여기만 만지면 점프 느낌이 바뀐다) ----
export const HALF = 0.5; // 큐브 반 크기 (중심 y = 지면 + HALF)
export const GRAVITY = 36;
export const JUMP_HEIGHT = 2.4; // 버튼을 끝까지 누를 때의 높이
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
export const CUT_MULT = 2.6; // 상승 중 버튼을 떼면 중력 배수 (짧은 점프)
export const FALL_MULT = 1.35; // 하강은 살짝 묵직하게
export const TERMINAL_V = 38;
export const COYOTE_TIME = 0.1; // 발판을 벗어난 뒤에도 점프가 먹히는 유예
export const JUMP_BUFFER = 0.12; // 착지 직전에 누른 점프를 기억해 주는 시간
export const MAX_SPEED = 9;
export const GROUND_ACCEL = 70;
export const GROUND_FRICTION = 55;
export const AIR_ACCEL = 28;
export const SNAP_DISTANCE = 0.4; // 내리막에서 지면에 붙어 있게 하는 거리
export const WALKABLE_NORMAL_Y = 0.62; // 이보다 가파르면 미끄러진다 (~52°)
export const SLIDE_ACCEL = 30;

// ---- 액션 상수 (이단 점프, 대시, 내려찍기, 넉백) ----
export const AIR_JUMP_HEIGHT = 1.9;
export const AIR_JUMP_SPEED = Math.sqrt(2 * GRAVITY * AIR_JUMP_HEIGHT);
export const DASH_SPEED = 21;
export const DASH_TIME = 0.17;
export const DASH_COOLDOWN = 0.45;
export const SLAM_SPEED = 34;
/** 떠 있는 발판 위로 올라설 때 허용하는 발 높이 오차 */
export const STEP_UP = 0.3;

export const FLOAT_DEPTH = 0.25; // 물에서 큐브 밑면이 수면 아래로 잠기는 깊이
export const WATER_SPEED = 0.7; // 물에서의 이동 속도 배수

/**
 * 나무/바위/발판 같은 충돌체. 기본은 원기둥(r)이고 hx/hz가 있으면 축 정렬 상자다.
 * top이 Infinity면 올라설 수 없다. collisionBottom이 있으면 그 아래로 지나갈 수 있고 머리를 부딪친다.
 */
export interface Obstacle {
  x: number;
  z: number;
  r: number;
  top: number;
  /** 상자 반 크기 (있으면 원기둥 대신 상자) */
  hx?: number;
  hz?: number;
  /** 움직이는 발판: 이번 스텝에서 이동한 거리. 위에 선 큐브를 함께 옮긴다 */
  dx?: number;
  dy?: number;
  dz?: number;
  collisionBottom?: number;
  collisionTop?: number;
  /** 마법진: 밟으면 점프 속도의 몇 배로 쏘아 올린다 */
  launch?: number;
  launchVector?: { x: number; z: number };
  ice?: boolean;
  disabled?: boolean;
}
export interface ObstacleSource {
  near(x: number, z: number): readonly Obstacle[];
}

export interface PhysicsInput {
  /** 월드 좌표계의 이동 방향. 길이 0~1 */
  moveX: number;
  moveZ: number;
  /** 이번 스텝에서 점프 버튼이 새로 눌렸는가 */
  jumpPressed: boolean;
  /** 점프 버튼이 눌려 있는가 */
  jumpHeld: boolean;
  /** 수영 중 잠수 버튼을 누르고 있는가 */
  diveHeld?: boolean;
  /** 이번 스텝에서 대시가 눌렸는가 */
  dashPressed?: boolean;
  /** 이번 스텝에서 내려찍기를 시작하는가 (공중에서만 먹힌다) */
  slamPressed?: boolean;
  /** 입력이 없을 때 대시할 방향 (바라보는 방향) */
  faceX?: number;
  faceZ?: number;
  updraft?: boolean;
}

/** 풀린 능력. 게임 진행에 따라 바뀐다 */
export interface Abilities {
  airJumps: number;
  dash: boolean;
}

/** (x, z)가 충돌체 안쪽(pad만큼 넓힌 범위)에 있는가 */
export function insideObstacle(o: Obstacle, x: number, z: number, pad: number): boolean {
  if (o.hx !== undefined) return Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < (o.hz ?? o.hx) + pad;
  return Math.hypot(x - o.x, z - o.z) < o.r + pad;
}

export interface PhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  onSteep: boolean;
  /** 물 위에 떠 있는가 */
  inWater: boolean;
  /** 수면 아래에서 수영 중인가 */
  submerged: boolean;
  /** 큐브 밑면 아래 지지면의 높이 */
  groundY: number;
  coyote: number;
  buffer: number;
  /** 직전 스텝의 위치 (렌더 보간용) */
  px: number;
  py: number;
  pz: number;
  /** 이번 스텝에 일어난 일 (연출용). 매 스텝 초기화된다. */
  jumped: boolean;
  landImpact: number;
  /** 이번 스텝에 마법진에서 발사되었는가 */
  launched: boolean;
  /** 발사 중에는 버튼을 떼도 높이가 깎이지 않는다 */
  noCut: boolean;
  /** 남은 공중 점프 횟수 */
  airJumpsLeft: number;
  /** 이번 스텝에 공중 점프를 했는가 */
  airJumped: boolean;
  /** 대시 남은 시간 / 재사용 대기 */
  dashT: number;
  dashCd: number;
  /** 공중에서 대시를 이미 썼는가 (착지하면 다시 쓸 수 있다) */
  airDashUsed: boolean;
  /** 이번 스텝에 대시를 시작했는가 */
  dashed: boolean;
  /** 내려찍는 중인가 / 이번 스텝에 내려찍기로 착지했는가 */
  slamming: boolean;
  slamLanded: boolean;
  /** 내려찍기를 시작한 높이 (착지 위력 계산용) */
  slamFrom: number;
  /** 넉백 경직: 남은 시간 동안 조작이 약해진다 */
  stunT: number;
  /** 지금 밟고 있는 충돌체 (발판). 없으면 null */
  standingOn: Obstacle | null;
}

export class PhysicsWorld {
  readonly state: PhysicsState;
  private readonly normal = { x: 0, y: 1, z: 0 };

  private sampledWater = false;
  private sampledRaised = false;
  private sampledObstacle: Obstacle | null = null;
  readonly abilities: Abilities = { airJumps: 0, dash: false };

  constructor(
    private readonly terrain: Terrain,
    x = 0,
    z = 0,
    private readonly obstacles?: ObstacleSource,
  ) {

    const g = this.sample(x, z);
    const y = g + HALF;
    this.state = {
      x, y, z, vx: 0, vy: 0, vz: 0,
      grounded: true, onSteep: false, inWater: this.sampledWater, submerged: false, groundY: g,
      coyote: COYOTE_TIME, buffer: 0,
      px: x, py: y, pz: z,
      jumped: false, landImpact: 0, launched: false, noCut: false,
      airJumpsLeft: 0, airJumped: false, dashT: 0, dashCd: 0, airDashUsed: false, dashed: false,
      slamming: false, slamLanded: false, slamFrom: 0, stunT: 0, standingOn: null,
    };
  }

  /** 넉백 같은 외부 충격. 대시/내려찍기를 끊고 잠깐 조작을 약하게 만든다. */
  impulse(vx: number, vy: number, vz: number, stun = 0.25) {
    const s = this.state;
    s.vx = vx; s.vz = vz;
    if (vy > 0) { s.vy = vy; s.grounded = false; s.coyote = 0; s.standingOn = null; }
    s.dashT = 0;
    s.slamming = false;
    s.stunT = Math.max(s.stunT, stun);
  }

  /** 몬스터 머리를 밟았을 때처럼 위로 튕긴다. 공중 점프와 대시가 다시 채워진다. */
  bounce(vy: number) {
    const s = this.state;
    s.vy = vy;
    s.grounded = false;
    s.coyote = 0;
    s.slamming = false;
    s.noCut = false;
    s.standingOn = null;
    s.airJumpsLeft = this.abilities.airJumps;
    s.airDashUsed = false;
  }

  /** 순간이동 (부활 등) */
  teleport(x: number, y: number, z: number) {
    const s = this.state;
    s.x = s.px = x; s.y = s.py = y; s.z = s.pz = z;
    s.vx = s.vy = s.vz = 0;
    s.grounded = false; s.submerged = false; s.slamming = false; s.dashT = 0; s.stunT = 0;
    s.coyote = s.buffer = s.dashCd = 0;
    s.airDashUsed = s.noCut = false;
    s.standingOn = null;
  }

  /**
   * 큐브 밑면 아래 지지면의 높이. 모서리까지 샘플링해 비탈에서 파고들지 않게 하고,
   * 올라설 수 있는 바위 윗면과 수면(물에 뜨는 높이)도 포함한다.
   */
  private sample(x: number, z: number, underWater = false, feet = Infinity): number {
    const t = this.terrain;
    const r = HALF * 0.85;
    let g = Math.max(t.height(x, z), t.height(x + r, z), t.height(x - r, z), t.height(x, z + r), t.height(x, z - r));
    this.sampledRaised = false;
    this.sampledObstacle = null;
    if (this.obstacles && !underWater) {
      for (const o of this.obstacles.near(x, z)) {
        if (o.disabled || o.top === Infinity || o.top <= g) continue;
        // 발이 윗면보다 한참 아래면(밑으로 지나가는 중) 지지면이 아니다
        if (feet < o.top - STEP_UP) continue;
        if (insideObstacle(o, x, z, HALF * 0.6)) {
          g = o.top;
          this.sampledRaised = true;
          this.sampledObstacle = o;
        }
      }
    }
    const surface = waterHeightAt(this.terrain, x, z) - FLOAT_DEPTH;
    this.sampledWater = surface > g;
    return this.sampledWater && !underWater ? surface : g;
  }

  step(input: PhysicsInput, dt = FIXED_DT): void {
    const s = this.state;
    const ab = this.abilities;

    // 0) 움직이는 발판 위에 서 있으면 발판과 함께 움직인다
    const carrier = s.grounded && !s.standingOn?.disabled ? s.standingOn : null;
    if (carrier && (carrier.dx || carrier.dy || carrier.dz)) {
      s.x += carrier.dx ?? 0;
      s.y += carrier.dy ?? 0;
      s.z += carrier.dz ?? 0;
    }

    s.px = s.x; s.py = s.y; s.pz = s.z;
    s.jumped = false;
    s.launched = false;
    s.landImpact = 0;
    s.airJumped = false;
    s.dashed = false;
    s.slamLanded = false;
    if (s.vy <= 0) s.noCut = false;
    s.stunT = Math.max(0, s.stunT - dt);
    s.dashCd = Math.max(0, s.dashCd - dt);

    // 1) 수평 이동: 목표 속도를 향해 가속/마찰
    const inLen = Math.hypot(input.moveX, input.moveZ);
    const hasInput = inLen > 0.001;
    const scale = hasInput ? Math.min(1, inLen) / inLen : 0;

    // 1.1) 대시 시작: 입력 방향(없으면 바라보는 방향)으로 짧게 미끄러진다
    if (input.dashPressed && ab.dash && s.dashCd <= 0 && !s.submerged && !s.slamming && s.stunT <= 0 && (s.grounded || !s.airDashUsed)) {
      let dx = hasInput ? input.moveX / inLen : input.faceX ?? 0;
      let dz = hasInput ? input.moveZ / inLen : input.faceZ ?? 1;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      s.vx = dx * DASH_SPEED;
      s.vz = dz * DASH_SPEED;
      s.vy = Math.max(s.vy, 0);
      s.dashT = DASH_TIME;
      s.dashCd = DASH_COOLDOWN;
      if (!s.grounded) s.airDashUsed = true;
      s.dashed = true;
    }

    const speed = MAX_SPEED * (s.inWater && (s.grounded || s.submerged) ? WATER_SPEED : 1);
    const control = s.stunT > 0 ? 0.25 : 1;
    if (s.dashT > 0) {
      s.dashT -= dt;
      if (s.dashT <= 0) {
        // 대시가 끝나면 최고 속도로 부드럽게 돌아온다
        const h = Math.hypot(s.vx, s.vz);
        if (h > speed) { s.vx *= speed / h; s.vz *= speed / h; }
      }
    } else if (s.slamming) {
      s.vx *= Math.max(0, 1 - dt * 12);
      s.vz *= Math.max(0, 1 - dt * 12);
    } else {
      const tvx = input.moveX * scale * speed;
      const tvz = input.moveZ * scale * speed;
      // 넉백으로 최고 속도보다 빠를 때는 공중에서 천천히 줄어든다
      const groundAccel = carrier?.ice ? (hasInput ? 26 : 6) : (hasInput ? GROUND_ACCEL : GROUND_FRICTION);
      const accel = (s.grounded ? groundAccel : AIR_ACCEL) * control;
      const dvx = tvx - s.vx;
      const dvz = tvz - s.vz;
      const dlen = Math.hypot(dvx, dvz);
      const maxDv = accel * dt;
      if (dlen <= maxDv) {
        s.vx = tvx; s.vz = tvz;
      } else {
        s.vx += (dvx / dlen) * maxDv;
        s.vz += (dvz / dlen) * maxDv;
      }
    }

    // 잠수 중에는 수면을 바닥으로 취급하지 않고 수영 속도로 수직 이동한다.
    const floatY = waterHeightAt(this.terrain, s.x, s.z) - FLOAT_DEPTH + HALF;
    if ((input.diveHeld && s.inWater && s.y <= floatY + 0.1) || s.submerged) {
      s.submerged = true;
      s.slamming = false;
      s.dashT = 0;
      s.standingOn = null;
      s.buffer = s.coyote = 0;
      s.jumped = false;
      const vertical = input.diveHeld ? -4 : input.jumpHeld ? 4 : 0.8;
      s.vy += (vertical - s.vy) * Math.min(1, dt * 7);
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.y += s.vy * dt;
      const floor = this.sample(s.x, s.z, true);
      s.inWater = this.sampledWater;
      s.groundY = floor;
      s.onSteep = false;
      s.grounded = false;
      if (s.y < floor + HALF) {
        s.y = floor + HALF;
        s.vy = Math.max(0, s.vy);
      }
      const nextFloatY = waterHeightAt(this.terrain, s.x, s.z) - FLOAT_DEPTH + HALF;
      if (!s.inWater || s.y >= nextFloatY) {
        s.submerged = false;
        s.grounded = true;
        s.groundY = s.inWater ? nextFloatY - HALF : floor;
        s.y = s.groundY + HALF;
        s.vy = 0;
      }
      return;
    }

    // 2) 타이머: 코요테 / 점프 버퍼
    if (s.onSteep) s.coyote = 0; // 가파른 비탈에서는 점프 불가
    else s.coyote = s.grounded ? COYOTE_TIME : Math.max(0, s.coyote - dt);
    s.buffer = input.jumpPressed ? JUMP_BUFFER : Math.max(0, s.buffer - dt);
    if (s.grounded || s.inWater) {
      s.airJumpsLeft = ab.airJumps;
      s.airDashUsed = false;
    }

    // 3) 점프 (땅) → 안 되면 공중 점프
    if (s.buffer > 0 && s.coyote > 0) {
      s.vy = JUMP_SPEED;
      s.grounded = false;
      s.coyote = 0;
      s.buffer = 0;
      s.jumped = true;
      s.standingOn = null;
      s.dashT = 0;
    } else if (input.jumpPressed && !s.grounded && s.airJumpsLeft > 0 && !s.slamming && s.stunT <= 0) {
      s.vy = AIR_JUMP_SPEED;
      s.airJumpsLeft--;
      s.buffer = 0;
      s.airJumped = true;
      s.noCut = false;
      s.dashT = 0;
    }

    // 3.5) 내려찍기: 공중에서 시작하면 곧장 떨어진다
    if (input.slamPressed && !s.grounded && !s.inWater && !s.slamming) {
      s.slamming = true;
      s.slamFrom = s.y;
      s.dashT = 0;
    }

    // 4) 중력 (상승 중 버튼을 떼면 더 강하게 → 가변 점프 높이)
    if (input.updraft && !s.grounded && !s.slamming && !s.inWater) {
      s.vy = Math.max(s.vy, 7.1);
      s.noCut = true;
    }
    const vyOld = s.vy;
    if (s.slamming) {
      s.vy = -SLAM_SPEED;
    } else if (s.dashT > 0) {
      s.vy = Math.max(0, s.vy - GRAVITY * 0.15 * dt); // 대시 중에는 거의 뜬 채로 나아간다
    } else {
      let g = GRAVITY;
      if (s.vy > 0 && !input.jumpHeld && !s.noCut) g *= CUT_MULT;
      else if (s.vy < 0) g *= FALL_MULT;
      s.vy = Math.max(-TERMINAL_V, s.vy - g * dt);
    }

    // 5) 적분 (수직은 평균 속도 → 일정 중력에서 정확)
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.y += ((vyOld + s.vy) / 2) * dt;

    // 5.5) 충돌체 옆면과 밑면: 밑면이 윗면보다 낮으면 밀어내고, 떠 있는 발판에는 머리를 부딪친다
    if (this.obstacles) {
      const feetPrev = s.py - HALF;
      for (const o of this.obstacles.near(s.x, s.z)) {
        if (o.disabled) continue;
        const bottom = o.collisionBottom ?? -Infinity;
        if (feetPrev >= (o.collisionTop ?? o.top) - 0.1) continue;
        if (s.y + HALF <= bottom) continue;
        // 아래에서 올라오다 밑면에 머리를 부딪침
        if (s.py + HALF <= bottom + 0.05 && insideObstacle(o, s.x, s.z, HALF * 0.6)) {
          s.y = bottom - HALF;
          if (s.vy > 0) s.vy = 0;
          continue;
        }
        this.pushOut(o, s);
      }
    }

    // 6) 지면 처리
    const ground = this.sample(s.x, s.z, false, Math.max(s.py, s.y) - HALF) + HALF;
    s.inWater = this.sampledWater;
    s.groundY = ground - HALF;
    const wasGrounded = s.grounded;
    s.onSteep = false;
    if (s.y <= ground && s.vy <= 0) {
      if (!wasGrounded) s.landImpact = -s.vy;
      if (s.slamming) {
        s.slamming = false;
        s.slamLanded = !s.inWater;
        s.vx = s.vz = 0;
      }
      s.y = ground;
      s.vy = 0;
      s.grounded = true;
    } else if (s.y < ground) {
      s.y = ground; // 상승 중 언덕 옆면에 닿음: 위로 밀어 올릴 뿐 속도는 유지
    } else if (wasGrounded && !s.jumped && !s.dashed && s.dashT <= 0 && s.y - ground <= SNAP_DISTANCE) {
      s.y = ground; // 내리막에서 둥둥 뜨지 않게 지면에 붙인다
      s.vy = 0;
      s.grounded = true;
    } else {
      s.grounded = false;
    }
    s.standingOn = s.grounded && this.sampledRaised ? this.sampledObstacle : null;

    // 6.5) 마법진/튕김 발판: 위에 서 있으면 하늘로 쏘아 올린다
    if (this.obstacles && s.grounded && !s.inWater) {
      for (const o of this.obstacles.near(s.x, s.z)) {
        if (!o.disabled && o.launch && (o.hx !== undefined ? s.standingOn === o : insideObstacle(o, s.x, s.z, 0))) {
          s.vy = JUMP_SPEED * o.launch;
          if (o.launchVector) {
            s.vx = o.launchVector.x;
            s.vz = o.launchVector.z;
            s.stunT = .24;
          }
          s.grounded = false;
          s.coyote = 0;
          s.buffer = 0;
          s.noCut = true;
          s.launched = true;
          s.standingOn = null;
          s.airJumpsLeft = ab.airJumps;
          s.airDashUsed = false;
          break;
        }
      }
    }

    // 7) 너무 가파른 비탈은 미끄러진다 (점프도 못 함)
    if (s.grounded && !s.inWater && !this.sampledRaised) {
      const n = surfaceNormal(this.terrain, s.x, s.z, this.normal);
      if (n.y < WALKABLE_NORMAL_Y) {
        s.onSteep = true;
        const k = SLIDE_ACCEL * dt / Math.max(0.0001, Math.hypot(n.x, n.z));
        s.vx += n.x * k;
        s.vz += n.z * k;
      }
    }
  }

  /** 옆면에서 밀어낸다. 원기둥은 중심에서 바깥으로, 상자는 가장 가까운 면 쪽으로. */
  private pushOut(o: Obstacle, s: PhysicsState) {
    const pad = HALF * 0.9;
    let nx: number, nz: number;
    if (o.hx !== undefined) {
      const hx = o.hx, hz = o.hz ?? o.hx;
      const lx = s.x - o.x, lz = s.z - o.z;
      const cx = Math.max(-hx, Math.min(hx, lx));
      const cz = Math.max(-hz, Math.min(hz, lz));
      let dx = lx - cx, dz = lz - cz;
      let d = Math.hypot(dx, dz);
      if (d >= pad) return;
      if (d < 1e-5) {
        // 중심이 상자 안: 가장 얕은 면으로 꺼낸다
        const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
        if (px < pz) { dx = Math.sign(lx) || 1; dz = 0; s.x = o.x + dx * (hx + pad); }
        else { dz = Math.sign(lz) || 1; dx = 0; s.z = o.z + dz * (hz + pad); }
        nx = dx; nz = dz;
      } else {
        nx = dx / d; nz = dz / d;
        s.x = o.x + cx + nx * pad;
        s.z = o.z + cz + nz * pad;
      }
    } else {
      let dx = s.x - o.x;
      let dz = s.z - o.z;
      let d = Math.hypot(dx, dz);
      const min = o.r + pad;
      if (d >= min) return;
      if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
      nx = dx / d;
      nz = dz / d;
      s.x = o.x + nx * min;
      s.z = o.z + nz * min;
    }
    const vn = s.vx * nx + s.vz * nz;
    if (vn < 0) { s.vx -= vn * nx; s.vz -= vn * nz; }
  }
}
