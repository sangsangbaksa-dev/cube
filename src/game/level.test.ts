import { describe, it, expect } from 'vitest';
import { Level, needXp, titleFor, xpFor, MAX_LEVEL, type LevelSave, type LevelStorage } from './level';
import type { GameEvent } from './events';

/** 메모리 저장소. 쓰기 횟수와 마지막 값을 볼 수 있다 */
function memory(initial: unknown = null) {
  const box = { value: initial as unknown, writes: 0 };
  const storage: LevelStorage = {
    get: () => box.value,
    set: (v: LevelSave) => { box.writes++; box.value = v; },
  };
  return { storage, box };
}

/** 레벨 L에 도달하는 누적 경험치 (테스트용 독립 계산) */
const cum = (L: number) => { let s = 0; for (let n = 1; n < L; n++) s += needXp(n); return s; };

const tick = (moved: number, dt = 0.1): GameEvent => ({ type: 'tick', dt, moved, grounded: true, y: 0, night: 0 });

describe('필요 경험치 곡선', () => {
  it('needXp(n) = round(80 * n^1.35)', () => {
    expect(needXp(1)).toBe(80);
    expect(needXp(2)).toBe(204);
    expect(needXp(10)).toBe(Math.round(80 * 10 ** 1.35));
  });

  it('레벨이 오를수록 필요 경험치가 늘어난다', () => {
    for (let n = 1; n < MAX_LEVEL; n++) expect(needXp(n + 1)).toBeGreaterThan(needXp(n));
  });

  it('처음 레벨은 80 XP로 오른다', () => {
    const l = new Level(memory().storage);
    expect(l.grant(79)).toEqual([]);
    expect(l.level).toBe(1);
    expect(l.xp).toBe(79);
    expect(l.need).toBe(80);
    const ups = l.grant(1);
    expect(ups.map((u) => u.level)).toEqual([2]);
    expect(l.level).toBe(2);
    expect(l.xp).toBe(0);
    expect(l.need).toBe(204);
  });

  it('progress는 0~1 비율이다', () => {
    const l = new Level(memory().storage);
    l.grant(40);
    expect(l.progress).toBeCloseTo(0.5);
  });
});

describe('레벨업', () => {
  it('한 번에 여러 레벨이 오르면 레벨마다 정보를 돌려준다', () => {
    const l = new Level(memory().storage);
    const ups = l.grant(cum(4)); // Lv 4 도달
    expect(ups.map((u) => u.level)).toEqual([2, 3, 4]);
    expect(l.level).toBe(4);
    expect(l.xp).toBe(0);
  });

  it('coins는 level * 5', () => {
    const l = new Level(memory().storage);
    const ups = l.grant(cum(3));
    expect(ups.map((u) => u.coins)).toEqual([10, 15]);
  });

  it('칭호가 바뀐 레벨에서만 titleChanged가 true다', () => {
    const l = new Level(memory().storage);
    const ups = l.grant(cum(7)); // Lv 2..7
    const changed = ups.filter((u) => u.titleChanged).map((u) => u.level);
    expect(changed).toEqual([3, 6]);
    expect(ups.find((u) => u.level === 6)?.title).toBe('바람 타는 큐브');
    expect(ups.find((u) => u.level === 5)?.title).toBe('돌길 산책자');
  });

  it('칭호 구간', () => {
    expect(titleFor(1)).toBe('풋내기 큐브');
    expect(titleFor(2)).toBe('풋내기 큐브');
    expect(titleFor(3)).toBe('돌길 산책자');
    expect(titleFor(13)).toBe('수정 탐험가');
    expect(titleFor(14)).toBe('회오리 곡예사');
    expect(titleFor(49)).toBe('등대지기');
    expect(titleFor(50)).toBe('전설의 별빛 큐브');
  });
});

describe('최대 레벨 캡', () => {
  it('50에서 멈추고 이후 경험치는 버린다', () => {
    const l = new Level(memory().storage);
    const ups = l.grant(1e9);
    expect(l.level).toBe(MAX_LEVEL);
    expect(ups.at(-1)?.level).toBe(MAX_LEVEL);
    expect(l.xp).toBe(0);
    expect(l.need).toBe(0);
    expect(l.progress).toBe(1);
    expect(l.title).toBe('전설의 별빛 큐브');
    const total = l.total;
    expect(l.grant(500)).toEqual([]);
    expect(l.handle({ type: 'victory' })).toEqual([]);
    expect(l.total).toBe(total);
  });
});

