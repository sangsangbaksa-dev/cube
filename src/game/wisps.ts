// 정령(윌오위스프) 수집. 플레이어 주변을 떠다니는 정령을 잡아 도감을 채운다.
// DOM/THREE 없이 테스트 가능한 순수 TS. 그림은 wisp-render.ts, 도감 화면은 codex-ui.ts.
import { readJSON, writeJSON } from './events';

export type Habitat = 'day' | 'night' | 'any';
export type Rarity = 'common' | 'rare' | 'epic';

export interface Species {
  id: string;
  name: string;
  color: string;
  habitat: Habitat;
  rarity: Rarity;
  blurb: string;
}

export const SPECIES: readonly Species[] = [
  { id: 'dew', name: '이슬 정령', color: '#9fe8ff', habitat: 'any', rarity: 'common', blurb: '아침 풀잎에 맺힌 이슬에서 태어난 수줍은 정령.' },
  { id: 'glow', name: '반딧 정령', color: '#d6ff6b', habitat: 'night', rarity: 'common', blurb: '밤마다 꽁무니에 작은 등불을 켜고 길을 안내한다.' },
  { id: 'dusk', name: '노을 정령', color: '#ffae7a', habitat: 'day', rarity: 'common', blurb: '해질녘 하늘을 한 조각 떼어 와 주변을 물들인다.' },
  { id: 'moss', name: '이끼 정령', color: '#8fdc8a', habitat: 'any', rarity: 'common', blurb: '돌담 틈에서 살며 발밑을 말랑하게 만든다.' },
  { id: 'wind', name: '바람 정령', color: '#c9f7ff', habitat: 'day', rarity: 'rare', blurb: '낮의 산들바람을 타고 노는 걸 좋아하는 장난꾸러기.' },
  { id: 'crystal', name: '수정 정령', color: '#b59cff', habitat: 'night', rarity: 'rare', blurb: '달빛을 머금어 반짝이는 조그만 수정 조각.' },
  { id: 'meteor', name: '별똥 정령', color: '#ffe27a', habitat: 'night', rarity: 'epic', blurb: '떨어지는 별똥별의 꼬리에서 깨어난 용감한 정령.' },
  { id: 'snow', name: '눈꽃 정령', color: '#eaf6ff', habitat: 'any', rarity: 'rare', blurb: '겨울 눈송이를 닮아 하얗고 차갑게 웃는다.' },
  { id: 'ember', name: '불씨 정령', color: '#ff7a3d', habitat: 'day', rarity: 'rare', blurb: '작은 화롯불에서 살며 따뜻한 것을 좋아한다.' },
  { id: 'moon', name: '달빛 정령', color: '#dfe6ff', habitat: 'night', rarity: 'epic', blurb: '보름달이 뜬 밤에만 모습을 드러내는 신비로운 정령.' },
  { id: 'rainbow', name: '무지개 정령', color: '#ff9ee0', habitat: 'day', rarity: 'epic', blurb: '비가 그친 뒤 하늘에 걸린 일곱 빛깔을 닮았다.' },
  { id: 'lighthouse', name: '등대 정령', color: '#fff2b0', habitat: 'any', rarity: 'epic', blurb: '길 잃은 이를 위해 언제나 불빛을 밝혀 두는 다정한 정령.' },
];

export const MAX_ACTIVE = 3;
/** 플레이어 주변 스폰 링 (m) */
const RING_MIN = 18;
const RING_MAX = 35;
/** 보충 간격 (초) */
const RESPAWN_MIN = 6;
const RESPAWN_MAX = 12;
const LIFE = 40;
/** 지면 위 떠 있는 높이 (m) */
const HOVER = 1.2;
/** 떠다니는 폭 (m) */
const DRIFT_R = 2.4;
/** 이 거리 안으로 플레이어가 오면 놀라서 도망 */
const SCARE_R = 6;
/** 도망 속도 (m/s). 플레이어 대시보다 느리게 잡아, 붙으면 잡힌다 */
const FLEE_SPEED = 4;
/** 도망 중 이 거리(수평) 밖으로 멀어지면 사라진다 */
const GONE_R = 40;
/** 포획 거리 (3D). 점프 중에도 이 안이면 잡힌다 */
export const CATCH_R = 2.2;
const RARITY_WEIGHT: Record<Rarity, number> = { common: 70, rare: 25, epic: 5 };
const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic'];
export const COIN: Record<Rarity, number> = { common: 3, rare: 8, epic: 20 };
/** 도감 첫 발견 보너스 배율 */
const FIRST_BONUS = 3;
export const WISP_KEY = 'cubequest.wisps.v1';

