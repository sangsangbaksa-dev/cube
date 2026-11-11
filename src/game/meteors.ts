// 밤하늘에서 떨어지는 별똥별 월드 이벤트. THREE 없이 순수 로직만 둔다.

export const NIGHT_START = 0.55;
/** 다음 별똥별까지 걸리는 시간 범위(초) */
export const SPAWN_GAP_MIN = 25;
export const SPAWN_GAP_MAX = 40;
/** 동시에 존재할 수 있는 별똥별(낙하 중 + 조각) 최대 개수 */
export const MAX_ACTIVE = 2;
/** 플레이어로부터 목표까지 거리 범위(m) */
export const TARGET_MIN = 14;
export const TARGET_MAX = 32;
/** 하늘 시작점: 목표 위 높이, 옆 오프셋 */
export const SKY_HEIGHT = 60;
export const SKY_SIDE = 30;
/** 낙하 시간(초) */
export const FALL_TIME = 2.2;
/** 착지한 조각이 남는 시간(초) */
export const LAND_LIFE = 20;
/** 만료 전 깜빡이는 구간(초) */
export const FADE_TIME = 5;
/** 조각 수집 거리(m) */
export const COLLECT_DIST = 1.6;
export const COIN_MIN = 8;
export const COIN_MAX = 15;

const WATER_Y = -2;
/** 목표 지점의 최대 경사(높이 변화율). 넘으면 다시 고른다 */
const MAX_SLOPE = 0.8;
const PICK_TRIES = 8;
/** 목표를 못 고른 뒤 다시 시도하기까지(초) */
const RETRY_DELAY = 1;

export interface Meteor {
  id: number;
  phase: 'falling' | 'landed';
  /** 현재 위치 */
  x: number; y: number; z: number;
  /** 착지 목표(지면) */
  tx: number; ty: number; tz: number;
  /** 생성 이후 경과 시간(초) */
  t: number;
  /** 착지 전엔 LAND_LIFE, 착지 후엔 남은 수명(초) */
  life: number;
  /** 착지 후 마지막 FADE_TIME 초 동안 true */
  fading: boolean;
}

export type MeteorEvent =
  | { kind: 'spawn'; meteor: Meteor }
  | { kind: 'impact'; meteor: Meteor }
  | { kind: 'collect'; meteor: Meteor; coins: number }
  | { kind: 'expire'; meteor: Meteor };

interface Vec3 { x: number; y: number; z: number }

export class MeteorShower {
  readonly meteors: Meteor[] = [];
  private readonly terrain: { height(x: number, z: number): number };
  private readonly rand: () => number;
  /** 다음 생성까지 남은 시간. 낮에는 흐르지 않는다 */
  private timer: number;
  private nextId = 1;
  /** 낙하 시작 위치(하늘). 낙하 중인 별똥별만 가진다 */
  private readonly from = new Map<number, Vec3>();

  constructor(opts: { height(x: number, z: number): number; rand?: () => number }) {
    this.terrain = opts;
    this.rand = opts.rand ?? Math.random;
    this.timer = this.gap();
  }

  step(dt: number, player: Vec3, night: number): MeteorEvent[] {
    const events: MeteorEvent[] = [];

    // 낙하, 착지, 수집, 만료 처리. 복사본을 돌려 중간에 지워도 안전하다
    for (const m of [...this.meteors]) {
      m.t += dt;
      if (m.phase === 'falling') {
        if (m.t < FALL_TIME) {
          this.placeFalling(m);
          continue;
        }
        m.phase = 'landed';
        m.x = m.tx; m.y = m.ty; m.z = m.tz;
        m.life = LAND_LIFE - (m.t - FALL_TIME);
        this.from.delete(m.id);
        events.push({ kind: 'impact', meteor: m });
      } else {
        m.life -= dt;
      }
      m.fading = m.phase === 'landed' && m.life <= FADE_TIME;

      if (m.phase !== 'landed') continue;
      if (dist3(player, m) < COLLECT_DIST) {
        this.remove(m);
        events.push({ kind: 'collect', meteor: m, coins: COIN_MIN + Math.floor(this.rand() * (COIN_MAX - COIN_MIN + 1)) });
      } else if (m.life <= 0) {
        this.remove(m);
        events.push({ kind: 'expire', meteor: m });
      }
    }

    // 밤에만 새로 생긴다
    if (night > NIGHT_START) {
      this.timer -= dt;
      if (this.timer <= 0 && this.meteors.length < MAX_ACTIVE) {
        const m = this.trySpawn(player);
        if (m) {
          events.push({ kind: 'spawn', meteor: m });
          this.timer = this.gap();
        } else {
          this.timer = RETRY_DELAY;
        }
      }
    }
    return events;
  }

  private gap(): number {
    return SPAWN_GAP_MIN + this.rand() * (SPAWN_GAP_MAX - SPAWN_GAP_MIN);
  }

  private trySpawn(p: Vec3): Meteor | null {
    for (let i = 0; i < PICK_TRIES; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = TARGET_MIN + this.rand() * (TARGET_MAX - TARGET_MIN);
      const tx = p.x + Math.cos(a) * d;
      const tz = p.z + Math.sin(a) * d;
      const ty = this.terrain.height(tx, tz);
      if (ty < WATER_Y || this.slope(tx, tz) > MAX_SLOPE) continue;

      const b = this.rand() * Math.PI * 2;
      const start: Vec3 = {
        x: tx + Math.cos(b) * SKY_SIDE,
        y: ty + SKY_HEIGHT,
        z: tz + Math.sin(b) * SKY_SIDE,
      };
      const m: Meteor = {
        id: this.nextId++, phase: 'falling',
        x: start.x, y: start.y, z: start.z,
        tx, ty, tz, t: 0, life: LAND_LIFE, fading: false,
      };
      this.meteors.push(m);
      this.from.set(m.id, start);
      return m;
    }
    return null;
  }

  /** 낙하 위치: 수평은 등속, 높이는 점점 빨라진다 */
  private placeFalling(m: Meteor) {
    const s = this.from.get(m.id);
    if (!s) return;
    const u = m.t / FALL_TIME;
    m.x = s.x + (m.tx - s.x) * u;
    m.y = s.y + (m.ty - s.y) * u * u;
    m.z = s.z + (m.tz - s.z) * u;
  }

  /** 중앙차분으로 경사 크기 계산 */
  private slope(x: number, z: number): number {
    const e = 1;
    const gx = (this.terrain.height(x + e, z) - this.terrain.height(x - e, z)) / (2 * e);
    const gz = (this.terrain.height(x, z + e) - this.terrain.height(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  }

  private remove(m: Meteor) {
    const i = this.meteors.indexOf(m);
    if (i >= 0) this.meteors.splice(i, 1);
    this.from.delete(m.id);
  }
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
