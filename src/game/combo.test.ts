import { describe, it, expect } from 'vitest';
import { Combo, multiplierFor, GROUND_LIMIT, PLATFORM_GRACE, type ComboSave, type ComboStorage } from './combo';
import type { GameEvent } from './events';

// 아래 dt 값들은 이진수로 정확히 표현되어, 0.9/1.2 경계 비교가 흔들리지 않는다
const tick = (dt: number, grounded: boolean, y = 0): GameEvent => ({ type: 'tick', dt, moved: 0, grounded, y, night: 0 });
const landGround: GameEvent = { type: 'land', impact: 1, onPlatform: false };
const landPlatform: GameEvent = { type: 'land', impact: 1, onPlatform: true };
const jump: GameEvent = { type: 'jump' };
const dash: GameEvent = { type: 'dash' };
const respawn: GameEvent = { type: 'respawn' };

/** 메모리 저장소. 저장된 값을 열어볼 수 있다 */
function memory(initial: unknown = null) {
  const box = { value: initial as unknown, writes: [] as ComboSave[] };
  const storage: ComboStorage = {
    get: () => box.value,
    set: (v) => { box.writes.push(v); box.value = v; },
  };
  return { storage, box };
}

describe('점수와 배율', () => {
  it('기술 점수: jump 10, dash 25, launch 30, slam 40~80, 발판 착지 15 (배율 적용)', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    expect(c.score).toBe(10); // chain 1
    c.handle(dash);
    expect(c.score).toBe(35); // chain 2, 배율 1
    c.handle({ type: 'launch' });
    expect(c.score).toBe(97); // base 65 * 1.5 (chain 3)
    c.handle({ type: 'slam', power: 0 });
    expect(c.score).toBe(157); // base 105 * 1.5
    c.handle(landPlatform);
    expect(c.score).toBe(180); // base 120 * 1.5
    expect(c.chain).toBe(5);
  });

  it('slam 점수는 power 0~1로 40~80, 범위 밖 값은 잘라 쓴다', () => {
    const score = (power: number) => {
      const c = new Combo(memory().storage);
      c.handle({ type: 'slam', power });
      return c.score;
    };
    expect(score(0.5)).toBe(60);
    expect(score(1)).toBe(80);
    expect(score(3)).toBe(80);
    expect(score(-2)).toBe(40);
    expect(score(Number.NaN)).toBe(40);
  });

  it('배율 = 1 + floor(chain/3)*0.5, 최대 4', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(2)).toBe(1);
    expect(multiplierFor(3)).toBe(1.5);
    expect(multiplierFor(5)).toBe(1.5);
    expect(multiplierFor(6)).toBe(2);
    expect(multiplierFor(12)).toBe(3);
    expect(multiplierFor(18)).toBe(4);
    expect(multiplierFor(40)).toBe(4);
  });

  it('점수는 기본점수 합 * 배율을 내림한 정수', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(jump);
    c.handle(dash); // 기본 45, chain 3, 배율 1.5 -> 67.5
    expect(c.chain).toBe(3);
    expect(c.score).toBe(67);
    expect(Number.isInteger(c.score)).toBe(true);
  });

  it('등급은 3/6/10/15/22 체인에서 바뀐다', () => {
    const c = new Combo(memory().storage);
    const tiers: [number, string][] = [[3, '좋아요'], [6, '멋져요'], [10, '황홀해요'], [15, '별빛 같아요'], [22, '전설의 큐브']];
    for (let i = 1; i <= 22; i++) {
      c.handle(jump);
      const want = tiers.filter(([n]) => n <= i).pop()?.[1] ?? null;
      expect(c.tier).toBe(want);
    }
  });
});

describe('grow 이벤트', () => {
  it('체인 1은 알리지 않고, 2부터 grow', () => {
    const c = new Combo(memory().storage);
    expect(c.handle(jump)).toBeNull();
    expect(c.handle(dash)).toEqual({ kind: 'grow', chain: 2, score: 35, tier: null, tierUp: false });
  });

  it('등급이 오르는 순간에만 tierUp', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(jump); // chain 2
    expect(c.handle(jump)).toMatchObject({ kind: 'grow', chain: 3, tier: '좋아요', tierUp: true });
    expect(c.handle(jump)).toMatchObject({ chain: 4, tierUp: false });
    expect(c.handle(jump)).toMatchObject({ chain: 5, tierUp: false });
    expect(c.handle(jump)).toMatchObject({ chain: 6, tier: '멋져요', tierUp: true });
  });

  it('관련 없는 이벤트는 무시', () => {
    const c = new Combo(memory().storage);
    expect(c.handle({ type: 'dust', collected: 1, total: 9 })).toBeNull();
    expect(c.handle({ type: 'checkpoint' })).toBeNull();
    expect(c.handle({ type: 'victory' })).toBeNull();
    expect(c.handle(tick(0.5, false, 4))).toBeNull();
    expect(c.chain).toBe(0);
  });

  it('땅 착지(onPlatform=false)는 점수도 체인도 올리지 않는다', () => {
    const c = new Combo(memory().storage);
    expect(c.handle(landGround)).toBeNull();
    expect(c.chain).toBe(0);
    expect(c.score).toBe(0);
  });
});

