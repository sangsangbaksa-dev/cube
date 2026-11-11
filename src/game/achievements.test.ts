import { describe, it, expect } from 'vitest';
import { Achievements, ACHIEVEMENTS, type AchievementSave, type AchievementStorage } from './achievements';
import type { GameEvent } from './events';

// 테스트용 저장소. JSON 왕복으로 localStorage와 같이 문자열 경계를 흉내 낸다.
class MemStore implements AchievementStorage {
  data: unknown;
  writes = 0;
  constructor(init: unknown = null) { this.data = init; }
  get(): unknown { return this.data; }
  set(v: AchievementSave) { this.data = JSON.parse(JSON.stringify(v)); this.writes++; }
}

const jump: GameEvent = { type: 'jump' };
const tick = (over: Partial<Extract<GameEvent, { type: 'tick' }>> = {}): GameEvent =>
  ({ type: 'tick', dt: 0.25, moved: 0, grounded: true, y: 0, night: 0, ...over });
const exp = (id: string, improved = false): GameEvent => ({ type: 'expedition', id, time: 42, improved });
const EXP_IDS = ['route-8', 'route-9', 'route-10', 'route-11', 'route-12', 'route-13', 'route-14'];

/** 여러 이벤트를 흘리고 돌아온 업적 id를 모두 센다 */
function feed(a: Achievements, events: GameEvent[]) {
  const counts = new Map<string, number>();
  for (const e of events) for (const d of a.handle(e)) counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
  return counts;
}

describe('업적 정의', () => {
  it('id는 유일하고 보상은 5~50 정수, 숨김 업적은 2~3개', () => {
    const ids = ACHIEVEMENTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ACHIEVEMENTS) {
      expect(Number.isInteger(d.reward)).toBe(true);
      expect(d.reward).toBeGreaterThanOrEqual(5);
      expect(d.reward).toBeLessThanOrEqual(50);
    }
    const hidden = ACHIEVEMENTS.filter((d) => d.hidden).length;
    expect(hidden).toBeGreaterThanOrEqual(2);
    expect(hidden).toBeLessThanOrEqual(3);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
  });
});

describe('업적 달성', () => {
  it('첫 점프는 한 번만 달성된다', () => {
    const a = new Achievements(new MemStore());
    expect(a.handle(jump).map((d) => d.id)).toEqual(['jump-1']);
    expect(a.handle(jump)).toEqual([]);
    expect(a.isUnlocked('jump-1')).toBe(true);
  });

  it('1000번 점프해도 각 업적은 정확히 한 번만 반환된다', () => {
    const a = new Achievements(new MemStore());
    const counts = feed(a, Array.from({ length: 1000 }, () => jump));
    for (const n of counts.values()) expect(n).toBe(1);
    expect(counts.get('jump-100')).toBe(1);
    expect(counts.get('jump-1000')).toBe(1);
    expect(a.unlockedCount).toBe(counts.size);
  });

  it('별가루 전부는 수집 수가 전체와 같을 때만 달성된다', () => {
    const a = new Achievements(new MemStore());
    expect(a.handle({ type: 'dust', collected: 3, total: 5 }).map((d) => d.id)).not.toContain('dust-all');
    expect(a.handle({ type: 'dust', collected: 5, total: 5 }).map((d) => d.id)).toContain('dust-all');
  });

  it('원정 7곳을 모두 완주해야 원정 대장이 된다, 잘못된 id는 무시', () => {
    const a = new Achievements(new MemStore());
    const got: string[] = [];
    for (const id of EXP_IDS.slice(0, 6)) got.push(...a.handle(exp(id)).map((d) => d.id));
    expect(got).not.toContain('exp-all');
    expect(a.handle(exp('route-3')).map((d) => d.id)).toEqual([]); // 원정 범위 밖
    expect(a.handle(exp(EXP_IDS[6])).map((d) => d.id)).toContain('exp-all'); // 일곱 번째 서로 다른 id
    expect(a.handle(exp(EXP_IDS[6])).map((d) => d.id)).toEqual([]); // 중복 완주는 달성이 아님
    expect(a.stats.expeditions).toBe(8); // 6 + 7번째 + 중복 1회, route-3 제외
  });

  it('기록 갱신은 이미 완주한 원정을 다시 깼을 때만 센다', () => {
    const a = new Achievements(new MemStore());
    expect(a.handle(exp('route-8', true)).map((d) => d.id)).toEqual(['exp-first']);
    expect(a.stats.recordBreaks).toBe(0);
    expect(a.handle(exp('route-8', true)).map((d) => d.id)).toEqual(['exp-record']);
    expect(a.stats.recordBreaks).toBe(1);
    a.handle(exp('route-8', false));
    expect(a.stats.recordBreaks).toBe(1);
  });

  it('공중 체류와 밤 시간은 tick의 dt로 누적된다', () => {
    const a = new Achievements(new MemStore());
    const counts = feed(a, Array.from({ length: 2400 }, () => tick({ grounded: false, night: 0.9 })));
    expect(a.stats.airTime).toBeCloseTo(600, 6);
    expect(a.stats.nightTime).toBeCloseTo(600, 6);
    expect(counts.get('air-10m')).toBe(1);
    expect(counts.get('night-5m')).toBe(1);
    expect(a.stats.playTime).toBeCloseTo(600, 6);
  });

  it('이동 거리와 최고 높이는 tick에서 누적/갱신된다', () => {
    const a = new Achievements(new MemStore());
    feed(a, [tick({ moved: 600, y: 12 }), tick({ moved: 500, y: 61 }), tick({ moved: 0, y: 3 })]);
    expect(a.stats.distance).toBeCloseTo(1100, 6);
    expect(a.stats.bestHeight).toBe(61);
    expect(a.isUnlocked('dist-1km')).toBe(true);
    expect(a.isUnlocked('height-60')).toBe(true);
  });

  it('숨김 업적: 큰 슬램은 power 0.9 이상에서만', () => {
    const a = new Achievements(new MemStore());
    expect(a.handle({ type: 'slam', power: 0.5 }).map((d) => d.id)).not.toContain('slam-big');
    expect(a.handle({ type: 'slam', power: 0.95 }).map((d) => d.id)).toContain('slam-big');
  });
});

