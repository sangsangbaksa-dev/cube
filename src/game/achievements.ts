import { readJSON, writeJSON, type GameEvent } from './events';
import { EXPEDITION_COUNT, STORY_ROUTE_COUNT, TOWER_COUNT } from '../world/terrain';

// 업적과 누적 통계. 이벤트만 보고 동작하므로 DOM/Three.js 없이 테스트할 수 있다.
export const ACH_KEY = 'cubequest.achievements.v1';
/** 누적 저장 간격(초, tick의 dt 합) */
const SAVE_EVERY = 5;
/** 이 이벤트가 오면 바로 저장 */
const IMPORTANT = new Set<GameEvent['type']>(['expedition', 'victory', 'guardianDefeated', 'shard']);

/** 누적 통계 */
export interface Stats {
  jumps: number;
  dashes: number;
  slams: number;
  launches: number;
  /** 이동 거리(m) */
  distance: number;
  /** 떨어지거나 되돌아간 횟수 */
  falls: number;
  dust: number;
  /** 가장 많이 모은 별조각 수 */
  shards: number;
  /** 원정 완주 횟수(반복 포함) */
  expeditions: number;
  /** 이미 완주한 원정의 기록을 다시 갱신한 횟수 */
  recordBreaks: number;
  /** 플레이 시간(초) */
  playTime: number;
  /** 공중에 있던 시간(초) */
  airTime: number;
  bestHeight: number;
  /** 밤(night > 0.8)이었던 시간(초) */
  nightTime: number;
  guardianStrikes: number;
}
export type StatKey = keyof Stats;
const STAT_KEYS: StatKey[] = [
  'jumps', 'dashes', 'slams', 'launches', 'distance', 'falls', 'dust', 'shards', 'expeditions',
  'recordBreaks', 'playTime', 'airTime', 'bestHeight', 'nightTime', 'guardianStrikes',
];

/** 판정 함수. done은 완주한 원정 id 집합(이벤트 반영 후) */
export type AchievementCheck = (stats: Readonly<Stats>, ev: GameEvent, done: ReadonlySet<string>) => boolean;

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** 반짝이 코인 보상(5~50) */
  reward: number;
  /** 달성 전에는 이름과 설명을 가린다 */
  hidden?: boolean;
  check: AchievementCheck;
}

export interface AchievementEntry {
  def: AchievementDef;
  unlocked: boolean;
  unlockedAt?: number;
}

/** 저장 형식 */
export interface AchievementSave {
  stats: Stats;
  done: string[];
  /** 업적 id -> 달성 시각(ms) */
  unlocked: Record<string, number>;
}

/** 저장소 주입. 기본값은 localStorage 래퍼 */
export interface AchievementStorage {
  get(): unknown;
  set(v: AchievementSave): void;
}

const defaultStorage: AchievementStorage = {
  get: () => readJSON<unknown>(ACH_KEY),
  set: (v) => writeJSON(ACH_KEY, v),
};

