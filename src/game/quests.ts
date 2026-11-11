import type { GameEvent } from './events';
import { readJSON, writeJSON } from './events';
import { mulberry32 } from '../util/rand';
import { ROUTES, STORY_ROUTE_COUNT } from '../world/terrain';

// 오늘의 의뢰: 날짜로 정해지는 3개의 일일 목표. 같은 날짜면 항상 같은 의뢰가 나온다.
export const QUEST_KEY = 'cubequest.quests.v1';
export const QUEST_COUNT = 3;
export const BONUS_COIN = 50;

export interface QuestDef {
  /** 템플릿 키. 특정 원정은 'route:<번호>' (번호는 원정 site id) */
  id: string;
  title: string;
  goal: number;
  progress: number;
  reward: number;
  done: boolean;
}

export interface StoredQuests {
  date: string;
  quests: QuestDef[];
  bonusClaimed: boolean;
}

export interface QuestsOptions {
  /** 기본값은 events.ts의 readJSON/writeJSON */
  storage?: { get(): unknown; set(v: StoredQuests): void };
  /** 로컬 YYYY-MM-DD */
  today?: () => string;
  /** 아직 주울 수 있는 별가루 수. 적으면 별가루 의뢰를 다른 것으로 바꾼다 */
  remainingDust?: () => number;
  now?: () => number;
}

type Rnd = () => number;
interface Made { id: string; title: string; goal: number }
interface Template {
  key: string;
  /** 같은 그룹은 하루에 한 번만 뽑힌다 */
  group: string;
  make(rnd: Rnd, remainingDust?: number): Made | null;
  /** 이벤트를 받아 새 진행도를 돌려준다. 관련 없으면 null */
  on(e: GameEvent, q: QuestDef): number | null;
}