/** 화면에 떠 있는 정령. 그림 쪽은 이 값만 읽는다 */
export interface ActiveWisp {
  readonly id: number;
  readonly species: Species;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 위아래 둥실거림의 시작 위상 */
  readonly phase: number;
  /** 살아 있는 시간 (초) */
  readonly age: number;
  /** 놀라서 도망 중인지 */
  readonly fleeing: boolean;
}

export type WispEvent =
  | { kind: 'spawn'; wisp: ActiveWisp }
  | { kind: 'catch'; wisp: ActiveWisp; firstTime: boolean; coins: number }
  | { kind: 'vanish'; wisp: ActiveWisp };

export interface WispSave {
  counts: Record<string, number>;
}

export interface WispStorage {
  get(): WispSave | null;
  set(v: WispSave): void;
}

export interface WispsOpts {
  height(x: number, z: number): number;
  rand?: () => number;
  storage?: WispStorage;
}

const defaultStorage: WispStorage = {
  get: () => readJSON<WispSave>(WISP_KEY),
  set: (v) => writeJSON(WISP_KEY, v),
};

/** 저장값 검증: 알려진 종 id, 양의 정수만 남긴다 */
export function sanitizeCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  const counts = (raw as { counts?: unknown }).counts;
  if (!counts || typeof counts !== 'object') return out;
  for (const s of SPECIES) {
    const v = (counts as Record<string, unknown>)[s.id];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) out[s.id] = v;
  }
  return out;
}

/** 내부 상태. 바깥에는 ActiveWisp로만 나간다 */
interface Live {
  id: number;
  species: Species;
  x: number;
  y: number;
  z: number;
  phase: number;
  age: number;
  fleeing: boolean;
  /** 떠다니는 중심 */
  ax: number;
  az: number;
  /** 도망 방향 (수평, 단위 벡터) */
  dx: number;
  dz: number;
}

function snap(w: Live): ActiveWisp {
  return { id: w.id, species: w.species, x: w.x, y: w.y, z: w.z, phase: w.phase, age: w.age, fleeing: w.fleeing };
}

export class Wisps {
  private readonly list: Live[] = [];
  private readonly counts: Record<string, number>;
  private readonly height: (x: number, z: number) => number;
  private readonly rand: () => number;
  private readonly storage: WispStorage;
  private nextId = 1;
  /** 다음 보충까지 남은 시간. 0이면 첫 스텝에 하나 나온다 */
  private timer = 0;

  constructor(opts: WispsOpts) {
    this.height = opts.height;
    this.rand = opts.rand ?? Math.random;
    this.storage = opts.storage ?? defaultStorage;
    let raw: unknown = null;
    try { raw = this.storage.get(); } catch { /* 저장소 실패 시 빈 도감 */ }
    this.counts = sanitizeCounts(raw);
  }

  /** 떠 있는 정령 목록 (읽기 전용) */
  get active(): readonly ActiveWisp[] { return this.list; }

  /** 이 종을 잡은 횟수 */
  caught(id: string): number { return this.counts[id] || 0; }

  /** 발견한 종 수 */
  get discovered(): number { return SPECIES.filter((s) => (this.counts[s.id] || 0) > 0).length; }

  get total(): number { return SPECIES.length; }