const EXP_ID = /^route-(\d+)$/;
/** 본편 이후 원정 코스 id인지 (route-8 ~ route-14) */
export function isExpeditionId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const m = EXP_ID.exec(id);
  if (!m) return false;
  const n = Number(m[1]);
  return n > STORY_ROUTE_COUNT && n <= TOWER_COUNT;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'jump-1', name: '첫 도약', desc: '처음으로 뛰어올랐다.', reward: 5, check: (s) => s.jumps >= 1 },
  { id: 'jump-100', name: '백 번의 도약', desc: '점프 100회.', reward: 15, check: (s) => s.jumps >= 100 },
  { id: 'jump-1000', name: '천 번의 도약', desc: '점프 1,000회.', reward: 40, check: (s) => s.jumps >= 1000 },
  { id: 'dash-50', name: '질주 연습생', desc: '대시 50회.', reward: 15, check: (s) => s.dashes >= 50 },
  { id: 'slam-30', name: '지면을 두드리다', desc: '내려찍기 30회.', reward: 20, check: (s) => s.slams >= 30 },
  { id: 'slam-big', name: '쾅! 대지를 흔들다', desc: '높은 곳에서 힘껏 내려찍었다.', reward: 30, hidden: true,
    check: (_s, e) => e.type === 'slam' && e.power >= 0.9 },
  { id: 'dist-1km', name: '천 미터 여행자', desc: '누적 1km를 이동했다.', reward: 20, check: (s) => s.distance >= 1000 },
  { id: 'dist-5km', name: '오천 미터의 큐브', desc: '누적 5km를 이동했다.', reward: 45, check: (s) => s.distance >= 5000 },
  { id: 'dust-10', name: '반짝 가루 한 줌', desc: '별가루 10개를 모았다.', reward: 10, check: (s) => s.dust >= 10 },
  { id: 'dust-30', name: '별가루 수집가', desc: '별가루 30개를 모았다.', reward: 25, check: (s) => s.dust >= 30 },
  { id: 'dust-all', name: '별가루 전부', desc: '모든 별가루를 주웠다.', reward: 50,
    check: (_s, e) => e.type === 'dust' && e.total > 0 && e.collected === e.total },
  { id: 'shard-1', name: '첫 별조각', desc: '별조각 하나를 찾았다.', reward: 10, check: (s) => s.shards >= 1 },
  { id: 'shard-4', name: '별조각 넷', desc: '별조각 네 개를 모았다.', reward: 25, check: (s) => s.shards >= 4 },
  { id: 'shard-7', name: '일곱 별조각', desc: '별조각 일곱 개를 모두 모았다.', reward: 50, check: (s) => s.shards >= 7 },
  { id: 'exp-first', name: '첫 원정 완주', desc: '원정 코스를 처음 완주했다.', reward: 15, check: (s) => s.expeditions >= 1 },
  { id: 'exp-all', name: '원정 대장', desc: '일곱 원정 코스를 모두 완주했다.', reward: 50,
    check: (_s, _e, done) => done.size >= EXPEDITION_COUNT },
  { id: 'exp-record', name: '기록을 깨다', desc: '완주한 원정의 기록을 갱신했다.', reward: 15, check: (s) => s.recordBreaks >= 1 },
  { id: 'exp-record-3', name: '끝없는 원정가', desc: '기록 갱신을 세 번 했다.', reward: 30, hidden: true,
    check: (s) => s.recordBreaks >= 3 },
  { id: 'guardian-hit', name: '수호자의 일격을 견디다', desc: '수호자의 공격을 열 번 버텼다.', reward: 15,
    check: (s) => s.guardianStrikes >= 10 },
  { id: 'guardian-win', name: '수호자를 물리치다', desc: '폭풍의 수호자를 쓰러뜨렸다.', reward: 30,
    check: (_s, e) => e.type === 'guardianDefeated' },
  { id: 'lighthouse', name: '등대를 밝히다', desc: '꺼진 등대에 다시 불을 밝혔다.', reward: 50,
    check: (_s, e) => e.type === 'victory' },
  { id: 'air-10m', name: '구름 위의 산책', desc: '공중에 누적 10분 머물렀다.', reward: 30, check: (s) => s.airTime >= 600 },
  { id: 'night-5m', name: '밤 산책', desc: '밤에 누적 5분을 걸었다.', reward: 20, check: (s) => s.nightTime >= 300 },
  { id: 'height-60', name: '육십 미터 위', desc: '높이 60m에 올랐다.', reward: 25, check: (s) => s.bestHeight >= 60 },
  { id: 'falls-50', name: '굴하지 않는 큐브', desc: '쉰 번 떨어지고도 다시 일어섰다.', reward: 15, hidden: true,
    check: (s) => s.falls >= 50 },
];

const ACH_BY_ID = new Map(ACHIEVEMENTS.map((d) => [d.id, d]));

