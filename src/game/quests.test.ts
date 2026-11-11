import { describe, it, expect } from 'vitest';
import type { GameEvent } from './events';
import { Quests, pickQuests, localDateKey, BONUS_COIN, type QuestDef, type StoredQuests } from './quests';

const tick = (o: Partial<Extract<GameEvent, { type: 'tick' }>> = {}): GameEvent =>
  ({ type: 'tick', dt: 0, moved: 0, grounded: true, y: 0, night: 0, ...o });

/** 메모리 저장소. set 호출 횟수를 센다 */
function memStore(init: unknown = null) {
  let v: unknown = init;
  let writes = 0;
  return {
    store: { get: () => v, set: (x: StoredQuests) => { v = x; writes++; } },
    peek: () => v,
    writes: () => writes,
  };
}

/** 2026년 안에서 조건을 만족하는 날짜 찾기 */
function findDate(pred: (qs: QuestDef[]) => boolean): string {
  for (let i = 0; i < 3000; i++) {
    const day = localDateKey(new Date(2026, 0, 1 + i));
    if (pred(pickQuests(day))) return day;
  }
  throw new Error('조건에 맞는 날짜가 없음');
}

const has = (id: string) => (qs: QuestDef[]) => qs.some((q) => q.id.split(':')[0] === id);

/** 이 의뢰를 목표까지 채우는 이벤트 */
function eventsFor(q: QuestDef): GameEvent[] {
  const key = q.id.split(':')[0];
  const n = q.goal - Math.floor(q.progress);
  const repeat = (e: GameEvent, times = n) => Array.from({ length: times }, () => e);
  switch (key) {
    case 'jump': return repeat({ type: 'jump' });
    case 'dash': return repeat({ type: 'dash' });
    case 'slam': return repeat({ type: 'slam', power: 0.2 });
    case 'hardslam': return repeat({ type: 'slam', power: 1 });
    case 'launch': return repeat({ type: 'launch' });
    case 'checkpoint': return repeat({ type: 'checkpoint' });
    case 'dust': return repeat({ type: 'dust', collected: 1, total: 9 });
    case 'expedition': return repeat({ type: 'expedition', id: 'route-8', time: 60, improved: false }, 1);
    case 'route': return [{ type: 'expedition', id: `route-${q.id.split(':')[1]}`, time: 60, improved: false }];
    case 'distance':
    case 'streak': return [tick({ moved: q.goal })];
    case 'airtime': return [tick({ grounded: false, dt: q.goal })];
    case 'night': return [tick({ night: 1, dt: q.goal })];
    case 'height': return [tick({ y: q.goal })];
    case 'landing': return repeat({ type: 'land', impact: 1, onPlatform: true });
    default: throw new Error(`알 수 없는 의뢰 ${q.id}`);
  }
}

describe('오늘의 의뢰 결정성', () => {
  it('같은 날짜면 항상 같은 의뢰 3개가 나온다', () => {
    const a = pickQuests('2026-11-11');
    const b = pickQuests('2026-11-11');
    expect(b).toEqual(a);
    const q1 = new Quests({ storage: memStore().store, today: () => '2026-11-11' });
    const q2 = new Quests({ storage: memStore().store, today: () => '2026-11-11' });
    expect(q2.list()).toEqual(q1.list());
  });

  it('3개이며 서로 다른 종류, 보상은 15~40', () => {
    for (let i = 0; i < 40; i++) {
      const day = localDateKey(new Date(2026, 0, 1 + i));
      const qs = pickQuests(day);
      expect(qs).toHaveLength(3);
      expect(new Set(qs.map((q) => q.id.split(':')[0])).size).toBe(3);
      for (const q of qs) {
        expect(q.progress).toBe(0);
        expect(q.done).toBe(false);
        expect(q.reward).toBeGreaterThanOrEqual(15);
        expect(q.reward).toBeLessThanOrEqual(40);
      }
    }
  });

  it('다른 날짜에는 다른 조합이 나온다', () => {
    const sets = new Set<string>();
    for (let i = 0; i < 60; i++) {
      sets.add(pickQuests(localDateKey(new Date(2026, 0, 1 + i))).map((q) => q.id).join('|'));
    }
    expect(sets.size).toBeGreaterThan(10);
  });

  it('특정 원정은 ROUTES[7..13]의 이름을 쓴다', () => {
    const day = findDate(has('route'));
    const q = pickQuests(day).find((x) => x.id.startsWith('route:'))!;
    expect(q.title).toMatch(/^「.+」 원정 완주$/);
    const n = Number(q.id.split(':')[1]);
    expect(n).toBeGreaterThanOrEqual(8);
    expect(n).toBeLessThanOrEqual(14);
  });

  it('별가루가 없으면 별가루 의뢰를 뽑지 않는다', () => {
    for (let i = 0; i < 200; i++) {
      const day = localDateKey(new Date(2026, 0, 1 + i));
      expect(pickQuests(day, 1).some((q) => q.id === 'dust')).toBe(false);
    }
    const day = findDate(has('dust'));
    expect(pickQuests(day, 1000).some((q) => q.id === 'dust')).toBe(true);
  });
});

