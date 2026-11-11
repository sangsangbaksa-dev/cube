// 별빛 레벨(경험치)과 칭호. 순수 로직이라 DOM/Three 없이 테스트한다.
import { readJSON, writeJSON, type GameEvent } from './events';

export const MAX_LEVEL = 50;
const KEY = 'cubequest.level.v1';
/** 틱 XP는 이 간격(초)마다만 저장한다 */
const TICK_SAVE_SEC = 3;
/** 이동 10m당 1 XP */
const METERS_PER_XP = 10;

export interface LevelUp {
  level: number;
  title: string;
  titleChanged: boolean;
  coins: number;
}

export interface LevelSave {
  /** 누적 경험치 */
  total: number;
  /** 아직 XP가 되지 않은 이동 거리(m, 0~10) */
  carry: number;
}

/** 저장소. 불러온 값은 검증하므로 unknown으로 받는다 */
export interface LevelStorage {
  get(): unknown;
  set(v: LevelSave): void;
}

/** 레벨 n → n+1 에 필요한 경험치 */
export function needXp(n: number): number {
  return Math.round(80 * n ** 1.35);
}

/** CUM[L] = 레벨 L에 도달하기까지의 누적 경험치 (CUM[1] = 0) */
const CUM: number[] = [0, 0];
for (let L = 2; L <= MAX_LEVEL; L++) CUM.push(CUM[L - 1] + needXp(L - 1));
const MAX_TOTAL = CUM[MAX_LEVEL];

export const TITLES: readonly { from: number; name: string }[] = [
  { from: 1, name: '풋내기 큐브' },
  { from: 3, name: '돌길 산책자' },
  { from: 6, name: '바람 타는 큐브' },
  { from: 10, name: '수정 탐험가' },
  { from: 14, name: '회오리 곡예사' },
  { from: 19, name: '잿빛 장인' },
  { from: 25, name: '폭풍의 벗' },
  { from: 32, name: '별빛 수호자' },
  { from: 40, name: '등대지기' },
  { from: 50, name: '전설의 별빛 큐브' },
];

export function titleFor(level: number): string {
  let name = TITLES[0].name;
  for (const t of TITLES) if (level >= t.from) name = t.name;
  return name;
}

/** 이벤트 하나가 주는 XP. 틱(이동)과 착지/리스폰은 별도 처리 */
export function xpFor(e: GameEvent): number {
  switch (e.type) {
    case 'jump': return 1;
    case 'dash': return 2;
    case 'launch': return 3;
    case 'slam': return 4;
    case 'checkpoint': return 15;
    case 'dust': return 25;
    case 'shard': return 120;
    case 'expedition': return 60 + (e.improved ? 40 : 0);
    case 'guardianStrike': return 30;
    case 'guardianDefeated': return 150;
    case 'victory': return 300;
    default: return 0;
  }
}

function levelOf(total: number): number {
  let L = 1;
  while (L < MAX_LEVEL && total >= CUM[L + 1]) L++;
  return L;
}

/** 저장값 검증. 잘못된 값은 버리고 기본값을 쓴다 */
function loadSave(storage: LevelStorage): LevelSave {
  const zero: LevelSave = { total: 0, carry: 0 };
  let raw: unknown;
  try { raw = storage.get(); } catch { return zero; }
  if (!raw || typeof raw !== 'object') return zero;
  const r = raw as Partial<Record<keyof LevelSave, unknown>>;
  const total = r.total;
  const carry = r.carry;
  return {
    total: typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 ? Math.min(total, MAX_TOTAL) : 0,
    carry: typeof carry === 'number' && Number.isFinite(carry) && carry >= 0 && carry < METERS_PER_XP ? carry : 0,
  };
}

export class Level {
  private total = 0;
  private carry = 0;
  private lvl = 1;
  private dirty = false;
  /** 마지막 저장 이후 틱 시간(초) */
  private sinceSave = 0;
  private reason = '';
  private readonly storage: LevelStorage;

  constructor(storage?: LevelStorage) {
    this.storage = storage ?? { get: () => readJSON<LevelSave>(KEY), set: (v) => writeJSON(KEY, v) };
    const s = loadSave(this.storage);
    this.total = s.total;
    this.carry = s.carry;
    this.lvl = levelOf(this.total);
  }

  /** 이벤트를 받아 XP를 더한다. 새로 오른 레벨 정보를 돌려준다 */
  handle(e: GameEvent): LevelUp[] {
    if (e.type === 'tick') return this.addTick(e.moved, e.dt);
    return this.add(xpFor(e), true);
  }

  /** 외부 보너스 XP. 소수는 내림 */
  grant(xp: number, reason?: string): LevelUp[] {
    if (!Number.isFinite(xp)) return [];
    this.reason = reason ?? '';
    return this.add(Math.floor(xp), true);
  }

  /** 마지막 grant의 사유 */
  get lastReason(): string { return this.reason; }
  get level(): number { return this.lvl; }
  /** 현재 레벨 안에서 쌓인 경험치 */
  get xp(): number { return this.total - CUM[this.lvl]; }
  /** 다음 레벨까지 필요한 경험치. 최대 레벨이면 0 */
  get need(): number { return this.lvl >= MAX_LEVEL ? 0 : needXp(this.lvl); }
  /** 누적 경험치 */
  get total_(): number { return this.total; }
  get title(): string { return titleFor(this.lvl); }
  /** 0~1 */
  get progress(): number { return this.need === 0 ? 1 : this.xp / this.need; }

  /** 틱 저장을 즉시 반영 */
  flush(): void {
    if (this.dirty) this.save();
  }

  private addTick(moved: number, dt: number): LevelUp[] {
    let xp = 0;
    if (Number.isFinite(moved) && moved > 0) {
      this.carry += moved;
      xp = Math.floor(this.carry / METERS_PER_XP);
      this.carry -= xp * METERS_PER_XP;
      this.dirty = true;
    }
    const ups = this.add(xp, false);
    if (Number.isFinite(dt) && dt > 0) this.sinceSave += dt;
    if (this.dirty && this.sinceSave >= TICK_SAVE_SEC) this.save();
    return ups;
  }

  private add(xp: number, saveNow: boolean): LevelUp[] {
    if (xp <= 0 || this.total >= MAX_TOTAL) return [];
    const before = this.lvl;
    this.total = Math.min(MAX_TOTAL, this.total + xp);
    this.lvl = levelOf(this.total);
    this.dirty = true;
    const ups: LevelUp[] = [];
    for (let L = before + 1; L <= this.lvl; L++) {
      const title = titleFor(L);
      ups.push({ level: L, title, titleChanged: title !== titleFor(L - 1), coins: L * 5 });
    }
    if (saveNow || ups.length > 0) this.save();
    return ups;
  }

  private save(): void {
    this.dirty = false;
    this.sinceSave = 0;
    try { this.storage.set({ total: this.total, carry: this.carry }); } catch { /* 이번 판만 */ }
  }
}