describe('이벤트별 경험치', () => {
  it('표에 맞게 XP를 준다', () => {
    const cases: [GameEvent, number][] = [
      [{ type: 'jump' }, 1],
      [{ type: 'dash' }, 2],
      [{ type: 'launch' }, 3],
      [{ type: 'slam', power: 0.5 }, 4],
      [{ type: 'checkpoint' }, 15],
      [{ type: 'dust', collected: 1, total: 9 }, 25],
      [{ type: 'shard', id: 'a', count: 1 }, 120],
      [{ type: 'expedition', id: 'x', time: 30, improved: false }, 60],
      [{ type: 'expedition', id: 'x', time: 30, improved: true }, 100],
      [{ type: 'guardianStrike' }, 30],
      [{ type: 'guardianDefeated' }, 150],
      [{ type: 'victory' }, 300],
      [{ type: 'land', impact: 3, onPlatform: true }, 0],
      [{ type: 'respawn' }, 0],
    ];
    for (const [e, xp] of cases) {
      expect(xpFor(e)).toBe(xp);
      const l = new Level(memory().storage);
      l.handle(e);
      expect(l.total).toBe(xp);
    }
  });

  it('틱: 이동 10m당 1 XP, 소수는 누적된다', () => {
    const l = new Level(memory().storage);
    l.handle(tick(2.5));
    l.handle(tick(2.5));
    l.handle(tick(2.5));
    expect(l.total).toBe(0);
    l.handle(tick(2.5)); // 합계 10m
    expect(l.total).toBe(1);
    l.handle(tick(25)); // carry 0 + 25m → 2 XP, 5m 남음
    expect(l.total).toBe(3);
    l.handle(tick(5));
    expect(l.total).toBe(4);
  });

  it('틱으로 레벨업하면 레벨업 정보가 나온다', () => {
    const l = new Level(memory().storage);
    const ups = l.handle(tick(800)); // 80 XP → Lv 2
    expect(ups.map((u) => u.level)).toEqual([2]);
    expect(l.level).toBe(2);
  });
});

describe('저장', () => {
  it('틱 저장은 3초 간격으로만 한다', () => {
    const { storage, box } = memory();
    const l = new Level(storage);
    l.handle(tick(10, 1));
    l.handle(tick(10, 1));
    expect(box.writes).toBe(0);
    l.handle(tick(10, 1));
    expect(box.writes).toBe(1);
    expect(box.value).toEqual({ total: 3, carry: 0 });
  });

  it('레벨업은 틱 간격과 무관하게 즉시 저장한다', () => {
    const { storage, box } = memory();
    const l = new Level(storage);
    l.handle(tick(800, 0.1)); // Lv 2
    expect(box.writes).toBe(1);
  });

  it('일반 이벤트는 즉시 저장한다', () => {
    const { storage, box } = memory();
    const l = new Level(storage);
    l.handle({ type: 'jump' });
    expect(box.writes).toBe(1);
  });

  it('flush()는 대기 중인 틱 값을 저장한다', () => {
    const { storage, box } = memory();
    const l = new Level(storage);
    l.handle(tick(10, 0.5));
    expect(box.writes).toBe(0);
    l.flush();
    expect(box.writes).toBe(1);
    l.flush();
    expect(box.writes).toBe(1);
  });

  it('저장 왕복: 누적 경험치, 레벨, 이동 소수 carry가 복원된다', () => {
    const { storage } = memory();
    const a = new Level(storage);
    a.grant(cum(9) + 33);
    a.handle(tick(7));
    a.flush();
    const b = new Level(storage);
    expect(b.level).toBe(9);
    expect(b.xp).toBe(33);
    expect(b.total).toBe(a.total);
    b.handle(tick(3)); // carry 7 + 3 = 10m → 1 XP
    expect(b.total).toBe(a.total + 1);
  });

  it('손상된 저장값은 무시한다', () => {
    const bad: unknown[] = [
      'garbage', 42, [], { total: 'x', carry: 0 }, { total: -5, carry: 0 },
      { total: 1.5, carry: 0 }, { total: NaN, carry: 0 }, { total: Infinity, carry: 0 },
      { total: 10, carry: 99 }, { total: 10, carry: -1 }, { total: 10, carry: 'a' },
    ];
    for (const v of bad) {
      const l = new Level(memory(v).storage);
      expect(l.level).toBe(1);
      expect(l.xp).toBeLessThan(80);
    }
    // 유효한 total은 살리고 무효한 carry만 버린다
    const kept = new Level(memory({ total: 10, carry: 99 }).storage);
    expect(kept.total).toBe(10);
    expect(new Level(memory({ total: NaN, carry: 0 }).storage).total).toBe(0);
  });

  it('범위를 넘는 저장값은 최대 레벨 누적으로 캡한다', () => {
    const l = new Level(memory({ total: 1e15, carry: 0 }).storage);
    expect(l.level).toBe(MAX_LEVEL);
    expect(l.progress).toBe(1);
  });

  it('저장소가 던져도 게임은 돌아간다', () => {
    const storage: LevelStorage = {
      get: () => { throw new Error('denied'); },
      set: () => { throw new Error('quota'); },
    };
    const l = new Level(storage);
    expect(l.level).toBe(1);
    expect(() => l.handle({ type: 'jump' })).not.toThrow();
    expect(l.total).toBe(1);
  });

  it('grant 사유를 보관하고 소수 XP는 내린다', () => {
    const l = new Level(memory().storage);
    l.grant(3.9, '의뢰 보상');
    expect(l.total).toBe(3);
    expect(l.lastReason).toBe('의뢰 보상');
    expect(l.grant(NaN)).toEqual([]);
  });
});
