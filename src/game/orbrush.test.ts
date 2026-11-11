import { describe, it, expect } from 'vitest';
import { OrbRush, comboMultiplier, STORAGE_KEY, type OrbRushStorage, type RushEvent, type Orb } from './orbrush';
import { mulberry32 } from '../util/rand';

const flat = () => 0;
const CENTER = { x: 0, z: 0 };
const ON_CENTER = { x: 0, y: 0, z: 0 };

function memory(initial: unknown = null) {
  const box = { value: initial as unknown, writes: 0 };
  const storage: OrbRushStorage = {
    get: () => box.value,
    set: (v) => { box.value = v; box.writes++; },
  };
  return { storage, box };
}

function make(opts: { height?: (x: number, z: number) => number; seed?: number; storage?: OrbRushStorage } = {}) {
  return new OrbRush({
    height: opts.height ?? flat,
    rand: mulberry32(opts.seed ?? 7),
    storage: opts.storage ?? memory().storage,
  });
}

/** 플레이어를 구슬 위로 옮겨 수집하는 편의 함수 */
function collectAt(rush: OrbRush, o: Orb, dt = 0.016): RushEvent[] {
  return rush.step(dt, { x: o.x, y: o.y, z: o.z });
}

/** 긴 시간을 최대 스텝(0.5초)으로 나눠 흘린다 */
function wait(rush: OrbRush, secs: number, pos = ON_CENTER): RushEvent[] {
  const out: RushEvent[] = [];
  let left = secs;
  while (left > 1e-9 && rush.state === 'running') {
    const d = Math.min(0.5, left);
    out.push(...rush.step(d, pos));
    left -= d;
  }
  return out;
}

const BASE: Record<Orb['kind'], number> = { normal: 10, gold: 30, time: 0 };

/** 시계 구슬이 처음 풀에 들어 있는 시드를 찾는다 */
function seedWith(kind: Orb['kind']): number {
  for (let seed = 1; seed < 500; seed++) {
    const r = make({ seed });
    r.start(CENTER);
    if (r.orbs.some((o) => o.kind === kind)) return seed;
  }
  throw new Error(`시드를 찾지 못함: ${kind}`);
}

describe('시작과 종료', () => {
  it('처음에는 idle, start 뒤 running이고 구슬 6개가 있다', () => {
    const r = make();
    expect(r.state).toBe('idle');
    r.start(CENTER);
    expect(r.state).toBe('running');
    expect(r.orbs).toHaveLength(6);
    expect(r.timeLeft).toBe(45);
    expect(r.score).toBe(0);
  });

  it('start 이벤트는 다음 step에서 나간다', () => {
    const r = make();
    r.start(CENTER);
    const ev = r.step(0.016, ON_CENTER);
    expect(ev[0]).toEqual({ kind: 'start' });
    expect(r.step(0.016, ON_CENTER).some((e) => e.kind === 'start')).toBe(false);
  });

  it('제한 시간이 다하면 완주 종료(aborted false)하고 코인과 수집 수를 낸다', () => {
    const r = make();
    r.start(CENTER);
    const o = r.orbs[0];
    collectAt(r, o);
    const ev = wait(r, 46);
    const end = ev.find((e) => e.kind === 'end');
    expect(r.state).toBe('done');
    expect(end).toBeDefined();
    if (end?.kind !== 'end') throw new Error();
    expect(end.aborted).toBe(false);
    expect(end.score).toBe(r.score);
    expect(end.coins).toBe(Math.floor(end.score / 40));
    expect(end.collected).toBe(1);
    expect(r.orbs).toHaveLength(0);
    expect(r.timeLeft).toBe(0);
  });

  it('done 상태에서는 step이 아무것도 내지 않는다', () => {
    const r = make();
    r.start(CENTER);
    wait(r, 50);
    expect(r.step(1, ON_CENTER)).toEqual([]);
  });

  it('cancel하면 idle로 돌아가고 end 이벤트는 내지 않는다', () => {
    const r = make();
    r.start(CENTER);
    r.cancel();
    expect(r.state).toBe('idle');
    expect(r.orbs).toHaveLength(0);
    expect(r.step(1, ON_CENTER)).toEqual([]);
  });

  it('다시 시작하면 점수와 시간이 새로 시작한다', () => {
    const r = make();
    r.start(CENTER);
    collectAt(r, r.orbs[0]);
    wait(r, 50);
    r.start(CENTER);
    expect(r.state).toBe('running');
    expect(r.score).toBe(0);
    expect(r.timeLeft).toBe(45);
  });
});

