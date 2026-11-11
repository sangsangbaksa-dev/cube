// 빛구슬 질주: 열린 들판에서 제한 시간 안에 구슬을 최대한 모으는 미니게임.
// DOM/THREE 없이 동작하는 순수 로직. 시간은 step(dt)로만 흐르므로 멈춘 동안 콤보도 멈춘다.
import { readJSON, writeJSON } from './events';

export type OrbKind = 'normal' | 'gold' | 'time';
export interface Orb { id: number; kind: OrbKind; x: number; y: number; z: number }
export type RushState = 'idle' | 'running' | 'done';
export type RushEvent =
  | { kind: 'start' }
  | { kind: 'collect'; orb: Orb; points: number; combo: number }
  | { kind: 'time'; orb: Orb; bonus: number }
  | { kind: 'leaving'; dist: number }
  | { kind: 'end'; score: number; newBest: boolean; coins: number; aborted: boolean; collected: number };

export interface OrbRushSave { best: number }
export interface OrbRushStorage { get(): unknown; set(v: OrbRushSave): void }
export interface OrbRushOptions {
  height(x: number, z: number): number;
  rand?: () => number;
  storage?: OrbRushStorage;
  /** 보조 시계. 진행은 step(dt)로만 재므로 지금은 쓰지 않는다 */
  now?: () => number;
}

export const RUSH_RADIUS = 38;
const ACTIVE_ORBS = 6;
const DURATION = 45;
const TIME_BONUS = 3;
const COLLECT_DIST = 1.6;
const COMBO_WINDOW = 4;
const LEAVE_WARN = RUSH_RADIUS + 12;
const LEAVE_ABORT = RUSH_RADIUS + 20;
const SPAWN_MIN = 10, SPAWN_MAX = 28;
const ORB_HEIGHT = 1.0;
const WATER = -2;
/** 1m당 높이 변화 한계. 넘으면 가파른 곳으로 보고 구슬을 두지 않는다 */
const MAX_SLOPE = 0.5;
const MIN_GAP = 3;
const MAX_DT = 0.5;
const MAX_MISSES = 40;
/** 플레이어 주변 후보가 이만큼 실패하면 구역 안 아무 곳이나 쓴다 */
const RING_MISSES = 20;
const TIME_CHANCE = 0.08, GOLD_CHANCE = 0.10;
const BASE_POINTS: Record<Exclude<OrbKind, 'time'>, number> = { normal: 10, gold: 30 };
const COINS_PER_SCORE = 40;
export const STORAGE_KEY = 'cubequest.orbrush.v1';

const defaultStorage: OrbRushStorage = {
  get: () => readJSON<OrbRushSave>(STORAGE_KEY),
  set: (v) => writeJSON(STORAGE_KEY, v),
};

/** 콤보 배율: 콤보 1이면 x1.25, 최대 x3 */
export function comboMultiplier(combo: number): number {
  return combo <= 0 ? 1 : 1 + 0.25 * Math.min(combo, 8);
}

/** 저장된 최고 기록을 검증해 읽는다. 손상되었거나 못 읽으면 0 */
function loadBest(storage: OrbRushStorage): number {
  try {
    const v = storage.get();
    if (v && typeof v === 'object' && 'best' in v) {
      const b = (v as { best: unknown }).best;
      if (typeof b === 'number' && Number.isSafeInteger(b) && b >= 0) return b;
    }
  } catch { /* 저장소를 못 읽으면 새 기록부터 */ }
  return 0;
}

export class OrbRush {
  private readonly height: (x: number, z: number) => number;
  private readonly rand: () => number;
  private readonly storage: OrbRushStorage;
  private _state: RushState = 'idle';
  private _center: { x: number; y: number; z: number } | null = null;
  private _orbs: Orb[] = [];
  private _score = 0;
  private _timeLeft = DURATION;
  private _combo = 0;
  private comboTimer = 0;
  private _collected = 0;
  private _best: number;
  private nextId = 1;
  private warned = false;
  /** 다음 step 호출 때 내보낼 이벤트(start 등) */
  private pending: RushEvent[] = [];

  constructor(opts: OrbRushOptions) {
    this.height = opts.height;
    this.rand = opts.rand ?? Math.random;
    this.storage = opts.storage ?? defaultStorage;
    this._best = loadBest(this.storage);
  }

  get state(): RushState { return this._state; }
  get orbs(): readonly Orb[] { return this._orbs; }
  get score(): number { return this._score; }
  get timeLeft(): number { return this._timeLeft; }
  /** 현재 연속 수집 수. 4초 동안 수집이 없으면 0 */
  get combo(): number { return this._combo; }
  get best(): number { return this._best; }
  get radius(): number { return RUSH_RADIUS; }
  /** 구역 중심(y는 중심 지면 높이). 실행 중이 아니면 null */
  get center(): { x: number; y: number; z: number } | null { return this._center ? { ...this._center } : null; }

  /** 중심 주변에 구슬 풀을 펼치고 판을 시작한다. 실행 중이면 무시 */
  start(center: { x: number; z: number }): void {
    if (this._state === 'running') return;
    this._state = 'running';
    this._center = { x: center.x, y: this.height(center.x, center.z), z: center.z };
    this._score = 0;
    this._timeLeft = DURATION;
    this._combo = 0;
    this.comboTimer = 0;
    this._collected = 0;
    this.warned = false;
    this._orbs = [];
    this.pending = [{ kind: 'start' }];
    this.refill(null);
  }