describe('땅 위 종료 (0.9초)', () => {
  it('땅에 0.9초 이상 머물면 end', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(landGround);
    expect(c.handle(tick(0.5, true))).toBeNull();
    expect(c.handle(tick(0.375, true))).toBeNull(); // 0.875초
    expect(c.chain).toBe(2);
    expect(c.handle(tick(0.0625, true))).toEqual({ kind: 'end', chain: 2, score: 35, tier: null, newBest: true, coins: 0 });
    expect(c.chain).toBe(0);
    expect(c.score).toBe(0);
  });

  it(`땅에 내려앉은 뒤 ${GROUND_LIMIT}초 안에 다시 뛰면 콤보는 끝나고 새로 시작한다`, () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(landGround);
    c.handle(tick(0.5, true));
    c.handle(tick(0.375, true));
    expect(c.handle(jump)).toMatchObject({ kind: 'end', chain: 2 });
    expect(c.chain).toBe(1);
  });

  it('공중에 뜬 tick은 땅 타이머를 0으로 되돌린다', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(landGround);
    c.handle(tick(0.5, true));
    c.handle(tick(0.1, false, 3));
    expect(c.handle(tick(0.5, true))).toBeNull(); // 리셋되지 않았다면 여기서 끝났을 것
    expect(c.handle(tick(0.375, true))).toBeNull();
    expect(c.handle(tick(0.0625, true))).toMatchObject({ kind: 'end', chain: 2 });
  });

  it('체인이 1이면 땅에 있어도 알리지 않고 조용히 초기화', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(landGround);
    expect(c.handle(tick(1, true))).toBeNull();
    expect(c.chain).toBe(0);
  });

  it('체인이 없을 때 땅 tick은 아무 일도 없음', () => {
    const c = new Combo(memory().storage);
    expect(c.handle(tick(5, true))).toBeNull();
    expect(c.chain).toBe(0);
  });

  it('착지 없이 땅에 닿은 tick도 일반 땅 기준(0.9초)을 쓴다', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(dash);
    expect(c.handle(tick(0.5, true))).toBeNull();
    expect(c.handle(tick(0.5, true))).toMatchObject({ kind: 'end', chain: 2 });
  });
});

describe('발판 착지 유예 (1.2초)', () => {
  it('발판 착지 후 1.2초까지는 땅 기준(0.9초)을 넘어도 유지', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(dash);
    expect(c.handle(landPlatform)).toMatchObject({ kind: 'grow', chain: 3, tier: '좋아요', tierUp: true });
    expect(c.handle(tick(0.9, true))).toBeNull();
    expect(c.handle(tick(0.25, true))).toBeNull(); // 1.15초
    expect(c.chain).toBe(3);
    expect(c.handle(tick(0.125, true))).toMatchObject({ kind: 'end', chain: 3 }); // 1.275초
  });

  it(`${PLATFORM_GRACE}초 유예 사이 다시 뛰면 이어진다`, () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(landPlatform);
    c.handle(tick(1.0, true));
    expect(c.handle(jump)).toMatchObject({ kind: 'grow', chain: 4 });
    // 다시 발판에 착지하면 유예가 새로 시작
    c.handle(landPlatform);
    expect(c.handle(tick(1.0, true))).toBeNull();
    expect(c.chain).toBe(5);
  });

  it('발판 착지 후 유예가 지나면 end', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(landPlatform);
    expect(c.handle(tick(1.125, true))).toBeNull();
    expect(c.handle(tick(0.125, true))).toMatchObject({ kind: 'end', chain: 2 });
  });

  it('발판 착지 뒤 땅으로 내려와 다시 착지하면 땅 기준(0.9초)으로 바뀐다', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(landPlatform);
    c.handle(landGround);
    expect(c.handle(tick(0.9, true))).toMatchObject({ kind: 'end' });
  });
});