describe('구슬 풀과 스폰', () => {
  it('수집하면 바로 다시 6개로 채운다', () => {
    const r = make();
    r.start(CENTER);
    for (let i = 0; i < 20; i++) {
      const target = r.orbs[0];
      collectAt(r, target);
      expect(r.orbs).toHaveLength(6);
    }
  });

  it('구슬은 구역 반경 안, 물 밖, 지면 위 1m에 있다', () => {
    const height = (x: number) => (x > 20 ? -5 : 0.2 * x);
    const r = make({ height, seed: 3 });
    r.start({ x: 0, z: 0 });
    for (let i = 0; i < 30; i++) {
      for (const o of r.orbs) {
        expect(Math.hypot(o.x, o.z)).toBeLessThanOrEqual(38);
        expect(o.y - 1).toBeGreaterThanOrEqual(-2);
        expect(o.x).toBeLessThan(20);
      }
      collectAt(r, r.orbs[0]);
    }
  });

  it('가파른 곳에는 구슬을 두지 않는다', () => {
    // 모든 곳이 1m당 2m씩 오르는 경사면: 구슬이 한 개도 생기지 않는다
    const r = make({ height: (x) => x * 2 });
    r.start(CENTER);
    expect(r.orbs).toHaveLength(0);
  });

  it('새 구슬은 플레이어 주변 10~28m에 생긴다', () => {
    const r = make({ seed: 11 });
    r.start(CENTER);
    const target = r.orbs[0];
    const before = new Set(r.orbs.map((o) => o.id));
    const pl = { x: target.x, y: target.y, z: target.z };
    r.step(0.016, pl);
    const fresh = r.orbs.filter((o) => !before.has(o.id));
    expect(fresh).toHaveLength(1);
    const d = Math.hypot(fresh[0].x - pl.x, fresh[0].z - pl.z);
    expect(d).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(d).toBeLessThanOrEqual(28 + 1e-9);
  });

  it('구슬 종류는 시계 8%, 금빛 10% 안팎, 나머지 일반이다', () => {
    const r = make({ seed: 99 });
    const counts = { normal: 0, gold: 0, time: 0 };
    r.start(CENTER);
    for (let i = 0; i < 400; i++) {
      for (const ev of collectAt(r, r.orbs[0], 0.001)) {
        if (ev.kind === 'collect') counts[ev.orb.kind]++;
        if (ev.kind === 'time') counts[ev.orb.kind]++;
      }
    }
    const n = counts.normal + counts.gold + counts.time;
    expect(n).toBe(400);
    // 표본 추정이라 넓은 범위로만 확인
    expect(counts.gold / n).toBeGreaterThan(0.04);
    expect(counts.gold / n).toBeLessThan(0.18);
    expect(counts.time / n).toBeGreaterThan(0.02);
    expect(counts.time / n).toBeLessThan(0.16);
  });
});