describe('진행과 완료', () => {
  it('목표까지 채우면 한 번만 완료로 돌려준다', () => {
    const day = findDate(has('jump'));
    const quests = new Quests({ storage: memStore().store, today: () => day });
    const jump = quests.list().find((q) => q.id === 'jump')!;
    const first = [];
    for (let i = 0; i < jump.goal - 1; i++) first.push(...quests.handle({ type: 'jump' }));
    expect(first).toEqual([]);
    const done = quests.handle({ type: 'jump' });
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ id: 'jump', done: true, progress: jump.goal });
    expect(quests.handle({ type: 'jump' })).toEqual([]);
    expect(quests.list().find((q) => q.id === 'jump')!.progress).toBe(jump.goal);
  });

  it('진행도는 목표를 넘지 않는다', () => {
    const day = findDate(has('dash'));
    const quests = new Quests({ storage: memStore().store, today: () => day });
    const goal = quests.list().find((q) => q.id === 'dash')!.goal;
    for (let i = 0; i < goal + 5; i++) quests.handle({ type: 'dash' });
    expect(quests.list().find((q) => q.id === 'dash')!.progress).toBe(goal);
  });

  it('특정 원정은 해당 코스 완주에만 반응한다', () => {
    const day = findDate(has('route'));
    const quests = new Quests({ storage: memStore().store, today: () => day });
    const route = quests.list().find((q) => q.id.startsWith('route:'))!;
    const other = Number(route.id.split(':')[1]) === 8 ? 9 : 8;
    expect(quests.handle({ type: 'expedition', id: `route-${other}`, time: 50, improved: false })).toEqual([]);
    const done = quests.handle({ type: 'expedition', id: `route-${route.id.split(':')[1]}`, time: 50, improved: true });
    expect(done.map((q) => q.id)).toContain(route.id);
  });
});

describe('날짜 변경', () => {
  it('날짜가 바뀌면 새 의뢰로 교체되고 진행이 초기화된다', () => {
    const dayA = findDate(has('jump'));
    let today = dayA;
    const quests = new Quests({ storage: memStore().store, today: () => today });
    quests.handle({ type: 'jump' });
    expect(quests.list().find((q) => q.id === 'jump')!.progress).toBe(1);

    today = localDateKey(new Date(2027, 5, 1));
    expect(quests.date).toBe(today);
    // 새 날짜의 의뢰 목록이고, 이벤트 하나 먼저 받은 진행은 남지 않는다
    expect(quests.list()).toEqual(pickQuests(today));
    expect(quests.list().every((q) => q.progress === 0)).toBe(true);
  });

  it('새 날짜로 저장된 값을 다시 읽으면 그대로 복원된다', () => {
    const day = findDate(has('jump'));
    const mem = memStore();
    const a = new Quests({ storage: mem.store, today: () => day });
    a.handle({ type: 'jump' });
    const b = new Quests({ storage: mem.store, today: () => day });
    expect(b.list().find((q) => q.id === 'jump')!.progress).toBe(1);
  });
});

describe('연속형 의뢰', () => {
  it('떨어지면(respawn) 진행이 0으로 돌아간다', () => {
    const day = findDate(has('streak'));
    const quests = new Quests({ storage: memStore().store, today: () => day });
    const s = () => quests.list().find((q) => q.id === 'streak')!;
    const goal = s().goal;
    quests.handle(tick({ moved: goal - 10 }));
    expect(s().progress).toBe(goal - 10);
    quests.handle({ type: 'respawn' });
    expect(s().progress).toBe(0);
    expect(s().done).toBe(false);
    quests.handle(tick({ moved: goal }));
    expect(s().done).toBe(true);
  });
});

describe('보너스', () => {
  it('세 의뢰를 모두 끝내면 보너스를 한 번만 준다', () => {
    const day = findDate((qs) => qs.length === 3);
    const quests = new Quests({ storage: memStore().store, today: () => day });
    expect(quests.takeBonus()).toBe(0);
    for (const q of quests.list()) for (const e of eventsFor(q)) quests.handle(e);
    expect(quests.allDone).toBe(true);
    expect(quests.takeBonus()).toBe(BONUS_COIN);
    expect(quests.takeBonus()).toBe(0);
    expect(quests.bonusClaimed).toBe(true);
  });
});

describe('저장', () => {
  it('잘못된 저장 값은 무시하고 새로 뽑는다', () => {
    const day = '2026-11-11';
    const mem = memStore({ date: day, quests: [{ id: 'jump', progress: 'x' }], bonusClaimed: 'yes' });
    expect(() => new Quests({ storage: mem.store, today: () => day })).not.toThrow();
    const quests = new Quests({ storage: memStore('garbage').store, today: () => day });
    expect(quests.list()).toEqual(pickQuests(day));
  });

  it('저장소가 예외를 던져도 게임은 돌아간다', () => {
    const boom = {
      get: () => { throw new Error('denied'); },
      set: () => { throw new Error('full'); },
    };
    const quests = new Quests({ storage: boom, today: () => '2026-11-11' });
    expect(quests.handle({ type: 'jump' })).toEqual([]);
    expect(quests.list()).toHaveLength(3);
  });

  it('누적(tick)은 1초 이상 간격으로만 저장한다', () => {
    const mem = memStore();
    let t = 0;
    const day = findDate(has('distance'));
    const quests = new Quests({ storage: mem.store, today: () => day, now: () => t });
    const base = mem.writes();
    t = 100; quests.handle(tick({ moved: 5 }));
    t = 500; quests.handle(tick({ moved: 5 }));
    expect(mem.writes()).toBe(base);
    t = 1200; quests.handle(tick({ moved: 5 }));
    expect(mem.writes()).toBe(base + 1);
    const q = quests.list().find((x) => x.id === 'distance')!;
    expect(q.progress).toBe(15);
  });

  it('flush()는 아직 저장 안 된 누적을 저장한다', () => {
    const mem = memStore();
    let t = 0;
    const day = findDate(has('distance'));
    const quests = new Quests({ storage: mem.store, today: () => day, now: () => t });
    t = 10; quests.handle(tick({ moved: 7 }));
    quests.flush();
    const saved = mem.peek() as StoredQuests;
    expect(saved.quests.find((q) => q.id === 'distance')!.progress).toBe(7);
  });
});
