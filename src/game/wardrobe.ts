// 반짝이 코인 지갑 + 큐브 옷장(스킨). DOM/THREE 없이 테스트 가능한 순수 TS.
import { readJSON, writeJSON } from './events';

export type Accessory = 'none' | 'crown' | 'leaf' | 'halo' | 'horns' | 'bow';

export interface SkinDef {
  id: string;
  name: string;
  price: number;
  /** 몸체 색 */
  body: string;
  /** 기본 발광색 (flash 때 흰색 쪽으로 섞인다) */
  emissive: string;
  /** 대시 입자 색 */
  trail: string;
  cheek?: string;
  accessory?: Accessory;
}

export const SKINS: readonly SkinDef[] = [
  { id: 'sky', name: '하늘 큐브', price: 0, body: '#5aa9ff', emissive: '#3d7dff', trail: '#6fe3ff', cheek: '#ff8fb8', accessory: 'none' },
  { id: 'dusk', name: '노을 큐브', price: 40, body: '#ff9a6b', emissive: '#ff5e3a', trail: '#ffc27a', cheek: '#ff7fa0', accessory: 'none' },
  { id: 'moss', name: '이끼 큐브', price: 80, body: '#8fd18a', emissive: '#4fae5c', trail: '#c6f5a0', cheek: '#ffb3c7', accessory: 'leaf' },
  { id: 'ember', name: '잿불 큐브', price: 120, body: '#4a4553', emissive: '#ff6a2a', trail: '#ffa24a', cheek: '#ff6a2a', accessory: 'horns' },
  { id: 'crystal', name: '수정 큐브', price: 150, body: '#b9f2ff', emissive: '#6fd6ff', trail: '#e0fbff', cheek: '#ffd0f0', accessory: 'none' },
  { id: 'moon', name: '달빛 큐브', price: 200, body: '#dfe7ff', emissive: '#9fb4ff', trail: '#ffffff', cheek: '#ffc6d9', accessory: 'none' },
  { id: 'cotton', name: '솜사탕 큐브', price: 240, body: '#ffd1e8', emissive: '#ff8fc7', trail: '#ffffff', cheek: '#ff6fae', accessory: 'bow' },
  { id: 'night', name: '밤하늘 큐브', price: 400, body: '#1f2a4d', emissive: '#5b7bff', trail: '#9ab4ff', cheek: '#ff8fb8', accessory: 'halo' },
  { id: 'gold', name: '황금 큐브', price: 600, body: '#ffd36b', emissive: '#ffb938', trail: '#fff3b0', cheek: '#ffa64d', accessory: 'crown' },
];

export const DEFAULT_SKIN_ID = 'sky';
const KEY = 'cubequest.wardrobe.v1';
const MAX_COINS = 1_000_000_000;

const SKIN_BY_ID = new Map(SKINS.map((s) => [s.id, s] as const));

export function skinById(id: string): SkinDef | undefined {
  return SKIN_BY_ID.get(id);
}

export interface WardrobeSave {
  coins: number;
  totalEarned: number;
  owned: string[];
  equipped: string;
}

/** 저장소 주입용. get은 아무 값이나 줄 수 있으니 생성자에서 검증한다 */
export interface WardrobeStorage {
  get(): unknown;
  set(v: WardrobeSave): void;
}

export type BuyResult = 'ok' | 'owned' | 'poor' | 'unknown';

const defaultStorage: WardrobeStorage = {
  get: () => readJSON<unknown>(KEY),
  set: (v) => writeJSON(KEY, v),
};

/** 0 이상의 안전한 정수만 통과 */
function nonNegInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_COINS ? v : null;
}

export class Wardrobe {
  private _coins = 0;
  private _totalEarned = 0;
  private readonly _owned = new Set<string>([DEFAULT_SKIN_ID]);
  private _equipped = DEFAULT_SKIN_ID;
  private readonly storage: WardrobeStorage;
  /** 마지막으로 코인을 얻은 사유 (토스트 표시용) */
  lastReason = '';

  constructor(storage: WardrobeStorage = defaultStorage) {
    this.storage = storage;
    let raw: unknown = null;
    try { raw = storage.get(); } catch { raw = null; }
    this.load(raw);
  }

  /** 잘못된 값은 항목별로 무시하고 나머지는 살린다 */
  private load(raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    const coins = nonNegInt(r.coins);
    if (coins !== null) this._coins = coins;
    const total = nonNegInt(r.totalEarned);
    this._totalEarned = Math.max(total ?? 0, this._coins);
    if (Array.isArray(r.owned)) {
      for (const id of r.owned) {
        if (typeof id === 'string' && SKIN_BY_ID.has(id)) this._owned.add(id);
      }
    }
    if (typeof r.equipped === 'string' && this._owned.has(r.equipped)) this._equipped = r.equipped;
  }

  private save() {
    const owned = SKINS.filter((s) => this._owned.has(s.id)).map((s) => s.id);
    try {
      this.storage.set({ coins: this._coins, totalEarned: this._totalEarned, owned, equipped: this._equipped });
    } catch { /* 이번 판만 */ }
  }

  get coins(): number { return this._coins; }
  get totalEarned(): number { return this._totalEarned; }
  get equipped(): SkinDef { return SKIN_BY_ID.get(this._equipped) ?? SKINS[0]; }

  owned(id: string): boolean {
    return this._owned.has(id);
  }

  /** 정수 n개 획득. 실제로 얻은 양을 돌려준다 (잘못된 값이면 0) */
  earn(n: number, reason = ''): number {
    if (!Number.isFinite(n)) return 0;
    const amount = Math.floor(n);
    if (amount <= 0) return 0;
    this._coins = Math.min(MAX_COINS, this._coins + amount);
    this._totalEarned = Math.min(MAX_COINS, this._totalEarned + amount);
    this.lastReason = reason;
    this.save();
    return amount;
  }

  buy(id: string): BuyResult {
    const skin = SKIN_BY_ID.get(id);
    if (!skin) return 'unknown';
    if (this._owned.has(id)) return 'owned';
    if (this._coins < skin.price) return 'poor';
    this._coins -= skin.price;
    this._owned.add(id);
    this.save();
    return 'ok';
  }

  /** 소유한 스킨만 착용할 수 있다 */
  equip(id: string): boolean {
    if (!this._owned.has(id)) return false;
    this._equipped = id;
    this.save();
    return true;
  }
}