describe('수집과 점수', () => {
  it('첫 수집은 콤보 1, 배율 x1.25를 곱한 점수를 준다', () => {
    const r = make();
    r.start(CENTER);
    const o = r.orbs[0];
    const c = collectAt(r, o).find((e) => e.kind === 'collect');
    if (o.kind === 'time') {
      expect(c).toBeUndefined();
      return;
    }
    expect(c?.kind === 'collect' && c.points).toBe(Math.floor(BASE[o.kind] * 1.25));
    expect(c?.kind === 'collect' && c.combo).toBe(1);
    expect(r.score).toBe(Math.floor(BASE[o.kind] * 1.25));
  });

  it('연속 수집 콤보는 4초 안에 이어지고 배율이 오른다', () => {
    const r = make({ seed: 5 });
    r.start(CENTER);
    const a = r.orbs[0];
    const b = r.orbs[1];
    collectAt(r, a);
    expect(r.combo).toBe(1);

    // 1초 뒤 두 번째: 콤보 2 (배율 1.5)
    wait(r, 1, { x: a.x, y: a.y, z: a.z }); // 시간만 흐름(수집 없음)
    const eb = collectAt(r, b).find((e) => e.kind === 'collect' || e.kind === 'time');
    expect(r.combo).toBe(2);
    if (eb?.kind === 'collect') {
      expect(eb.combo).toBe(2);
      expect(eb.points).toBe(Math.floor(BASE[b.kind] * 1.5));
    }
  });

  it('4초가 지나면 콤보가 끊기고 다음 수집은 1부터 다시 센다', () => {
    const r = make({ seed: 5 });
    r.start(CENTER);
    const a = r.orbs[0];
    collectAt(r, a);
    expect(r.combo).toBe(1);
    wait(r, 4.1);
    expect(r.combo).toBe(0);
    const b = r.orbs[0];
    collectAt(r, b);
    expect(r.combo).toBe(1);
  });

  it('정확히 4초 뒤에는 콤보가 끊긴다', () => {
    const r = make({ seed: 5 });
    r.start(CENTER);
    collectAt(r, r.orbs[0]);
    wait(r, 4);
    expect(r.combo).toBe(0);
  });

  it('콤보 배율은 최대 8단계에서 멈춘다', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(1)).toBe(1.25);
    expect(comboMultiplier(2)).toBe(1.5);
    expect(comboMultiplier(8)).toBe(3);
    expect(comboMultiplier(20)).toBe(3);
  });

  it('금빛 구슬은 배율을 곱한 정수 점수를 준다', () => {
    const seed = (() => {
      for (let s = 1; s < 500; s++) {
        const r = make({ seed: s });
        r.start(CENTER);
        if (r.orbs.some((o) => o.kind === 'gold')) return s;
      }
      throw new Error('금빛 시드 없음');
    })();
    const r = make({ seed });
    r.start(CENTER);
    const g = r.orbs.find((o) => o.kind === 'gold')!;
    const ev = collectAt(r, g).find((e) => e.kind === 'collect');
    expect(ev?.kind === 'collect' && Number.isInteger(ev.points)).toBe(true);
    expect(ev?.kind === 'collect' && ev.points).toBe(Math.floor(30 * 1.25));
  });

  it('점수는 항상 정수다', () => {
    const r = make({ seed: 21 });
    r.start(CENTER);
    for (let i = 0; i < 25; i++) {
      collectAt(r, r.orbs[0]);
      expect(Number.isInteger(r.score)).toBe(true);
    }
  });
});

describe('시계 구슬', () => {
  it('시계 구슬은 3초를 더하고 점수는 주지 않는다', () => {
    const seed = seedWith('time');
    const r = make({ seed });
    r.start(CENTER);
    const t = r.orbs.find((o) => o.kind === 'time')!;
    const before = r.timeLeft;
    const ev = collectAt(r, t, 0);
    const bonus = ev.find((e) => e.kind === 'time');
    expect(bonus).toEqual({ kind: 'time', orb: t, bonus: 3 });
    expect(r.score).toBe(0);
    expect(r.timeLeft).toBeCloseTo(before + 3, 6);
  });
});