  /** 매 프레임 호출. dt 초, 플레이어 위치, night 0~1 */
  step(dt: number, player: { x: number; y: number; z: number }, night: number): WispEvent[] {
    const events: WispEvent[] = [];

    // 1) 떠 있는 정령을 먼저 움직인다 (방금 나온 정령은 다음 스텝부터 움직인다)
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      w.age += dt;
      const d3 = Math.hypot(w.x - player.x, w.y - player.y, w.z - player.z);

      if (d3 < CATCH_R) {
        this.list.splice(i, 1);
        events.push(this.catchWisp(w));
        continue;
      }
      if (w.age >= LIFE) {
        this.list.splice(i, 1);
        events.push({ kind: 'vanish', wisp: snap(w) });
        continue;
      }

      if (!w.fleeing && d3 < SCARE_R) {
        // 플레이어 반대 방향(수평)으로 도망 시작. 겹치면 임의 방향
        w.fleeing = true;
        const hx = w.x - player.x, hz = w.z - player.z;
        const len = Math.hypot(hx, hz);
        if (len > 1e-6) {
          w.dx = hx / len;
          w.dz = hz / len;
        } else {
          const a = this.rand() * Math.PI * 2;
          w.dx = Math.cos(a);
          w.dz = Math.sin(a);
        }
      }

      if (w.fleeing) {
        w.x += w.dx * FLEE_SPEED * dt;
        w.z += w.dz * FLEE_SPEED * dt;
      } else {
        // 중심 주변을 리사주 곡선으로 떠다닌다. age 0일 때 중심과 일치
        w.x = w.ax + (Math.sin(w.age * 0.5 + w.phase) - Math.sin(w.phase)) * DRIFT_R;
        w.z = w.az + (Math.sin(w.age * 0.37 + w.phase * 1.3) - Math.sin(w.phase * 1.3)) * DRIFT_R;
      }
      w.y = this.height(w.x, w.z) + HOVER;

      if (w.fleeing && Math.hypot(w.x - player.x, w.z - player.z) > GONE_R) {
        this.list.splice(i, 1);
        events.push({ kind: 'vanish', wisp: snap(w) });
      }
    }

    // 2) 보충: 6~12초마다 하나, 최대 MAX_ACTIVE
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = RESPAWN_MIN + this.rand() * (RESPAWN_MAX - RESPAWN_MIN);
      if (this.list.length < MAX_ACTIVE) {
        events.push({ kind: 'spawn', wisp: snap(this.spawn(player, night)) });
      }
    }

    return events;
  }

  private spawn(player: { x: number; z: number }, night: number): Live {
    const want: Habitat = night > 0.55 ? 'night' : 'day';
    const species = this.pickSpecies(want);
    const a = this.rand() * Math.PI * 2;
    const r = RING_MIN + this.rand() * (RING_MAX - RING_MIN);
    const ax = player.x + Math.cos(a) * r;
    const az = player.z + Math.sin(a) * r;
    const w: Live = {
      id: this.nextId++, species,
      x: ax, y: this.height(ax, az) + HOVER, z: az,
      phase: this.rand() * Math.PI * 2, age: 0, fleeing: false,
      ax, az, dx: 0, dz: 0,
    };
    this.list.push(w);
    return w;
  }

  /** 서식지(낮/밤 + any)에서 희귀도 가중으로 고르고, 그 희귀도 안에서 균등하게 고른다 */
  private pickSpecies(want: Habitat): Species {
    const pool = SPECIES.filter((s) => s.habitat === 'any' || s.habitat === want);
    const rarities = RARITIES.filter((r) => pool.some((s) => s.rarity === r));
    const total = rarities.reduce((sum, r) => sum + RARITY_WEIGHT[r], 0);
    let roll = this.rand() * total;
    let picked = rarities[rarities.length - 1];
    for (const r of rarities) {
      roll -= RARITY_WEIGHT[r];
      if (roll < 0) { picked = r; break; }
    }
    const cands = pool.filter((s) => s.rarity === picked);
    return cands[Math.min(cands.length - 1, Math.floor(this.rand() * cands.length))];
  }

  private catchWisp(w: Live): WispEvent {
    const before = this.counts[w.species.id] || 0;
    const firstTime = before === 0;
    this.counts[w.species.id] = before + 1;
    const coins = COIN[w.species.rarity] * (firstTime ? FIRST_BONUS : 1);
    try { this.storage.set({ counts: { ...this.counts } }); } catch { /* 이번 판만 */ }
    return { kind: 'catch', wisp: snap(w), firstTime, coins };
  }
}
