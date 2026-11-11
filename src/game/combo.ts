// 공중 콤보(스타일) 미터. 기술을 이어 붙이면 체인이 쌓이고, 땅에 오래 머물거나 떨어지면 끝난다.
// DOM/Three.js 없이 이벤트만 보고 동작한다.
import { readJSON, writeJSON, type GameEvent } from './events';

const KEY = 'cubequest.combo.v1';

/** 최고 기록 저장소. 기본은 localStorage(events.ts의 readJSON/writeJSON) */
export interface ComboStorage {
  get(): unknown;
  set(v: ComboSave): void;
}
export interface ComboSave { best: number }

/** 체인이 이 값 이상이어야 화면에 '진행 중'으로 보인다 */
export const COMBO_MIN_CHAIN = 2;
/** 땅 위에 이 시간(초) 이상 머물면 콤보 종료 */
export const GROUND_LIMIT = 0.9;
/** 발판 착지 후 유예(초). 그 사이 다시 뛰면 이어진다 */
export const PLATFORM_GRACE = 1.2;
export const MAX_MULTIPLIER = 4;

const TIERS = [
  { min: 3, name: '좋아요' },
  { min: 6, name: '멋져요' },
  { min: 10, name: '황홀해요' },
  { min: 15, name: '별빛 같아요' },
  { min: 22, name: '전설의 큐브' },
];

export type ComboEvent =
  | { kind: 'grow'; chain: number; score: number; tier: string | null; tierUp: boolean }
  | { kind: 'end'; chain: number; score: number; tier: string | null; newBest: boolean; coins: number }
  | { kind: 'broken'; chain: number };

/** 배율 = 1 + floor(chain/3)*0.5, 최대 4 */
export function multiplierFor(chain: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(chain / 3) * 0.5);
}

function tierIndex(chain: number): number {
  let idx = -1;
  for (let i = 0; i < TIERS.length; i++) if (chain >= TIERS[i].min) idx = i;
  return idx;
}

function loadBest(storage: ComboStorage): number {
  try {
    const v = storage.get();
    if (v && typeof v === 'object') {
      const best = (v as { best?: unknown }).best;
      if (Number.isSafeInteger(best) && (best as number) >= 0) return best as number;
    }
  } catch { /* 저장소를 못 읽으면 0부터 */ }
  return 0;
}

export class Combo {
  private _chain = 0;
  private base = 0;
  private grounded = false;
  private groundTime = 0;
  private groundLimit = GROUND_LIMIT;
  private tierAt = -1;
  private _best: number;
  private readonly storage: ComboStorage;

  constructor(storage?: ComboStorage) {
    this.storage = storage ?? { get: () => readJSON<unknown>(KEY), set: (v) => writeJSON(KEY, v) };
    this._best = loadBest(this.storage);
  }

  get chain(): number { return this._chain; }
  /** 현재 배율을 적용한 예상 점수 */
  get score(): number { return Math.floor(this.base * multiplierFor(this._chain)); }
  get tier(): string | null { const i = tierIndex(this._chain); return i >= 0 ? TIERS[i].name : null; }
  get best(): number { return this._best; }

  handle(e: GameEvent): ComboEvent | null {
    switch (e.type) {
      case 'jump': return this.add(10);
      case 'dash': return this.add(25);
      case 'slam': return this.add(Math.round(40 + clamp01(e.power) * 40));
      case 'launch': return this.add(30);
      case 'land': {
        if (!e.onPlatform) { this.touchGround(GROUND_LIMIT); return null; }
        const ev = this.add(15);
        this.touchGround(PLATFORM_GRACE);
        return ev;
      }
      case 'tick': return this.tick(e.dt, e.grounded);
      case 'respawn': return this.breakCombo();
      default: return null;
    }
  }

  /** 기술 한 번: 점수와 체인 +1 */
  private add(points: number): ComboEvent | null {
    this.leaveGround();
    this._chain++;
    this.base += points;
    if (this._chain < COMBO_MIN_CHAIN) return null;
    const idx = tierIndex(this._chain);
    const tierUp = idx > this.tierAt;
    this.tierAt = idx;
    return { kind: 'grow', chain: this._chain, score: this.score, tier: this.tier, tierUp };
  }

  private touchGround(limit: number) {
    this.grounded = true;
    this.groundTime = 0;
    this.groundLimit = limit;
  }

  private leaveGround() {
    this.grounded = false;
    this.groundTime = 0;
  }

  private tick(dt: number, grounded: boolean): ComboEvent | null {
    if (!grounded) { this.leaveGround(); return null; }
    if (this._chain === 0) return null;
    // 착지 이벤트 없이 땅에 닿은 경우는 일반 땅 기준으로 센다
    if (!this.grounded) this.touchGround(GROUND_LIMIT);
    if (Number.isFinite(dt) && dt > 0) this.groundTime += dt;
    if (this.groundTime < this.groundLimit) return null;
    return this.finish();
  }

  /** 땅 위 시간 초과로 끝남. 화면에 보인 콤보(2 이상)만 알린다 */
  private finish(): ComboEvent | null {
    if (this._chain < COMBO_MIN_CHAIN) { this.reset(); return null; }
    const chain = this._chain, score = this.score, tier = this.tier;
    const newBest = score > this._best;
    if (newBest) { this._best = score; this.save(); }
    this.reset();
    return { kind: 'end', chain, score, tier, newBest, coins: Math.floor(score / 100) };
  }

  private breakCombo(): ComboEvent | null {
    const chain = this._chain;
    this.reset();
    return chain >= COMBO_MIN_CHAIN ? { kind: 'broken', chain } : null;
  }

  private reset() {
    this._chain = 0;
    this.base = 0;
    this.tierAt = -1;
    this.leaveGround();
  }

  private save() {
    try { this.storage.set({ best: this._best }); } catch { /* 저장 실패는 이번 판만 */ }
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
