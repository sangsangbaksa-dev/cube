// 월드에 숨겨진 보물 상자. 시드로 위치를 정하고, 플레이어가 가까이 가면 자동으로 열린다.
// DOM/Three.js 없이 테스트할 수 있는 순수 로직이다.
import { mulberry32 } from '../util/rand';
import { readJSON, writeJSON } from './events';

export const CHEST_KEY = 'cubequest.chests.v1';

export type ChestTier = 'bronze' | 'silver' | 'gold';

export interface ChestSpec {
  id: number;
  x: number;
  /** 지면 높이 */
  y: number;
  z: number;
  tier: ChestTier;
}

/** 등급별 코인 범위 (양 끝 포함) */
export const TIER_REWARD: Record<ChestTier, [number, number]> = {
  bronze: [10, 20],
  silver: [30, 50],
  gold: [80, 120],
};

/** 상자 열림 이벤트. 보물 상자는 GameEvent 계약과 별도로 Chests가 낸다 */
export interface ChestEvent {
  kind: 'open';
  spec: ChestSpec;
  coins: number;
}

export interface ChestStorage {
  get(): ChestSaveData | null;
  set(v: ChestSaveData): void;
}
export interface ChestSaveData {
  opened: number[];
}

const defaultStorage: ChestStorage = {
  get: () => readJSON<ChestSaveData>(CHEST_KEY),
  set: (v) => writeJSON(CHEST_KEY, v),
};

const SITE_PAD = 8;
const MIN_GAP = 28;
const MIN_HEIGHT = -2;
const MAX_SLOPE = 1.5;
const SLOPE_STEP = 2;
const OPEN_DIST = 1.8;
const OPEN_DY = 3;
const NEAR_HINT = 6;
const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];

/** id로 결정되는 보상 (같은 id면 항상 같은 값) */
export function rewardFor(id: number, tier: ChestTier): number {
  const [lo, hi] = TIER_REWARD[tier];
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return lo + ((h >>> 0) % (hi - lo + 1));
}

export interface PlaceOptions {
  height(x: number, z: number): number;
  sites: { x: number; z: number; r: number }[];
  seed?: number;
  count?: number;
  worldR?: number;
}

/** 상자 자리를 정한다. 같은 입력이면 항상 같은 결과. 자리가 모자라면 있는 만큼만 돌려준다 */
export function placeChests(opts: PlaceOptions): ChestSpec[] {
  const { height, sites, seed = 9090, count = 24, worldR = 330 } = opts;
  const rnd = mulberry32(seed);
  const out: ChestSpec[] = [];
  const placed: { x: number; z: number }[] = [];
  const maxTries = count * 400;

  for (let i = 0; i < maxTries && out.length < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * worldR;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;

    // 광장 근처는 피한다
    if (sites.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + SITE_PAD)) continue;
    if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < MIN_GAP)) continue;

    const y = height(x, z);
    if (y <= MIN_HEIGHT) continue;
    // 네 방향 2m 샘플과 높이 차가 크면 너무 가파르다
    const steep = [[SLOPE_STEP, 0], [-SLOPE_STEP, 0], [0, SLOPE_STEP], [0, -SLOPE_STEP]]
      .some(([dx, dz]) => Math.abs(height(x + dx, z + dz) - y) > MAX_SLOPE);
    if (steep) continue;

    const t = rnd();
    const tier: ChestTier = t < 0.6 ? 'bronze' : t < 0.9 ? 'silver' : 'gold';
    out.push({ id: out.length, x, y, z, tier });
    placed.push({ x, z });
  }
  return out;
}

interface Item {
  spec: ChestSpec;
  opened: boolean;
}

export class Chests {
  private readonly items: Item[];
  private readonly openedIds = new Set<number>();
  private readonly storage: ChestStorage;

  constructor(specs: ChestSpec[], storage: ChestStorage = defaultStorage) {
    this.storage = storage;
    this.items = specs.map((spec) => ({ spec, opened: false }));
    const valid = new Set(specs.map((s) => s.id));
    let saved: ChestSaveData | null = null;
    try { saved = storage.get(); } catch { saved = null; }
    for (const id of parseOpened(saved, valid)) this.openedIds.add(id);
    for (const it of this.items) it.opened = this.openedIds.has(it.spec.id);
  }

  /** 플레이어 위치를 보고 가까운 상자를 연다. 이번 스텝에 연 상자 이벤트를 돌려준다 */
  step(player: { x: number; y: number; z: number }): ChestEvent[] {
    const events: ChestEvent[] = [];
    for (const it of this.items) {
      if (it.opened) continue;
      const s = it.spec;
      if (Math.hypot(s.x - player.x, s.z - player.z) >= OPEN_DIST) continue;
      if (Math.abs(s.y - player.y) >= OPEN_DY) continue;
      it.opened = true;
      this.openedIds.add(s.id);
      events.push({ kind: 'open', spec: s, coins: rewardFor(s.id, s.tier) });
    }
    if (events.length) this.save();
    return events;
  }

  list(): { spec: ChestSpec; opened: boolean }[] {
    return this.items.map((it) => ({ spec: it.spec, opened: it.opened }));
  }

  get openedCount(): number { return this.openedIds.size; }
  get total(): number { return this.items.length; }

  /** 아직 안 연 상자 중 수평 거리가 가장 가까운 것 */
  nearest(player: { x: number; z: number }): { spec: ChestSpec; dist: number } | null {
    let best: { spec: ChestSpec; dist: number } | null = null;
    for (const it of this.items) {
      if (it.opened) continue;
      const dist = Math.hypot(it.spec.x - player.x, it.spec.z - player.z);
      if (!best || dist < best.dist) best = { spec: it.spec, dist };
    }
    return best;
  }

  private save() {
    const opened = [...this.openedIds].sort((a, b) => a - b);
    try { this.storage.set({ opened }); } catch { /* 이번 판만 */ }
  }
}

/** 저장 데이터 검증: 모양이 틀리거나 지금 월드에 없는 id는 버린다 */
function parseOpened(v: unknown, valid: Set<number>): Set<number> {
  const out = new Set<number>();
  if (!v || typeof v !== 'object') return out;
  const arr = (v as { opened?: unknown }).opened;
  if (!Array.isArray(arr)) return out;
  for (const x of arr) {
    if (typeof x === 'number' && Number.isInteger(x) && valid.has(x)) out.add(x);
  }
  return out;
}

/** 거리와 방위를 한국어로. 북 = -Z */
export function hintFor(player: { x: number; z: number }, chest: ChestSpec): string {
  const dx = chest.x - player.x, dz = chest.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist < NEAR_HINT) return '아주 가까워요!';
  const angle = Math.atan2(dx, -dz); // 0 = 북, +는 동쪽
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return `${DIRS[sector]}쪽 ${Math.round(dist)}m`;
}