describe('저장', () => {
  it('저장 후 다시 불러오면 통계와 달성 상태가 같다', () => {
    const store = new MemStore();
    const a = new Achievements(store);
    feed(a, [jump, jump, { type: 'shard', id: 'route-1', count: 2 }, exp('route-8'), tick({ moved: 3, grounded: false })]);
    a.flush();

    const b = new Achievements(store);
    expect(b.stats).toEqual(a.stats);
    expect(b.unlockedCount).toBe(a.unlockedCount);
    expect(b.isUnlocked('jump-1')).toBe(true);
    expect(b.isUnlocked('shard-1')).toBe(true);
    expect(b.list().find((e) => e.def.id === 'exp-first')?.unlockedAt).toBeTypeOf('number');
    // 불러온 뒤에는 이미 달성한 업적이 다시 나오지 않는다
    expect(b.handle(jump)).toEqual([]);
    // 완주 기록도 이어진다: route-8을 다시 깨도 완주 집합은 그대로
    b.handle(exp('route-8', true));
    expect(b.stats.recordBreaks).toBe(1);
  });

  it('tick은 5초(dt 합) 전까지 저장하지 않고, 달성/중요 이벤트는 즉시 저장한다', () => {
    const store = new MemStore();
    const a = new Achievements(store);
    feed(a, Array.from({ length: 19 }, () => tick()));
    expect(store.writes).toBe(0); // 4.75초
    a.handle(tick());
    expect(store.writes).toBe(1); // 5.0초
    a.handle(jump); // 첫 점프 달성
    expect(store.writes).toBe(2);
    a.handle({ type: 'land', impact: 1, onPlatform: true });
    expect(store.writes).toBe(2);
    a.handle({ type: 'victory' });
    expect(store.writes).toBe(3);
  });

  it('잘못된 저장 데이터는 무시한다', () => {
    for (const bad of ['garbage', 42, [1, 2], null]) {
      const a = new Achievements(new MemStore(bad));
      expect(a.unlockedCount).toBe(0);
      expect(a.stats.jumps).toBe(0);
    }

    const a = new Achievements(new MemStore({
      stats: { jumps: 'x', dashes: -5, distance: 10, playTime: Number.NaN },
      done: ['route-99', 'route-8', 'route-8', 'x', 3],
      unlocked: { 'jump-1': 'bad', 'dash-50': 100, nope: 1 },
    }));
    expect(a.stats.jumps).toBe(0);
    expect(a.stats.dashes).toBe(0);
    expect(a.stats.playTime).toBe(0);
    expect(a.stats.distance).toBe(10);
    expect(a.isUnlocked('jump-1')).toBe(false);
    expect(a.isUnlocked('dash-50')).toBe(true);
    expect(a.isUnlocked('nope')).toBe(false);
    // route-99와 'x'는 완주 집합에 들어가지 않는다: 5곳을 더 깨도 원정 대장은 아니다
    const got = feed(a, ['route-9', 'route-10', 'route-11', 'route-12', 'route-13'].map((id) => exp(id)));
    expect(got.has('exp-all')).toBe(false);
    expect(a.handle(exp('route-14')).map((d) => d.id)).toContain('exp-all');
  });

  it('저장소가 예외를 던져도 게임은 동작한다', () => {
    const broken: AchievementStorage = {
      get() { throw new Error('denied'); },
      set() { throw new Error('quota'); },
    };
    const a = new Achievements(broken);
    expect(a.handle(jump).map((d) => d.id)).toEqual(['jump-1']);
    expect(() => a.flush()).not.toThrow();
  });
});