  /** 판을 기록 없이 접는다 */
  cancel(): void {
    this._state = 'idle';
    this._center = null;
    this._orbs = [];
    this._score = 0;
    this._timeLeft = DURATION;
    this._combo = 0;
    this.comboTimer = 0;
    this._collected = 0;
    this.warned = false;
    this.pending = [];
  }

  /** 한 프레임(또는 고정 스텝) 진행. 일어난 일을 이벤트로 돌려준다 */
  step(dt: number, player: { x: number; y: number; z: number }): RushEvent[] {
    const out = this.pending;
    this.pending = [];
    if (this._state !== 'running' || !this._center) return out;
    const c = this._center;
    const h = Math.min(Math.max(dt, 0), MAX_DT);

    const dist = Math.hypot(player.x - c.x, player.z - c.z);
    if (dist >= LEAVE_ABORT) { out.push(this.finish(true)); return out; }
    if (dist > LEAVE_WARN) {
      if (!this.warned) { this.warned = true; out.push({ kind: 'leaving', dist }); }
    } else {
      this.warned = false;
    }

    if (this._combo > 0) {
      this.comboTimer -= h;
      if (this.comboTimer <= 0) this._combo = 0;
    }

    for (const o of [...this._orbs]) {
      if (Math.hypot(o.x - player.x, o.y - player.y, o.z - player.z) < COLLECT_DIST) {
        out.push(this.collect(o));
      }
    }
    this.refill(player);

    this._timeLeft -= h;
    if (this._timeLeft <= 0) {
      this._timeLeft = 0;
      out.push(this.finish(false));
    }
    return out;
  }

  private collect(o: Orb): RushEvent {
    this._orbs = this._orbs.filter((x) => x.id !== o.id);
    this._collected++;
    this._combo = this._combo > 0 ? this._combo + 1 : 1;
    this.comboTimer = COMBO_WINDOW;
    if (o.kind === 'time') {
      this._timeLeft += TIME_BONUS;
      return { kind: 'time', orb: o, bonus: TIME_BONUS };
    }
    const points = Math.floor(BASE_POINTS[o.kind] * comboMultiplier(this._combo));
    this._score += points;
    return { kind: 'collect', orb: o, points, combo: this._combo };
  }

  private finish(aborted: boolean): RushEvent {
    this._state = 'done';
    this._orbs = [];
    this._combo = 0;
    this.comboTimer = 0;
    // 포기한 판은 최고 기록으로 남지 않는다
    const newBest = !aborted && this._score > this._best;
    if (newBest) {
      this._best = this._score;
      try { this.storage.set({ best: this._best }); } catch { /* 이번 판만 */ }
    }
    return {
      kind: 'end', score: this._score, newBest,
      coins: Math.floor(this._score / COINS_PER_SCORE), aborted, collected: this._collected,
    };
  }

  /** 활성 구슬이 모자라면 채운다. origin이 있으면 그 주변(10~28m)에 둔다 */
  private refill(origin: { x: number; z: number } | null) {
    const c = this._center;
    if (!c) return;
    let misses = 0;
    while (this._orbs.length < ACTIVE_ORBS && misses < MAX_MISSES) {
      const p = origin && misses < RING_MISSES ? this.ringPoint(origin) : this.fieldPoint(c);
      const h = this.groundAt(p.x, p.z);
      if (h === null) { misses++; continue; }
      misses = 0;
      this._orbs.push(this.makeOrb(p.x, p.z, h));
    }
  }

  private fieldPoint(c: { x: number; z: number }): { x: number; z: number } {
    const a = this.rand() * Math.PI * 2;
    const r = Math.sqrt(this.rand()) * RUSH_RADIUS;
    return { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
  }

  private ringPoint(origin: { x: number; z: number }): { x: number; z: number } {
    const a = this.rand() * Math.PI * 2;
    const d = SPAWN_MIN + this.rand() * (SPAWN_MAX - SPAWN_MIN);
    return { x: origin.x + Math.cos(a) * d, z: origin.z + Math.sin(a) * d };
  }

  /** 구슬을 둘 수 있는 지면 높이. 구역 밖, 물, 가파른 곳, 다른 구슬과 너무 가까운 곳이면 null */
  private groundAt(x: number, z: number): number | null {
    const c = this._center;
    if (!c) return null;
    if (Math.hypot(x - c.x, z - c.z) > RUSH_RADIUS) return null;
    const h = this.height(x, z);
    if (h < WATER) return null;
    const steep = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
      ([dx, dz]) => Math.abs(this.height(x + dx, z + dz) - h) > MAX_SLOPE);
    if (steep) return null;
    if (this._orbs.some((o) => Math.hypot(o.x - x, o.z - z) < MIN_GAP)) return null;
    return h;
  }

  private makeOrb(x: number, z: number, h: number): Orb {
    const r = this.rand();
    const kind: OrbKind = r < TIME_CHANCE ? 'time' : r < TIME_CHANCE + GOLD_CHANCE ? 'gold' : 'normal';
    return { id: this.nextId++, kind, x, y: h + ORB_HEIGHT, z };
  }
}