function emptyStats(): Stats {
  return {
    jumps: 0, dashes: 0, slams: 0, launches: 0, distance: 0, falls: 0, dust: 0, shards: 0,
    expeditions: 0, recordBreaks: 0, playTime: 0, airTime: 0, bestHeight: 0, nightTime: 0, guardianStrikes: 0,
  };
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** 저장 데이터를 검증해 읽는다. 잘못된 값은 무시한다 */
function parseSave(raw: unknown) {
  const out = { stats: emptyStats(), done: new Set<string>(), unlocked: new Map<string, number>() };
  if (!isObj(raw)) return out;
  if (isObj(raw.stats)) {
    for (const k of STAT_KEYS) {
      const v = raw.stats[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out.stats[k] = v;
    }
  }
  if (Array.isArray(raw.done)) {
    for (const id of raw.done) if (isExpeditionId(id)) out.done.add(id);
  }
  if (isObj(raw.unlocked)) {
    for (const [id, t] of Object.entries(raw.unlocked)) {
      if (ACH_BY_ID.has(id) && typeof t === 'number' && Number.isFinite(t) && t >= 0) out.unlocked.set(id, t);
    }
  }
  return out;
}

export class Achievements {
  private readonly storage: AchievementStorage;
  private s: Stats;
  private readonly done: Set<string>;
  private readonly unlocked: Map<string, number>;
  private dirty = false;
  /** 마지막 저장 이후 쌓인 시간(초) */
  private sinceSave = 0;

  constructor(storage: AchievementStorage = defaultStorage) {
    this.storage = storage;
    let raw: unknown = null;
    try { raw = storage.get(); } catch { /* 저장소를 못 읽으면 새로 시작 */ }
    const p = parseSave(raw);
    this.s = p.stats;
    this.done = p.done;
    this.unlocked = p.unlocked;
  }

  /** 이벤트를 반영하고, 이번에 새로 달성한 업적만 돌려준다 */
  handle(e: GameEvent): AchievementDef[] {
    this.apply(e);
    this.dirty = true;
    const got: AchievementDef[] = [];
    for (const def of ACHIEVEMENTS) {
      if (this.unlocked.has(def.id)) continue;
      if (def.check(this.s, e, this.done)) {
        this.unlocked.set(def.id, Date.now());
        got.push(def);
      }
    }
    if (got.length > 0 || IMPORTANT.has(e.type) || this.sinceSave >= SAVE_EVERY) this.save();
    return got;
  }

  get stats(): Readonly<Stats> { return { ...this.s }; }

  isUnlocked(id: string): boolean { return this.unlocked.has(id); }

  get unlockedCount(): number { return this.unlocked.size; }

  list(): AchievementEntry[] {
    return ACHIEVEMENTS.map((def) => {
      const t = this.unlocked.get(def.id);
      return t === undefined ? { def, unlocked: false } : { def, unlocked: true, unlockedAt: t };
    });
  }

  /** 아직 저장하지 않은 내용이 있으면 저장한다(페이지를 떠날 때 호출) */
  flush() {
    if (this.dirty) this.save();
  }

  private apply(e: GameEvent) {
    const s = this.s;
    switch (e.type) {
      case 'jump': s.jumps++; break;
      case 'dash': s.dashes++; break;
      case 'slam': s.slams++; break;
      case 'launch': s.launches++; break;
      case 'respawn': s.falls++; break;
      case 'dust': s.dust++; break;
      case 'shard': s.shards = Math.max(s.shards, finite(e.count)); break;
      case 'guardianStrike': s.guardianStrikes++; break;
      case 'expedition': {
        if (!isExpeditionId(e.id)) break;
        if (this.done.has(e.id)) {
          if (e.improved) s.recordBreaks++;
        } else {
          this.done.add(e.id);
        }
        s.expeditions++;
        break;
      }
      case 'tick': {
        const dt = clamp(finite(e.dt), 0, 1);
        s.distance += clamp(finite(e.moved), 0, Infinity);
        s.playTime += dt;
        if (!e.grounded) s.airTime += dt;
        if (e.night > 0.8) s.nightTime += dt;
        if (finite(e.y) > s.bestHeight) s.bestHeight = finite(e.y);
        this.sinceSave += dt;
        break;
      }
      default: break;
    }
  }

  private save() {
    const data: AchievementSave = {
      stats: { ...this.s },
      done: [...this.done],
      unlocked: Object.fromEntries(this.unlocked),
    };
    try { this.storage.set(data); } catch { /* 이번 판만 */ }
    this.dirty = false;
    this.sinceSave = 0;
  }
}