describe('이탈 처리', () => {
  it('구역 반경+12m를 넘으면 leaving 경고를 한 번만 낸다', () => {
    const r = make();
    r.start(CENTER);
    const far = { x: 51, y: 0, z: 0 };
    const first = r.step(0.016, far);
    const warn = first.filter((e) => e.kind === 'leaving');
    expect(warn).toHaveLength(1);
    expect(warn[0]).toEqual({ kind: 'leaving', dist: 51 });
    expect(r.step(0.016, { x: 52, y: 0, z: 0 }).some((e) => e.kind === 'leaving')).toBe(false);
    // 안으로 돌아오면 다시 나갈 때 한 번 더 경고한다
    r.step(0.016, ON_CENTER);
    expect(r.step(0.016, far).some((e) => e.kind === 'leaving')).toBe(true);
  });

  it('구역 반경+20m에 닿으면 포기(done, aborted)하고 기록을 남기지 않는다', () => {
    const { storage, box } = memory();
    const r = make({ storage });
    r.start(CENTER);
    collectAt(r, r.orbs[0]);
    const score = r.score;
    const ev = r.step(0.016, { x: 58, y: 0, z: 0 });
    const end = ev.find((e) => e.kind === 'end');
    expect(r.state).toBe('done');
    expect(end?.kind === 'end' && end.aborted).toBe(true);
    expect(end?.kind === 'end' && end.score).toBe(score);
    expect(end?.kind === 'end' && end.newBest).toBe(false);
    expect(box.writes).toBe(0);
    expect(r.best).toBe(0);
  });

  it('반경+20m 안쪽이면 계속 달린다', () => {
    const r = make();
    r.start(CENTER);
    r.step(0.016, { x: 57, y: 0, z: 0 });
    expect(r.state).toBe('running');
  });
});

describe('최고 기록 저장', () => {
  it('새 최고 기록이면 저장하고 newBest를 true로 낸다', () => {
    const { storage, box } = memory({ best: 5 });
    const r = make({ storage });
    expect(r.best).toBe(5);
    r.start(CENTER);
    collectAt(r, r.orbs[0]);
    const score = r.score;
    const end = wait(r, 50).find((e) => e.kind === 'end');
    expect(end?.kind === 'end' && end.newBest).toBe(score > 5);
    if (score > 5) {
      expect(box.value).toEqual({ best: score });
      expect(r.best).toBe(score);
    } else {
      expect(box.writes).toBe(0);
    }
  });

  it('같은 점수나 낮은 점수는 최고 기록을 바꾸지 않는다', () => {
    const { storage, box } = memory({ best: 9999 });
    const r = make({ storage });
    r.start(CENTER);
    const end = wait(r, 50).find((e) => e.kind === 'end');
    expect(end?.kind === 'end' && end.newBest).toBe(false);
    expect(box.writes).toBe(0);
    expect(r.best).toBe(9999);
  });

  it('저장된 값이 손상되었으면 0부터 시작한다', () => {
    const bad: unknown[] = ['oops', null, 42, { best: '100' }, { best: -3 }, { best: 1.5 }, { best: NaN }, { other: 9 }];
    for (const v of bad) {
      expect(make({ storage: memory(v).storage }).best).toBe(0);
    }
  });

  it('저장소를 읽다 throw해도 게임은 돌아간다', () => {
    const storage: OrbRushStorage = {
      get: () => { throw new Error('denied'); },
      set: () => { throw new Error('denied'); },
    };
    const r = make({ storage });
    expect(r.best).toBe(0);
    r.start(CENTER);
    expect(() => wait(r, 50)).not.toThrow();
    expect(r.state).toBe('done');
  });

  it('저장소에 쓰다 throw해도 end는 정상으로 나간다', () => {
    const storage: OrbRushStorage = {
      get: () => null,
      set: () => { throw new Error('full'); },
    };
    const r = make({ storage });
    r.start(CENTER);
    collectAt(r, r.orbs[0]);
    const end = wait(r, 50).find((e) => e.kind === 'end');
    expect(end?.kind === 'end' && end.newBest).toBe(r.score > 0);
  });

  it('기본 저장 키는 cubequest.orbrush.v1이다', () => {
    expect(STORAGE_KEY).toBe('cubequest.orbrush.v1');
  });
});

describe('활성 구슬 유지와 접근자', () => {
  it('여러 번 수집하고 이동해도 활성 구슬은 항상 6개다', () => {
    const r = make({ seed: 42 });
    r.start(CENTER);
    for (let i = 0; i < 60; i++) {
      const o = r.orbs[i % r.orbs.length];
      r.step(0.05, { x: o.x, y: o.y, z: o.z });
      expect(r.orbs).toHaveLength(6);
    }
  });

  it('center와 radius를 알려준다', () => {
    const r = make({ height: () => 3 });
    expect(r.center).toBeNull();
    expect(r.radius).toBe(38);
    r.start({ x: 4, z: -2 });
    expect(r.center).toEqual({ x: 4, y: 3, z: -2 });
  });
});