describe('리스폰 (broken)', () => {
  it('체인 2 이상에서 리스폰하면 broken, 점수 초기화', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(jump);
    expect(c.handle(respawn)).toEqual({ kind: 'broken', chain: 3 });
    expect(c.chain).toBe(0);
    expect(c.score).toBe(0);
  });

  it('체인 1이거나 없으면 리스폰은 알리지 않음', () => {
    const c = new Combo(memory().storage);
    expect(c.handle(respawn)).toBeNull();
    c.handle(jump);
    expect(c.handle(respawn)).toBeNull();
    expect(c.chain).toBe(0);
  });

  it('broken 뒤에는 새 콤보가 1부터 다시 시작', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(respawn);
    expect(c.handle(jump)).toBeNull();
    expect(c.handle(dash)).toMatchObject({ kind: 'grow', chain: 2, score: 35, tierUp: false });
  });

  it('broken은 최고 기록을 바꾸지 않는다', () => {
    const { storage, box } = memory();
    const c = new Combo(storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(respawn);
    expect(c.best).toBe(0);
    expect(box.writes).toHaveLength(0);
  });

  it('땅 착지 중 리스폰하면 땅 타이머도 사라짐', () => {
    const c = new Combo(memory().storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(landGround);
    c.handle(tick(0.5, true));
    c.handle(respawn);
    c.handle(jump);
    c.handle(dash);
    expect(c.handle(tick(0.5, true))).toBeNull();
    expect(c.chain).toBe(2);
  });
});

describe('end 이벤트와 최고 기록', () => {
  it('coins는 점수/100 내림', () => {
    const c = new Combo(memory().storage);
    for (let i = 0; i < 6; i++) c.handle(jump); // base 60, chain 6 -> 배율 2 -> 120
    c.handle(dash); // base 85, chain 7 -> 배율 2 -> 170
    expect(c.score).toBe(170);
    c.handle(landGround);
    expect(c.handle(tick(0.9, true))).toMatchObject({ kind: 'end', chain: 7, score: 170, tier: '멋져요', coins: 1 });  });

  it('더 높은 점수로 끝나면 newBest true 이고 저장', () => {
    const { storage, box } = memory();
    const c = new Combo(storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(landGround);
    expect(c.handle(tick(0.9, true))).toMatchObject({ kind: 'end', score: 35, newBest: true });
    expect(c.best).toBe(35);
    expect(box.writes).toEqual([{ best: 35 }]);
  });

  it('최고 기록보다 낮으면 newBest false, 최고 기록은 그대로', () => {
    const { storage, box } = memory();
    const c = new Combo(storage);
    c.handle(jump);
    c.handle(dash);
    c.handle(dash); // base 60, chain 3 -> 90
    c.handle(landGround);
    c.handle(tick(0.9, true));
    expect(c.best).toBe(90);
    c.handle(jump);
    c.handle(dash); // base 35, chain 2 -> 35
    c.handle(landGround);
    expect(c.handle(tick(0.9, true))).toMatchObject({ kind: 'end', score: 35, newBest: false });
    expect(c.best).toBe(90);
    expect(box.writes).toEqual([{ best: 90 }]);
  });

  it('최고 기록은 다음 Combo 인스턴스에서도 불러온다', () => {
    const { storage } = memory({ best: 300 });
    const c = new Combo(storage);
    expect(c.best).toBe(300);
    c.handle(jump);
    c.handle(dash);
    c.handle(landGround);
    expect(c.handle(tick(0.9, true))).toMatchObject({ kind: 'end', score: 35, newBest: false });
    expect(c.best).toBe(300);
  });

  it('잘못된 저장값은 무시', () => {
    const bad: unknown[] = [null, 'x', 5, { best: '9' }, { best: -4 }, { best: 1.5 }, { best: Number.NaN }, { best: Infinity }, {}];
    for (const v of bad) expect(new Combo(memory(v).storage).best).toBe(0);
  });

  it('저장소가 던져도 게임은 계속 돈다', () => {
    const storage: ComboStorage = {
      get: () => { throw new Error('denied'); },
      set: () => { throw new Error('quota'); },
    };
    const c = new Combo(storage);
    expect(c.best).toBe(0);
    c.handle(jump);
    c.handle(dash);
    c.handle(landGround);
    expect(c.handle(tick(0.9, true))).toMatchObject({ kind: 'end', newBest: true, score: 35 });
    expect(c.best).toBe(35);
  });
});

describe('제자리 뛰기', () => {
  it('땅에서 연달아 뛰어도 콤보가 쌓이지 않는다', () => {
    const c = new Combo({ get: () => null, set: () => {} });
    let shown = 0;
    for (let i = 0; i < 20; i++) {
      if (c.handle({ type: 'jump' })) shown++;
      c.handle({ type: 'tick', dt: 1 / 60, moved: 0, grounded: false, y: 1, night: 0 });
      c.handle({ type: 'land', impact: 5, onPlatform: false });
    }
    expect(shown).toBe(0);
    expect(c.chain).toBeLessThanOrEqual(1);
  });
  it('발판 착지 뒤 점프는 콤보를 잇는다', () => {
    const c = new Combo({ get: () => null, set: () => {} });
    c.handle({ type: 'jump' });
    c.handle({ type: 'land', impact: 5, onPlatform: true });
    const ev = c.handle({ type: 'jump' });
    expect(ev?.kind).toBe('grow');
    expect(c.chain).toBe(3);
  });
});