const range = (rnd: Rnd, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T>(rnd: Rnd, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const tickOf = (e: GameEvent) => (e.type === 'tick' ? e : null);

const count = (key: string, lo: number, hi: number, title: (n: number) => string, type: GameEvent['type']): Template => ({
  key, group: key,
  make: (rnd) => { const goal = range(rnd, lo, hi); return { id: key, title: title(goal), goal }; },
  on: (e, q) => (e.type === type ? q.progress + 1 : null),
});

/** 특정 원정: ROUTES의 원정 코스(7번째 이후). 저장 키 route-<site id>와 맞춘다 */
const EXPEDITION_ROUTES = ROUTES.map((r, i) => ({ name: r.name, n: i + 1 })).slice(STORY_ROUTE_COUNT);

const TEMPLATES: Template[] = [
  count('jump', 80, 150, (n) => `점프 ${n}회`, 'jump'),
  count('dash', 20, 40, (n) => `대시 ${n}회`, 'dash'),
  count('slam', 10, 20, (n) => `내려찍기 ${n}회`, 'slam'),
  {
    key: 'hardslam', group: 'slam',
    make: (rnd) => { const goal = range(rnd, 4, 8); return { id: 'hardslam', title: `강하게 내려찍기 ${goal}회`, goal }; },
    on: (e, q) => (e.type === 'slam' && e.power >= 0.8 ? q.progress + 1 : null),
  },
  count('launch', 3, 6, (n) => `발사대 ${n}번 타기`, 'launch'),
  count('checkpoint', 2, 3, (n) => `쉼터 ${n}곳 들르기`, 'checkpoint'),
  {
    key: 'dust', group: 'dust',
    make(rnd, remaining) {
      let goal = range(rnd, 2, 4);
      if (remaining !== undefined) {
        if (remaining < 2) return null;
        goal = Math.min(goal, remaining);
      }
      return { id: 'dust', title: `별가루 ${goal}개 줍기`, goal };
    },
    on: (e, q) => (e.type === 'dust' ? q.progress + 1 : null),
  },
  {
    key: 'expedition', group: 'expedition',
    make: () => ({ id: 'expedition', title: '원정 아무거나 1회 완주', goal: 1 }),
    on: (e, q) => (e.type === 'expedition' ? q.progress + 1 : null),
  },
  {
    key: 'route', group: 'expedition',
    make(rnd) {
      const r = pick(rnd, EXPEDITION_ROUTES);
      return { id: `route:${r.n}`, title: `「${r.name}」 원정 완주`, goal: 1 };
    },
    on: (e, q) => (e.type === 'expedition' && e.id === `route-${q.id.split(':')[1]}` ? q.progress + 1 : null),
  },
  {
    key: 'distance', group: 'move',
    make: (rnd) => { const goal = 50 * range(rnd, 8, 18); return { id: 'distance', title: `이동 ${goal}m`, goal }; },
    on: (e, q) => { const t = tickOf(e); return t ? q.progress + Math.max(0, t.moved) : null; },
  },
  {
    // 떨어지면(respawn) 0으로 되돌아가는 연속 진행형
    key: 'streak', group: 'move',
    make: (rnd) => { const goal = 50 * range(rnd, 3, 6); return { id: 'streak', title: `떨어지지 않고 ${goal}m 이동`, goal }; },
    on: (e, q) => {
      if (e.type === 'respawn') return 0;
      const t = tickOf(e);
      return t ? q.progress + Math.max(0, t.moved) : null;
    },
  },
  {
    key: 'airtime', group: 'airtime',
    make: (rnd) => { const goal = range(rnd, 15, 40); return { id: 'airtime', title: `공중에 ${goal}초 머물기`, goal }; },
    on: (e, q) => { const t = tickOf(e); return t && !t.grounded ? q.progress + Math.max(0, t.dt) : null; },
  },
  {
    key: 'night', group: 'night',
    make: (rnd) => { const goal = range(rnd, 20, 60); return { id: 'night', title: `밤에 ${goal}초 머물기`, goal }; },
    on: (e, q) => { const t = tickOf(e); return t && t.night >= 0.6 ? q.progress + Math.max(0, t.dt) : null; },
  },
  {
    key: 'height', group: 'height',
    make: (rnd) => { const goal = pick(rnd, [10, 15, 20, 25]); return { id: 'height', title: `높이 ${goal}m 이상 도달`, goal }; },
    on: (e, q) => { const t = tickOf(e); return t ? Math.max(q.progress, Math.floor(t.y)) : null; },
  },
  {
    key: 'landing', group: 'landing',
    make: (rnd) => { const goal = range(rnd, 5, 10); return { id: 'landing', title: `코스 발판에 ${goal}번 착지`, goal }; },
    on: (e, q) => (e.type === 'land' && e.onPlatform ? q.progress + 1 : null),
  },
];

const TEMPLATE_BY_KEY = new Map<string, Template>(TEMPLATES.map((t) => [t.key, t]));

/** 로컬 날짜 YYYY-MM-DD */
export function localDateKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hashDate(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** 날짜로 정해지는 의뢰 3개(순수 함수). remainingDust가 있으면 별가루 부족을 반영한다 */
export function pickQuests(date: string, remainingDust?: number): QuestDef[] {
  const rnd = mulberry32(hashDate(date));
  const pool = TEMPLATES.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: QuestDef[] = [];
  const groups = new Set<string>();
  for (const t of pool) {
    if (out.length === QUEST_COUNT) break;
    if (groups.has(t.group)) continue;
    const made = t.make(rnd, remainingDust);
    if (!made) continue;
    groups.add(t.group);
    out.push({ ...made, progress: 0, reward: range(rnd, 15, 40), done: false });
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function parseQuest(x: unknown): QuestDef | null {
  if (!isObj(x)) return null;
  const { id, title, goal, progress, reward, done } = x;
  if (typeof id !== 'string' || !TEMPLATE_BY_KEY.has(id.split(':')[0])) return null;
  if (typeof title !== 'string' || typeof done !== 'boolean') return null;
  if (typeof goal !== 'number' || !Number.isInteger(goal) || goal <= 0) return null;
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0) return null;
  if (typeof reward !== 'number' || !Number.isInteger(reward) || reward < 0) return null;
  return { id, title, goal, progress: Math.min(progress, goal), reward, done };
}

/** 저장된 값을 검증한다. 잘못된 값이면 null (무시하고 새로 뽑는다) */
function parseStored(v: unknown): StoredQuests | null {
  if (!isObj(v)) return null;
  const { date, quests, bonusClaimed } = v;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof bonusClaimed !== 'boolean' || !Array.isArray(quests) || quests.length !== QUEST_COUNT) return null;
  const parsed: QuestDef[] = [];
  for (const x of quests) {
    const q = parseQuest(x);
    if (!q) return null;
    parsed.push(q);
  }
  if (new Set(parsed.map((q) => q.id)).size !== QUEST_COUNT) return null;
  return { date, quests: parsed, bonusClaimed };
}

export class Quests {
  private readonly store: NonNullable<QuestsOptions['storage']>;
  private readonly today: () => string;
  private readonly dustLeft?: () => number;
  private readonly now: () => number;
  private data: StoredQuests;
  private lastSave = -Infinity;
  private dirty = false;

  constructor(opts: QuestsOptions = {}) {
    this.store = opts.storage ?? {
      get: () => readJSON<unknown>(QUEST_KEY),
      set: (v) => writeJSON(QUEST_KEY, v),
    };
    this.today = opts.today ?? (() => localDateKey());
    this.dustLeft = opts.remainingDust;
    this.now = opts.now ?? (() => Date.now());

    const day = this.today();
    const saved = this.safeGet();
    this.data = saved && saved.date === day ? saved : this.fresh(day);
    if (this.data !== saved) this.save();
  }

  get date(): string { this.sync(); return this.data.date; }
  get allDone(): boolean { this.sync(); return this.data.quests.every((q) => q.done); }
  get bonusClaimed(): boolean { this.sync(); return this.data.bonusClaimed; }

  list(): QuestDef[] {
    this.sync();
    return this.data.quests.map((q) => ({ ...q }));
  }

  /** 이벤트를 반영하고, 이번에 완료된 의뢰를 돌려준다 */
  handle(e: GameEvent): QuestDef[] {
    this.sync();
    const finished: QuestDef[] = [];
    let touched = false;
    for (const q of this.data.quests) {
      if (q.done) continue;
      const next = TEMPLATE_BY_KEY.get(q.id.split(':')[0])?.on(e, q);
      if (next === undefined || next === null) continue;
      const before = q.progress;
      q.progress = Math.min(q.goal, Math.max(0, next));
      if (q.progress !== before) touched = true;
      if (q.progress >= q.goal) {
        q.done = true;
        finished.push({ ...q });
      }
    }
    if (finished.length > 0 || (touched && e.type !== 'tick')) this.save();
    else if (touched) {
      // 이동/시간 누적은 1초 이상 간격으로만 저장
      this.dirty = true;
      if (this.now() - this.lastSave >= 1000) this.save();
    }
    return finished;
  }

  /** 모든 의뢰 완료 시 보너스 코인을 한 번만 돌려준다. 아니면 0 */
  takeBonus(): number {
    this.sync();
    if (this.data.bonusClaimed || !this.data.quests.every((q) => q.done)) return 0;
    this.data.bonusClaimed = true;
    this.save();
    return BONUS_COIN;
  }

  /** 아직 저장 안 된 누적 진행을 저장 (페이지를 닫을 때 호출) */
  flush() {
    if (this.dirty) this.save();
  }

  private fresh(day: string): StoredQuests {
    return { date: day, quests: pickQuests(day, this.dustLeft?.()), bonusClaimed: false };
  }

  /** 날짜가 바뀌었으면 새 의뢰로 교체 */
  private sync() {
    const day = this.today();
    if (day !== this.data.date) {
      this.data = this.fresh(day);
      this.save();
    }
  }

  private safeGet(): StoredQuests | null {
    try { return parseStored(this.store.get()); } catch { return null; }
  }

  private save() {
    try { this.store.set(this.data); } catch { /* 저장을 못 해도 이번 판은 계속 */ }
    this.lastSave = this.now();
    this.dirty = false;
  }
}
