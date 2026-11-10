import { describe, expect, it } from 'vitest';
import { PlayerCombat, SWING_TIME } from './combat';
import { statsFor } from './progress';

describe('회전 공격', () => {
  it('판정은 짧은 시간만 켜지고 공격마다 번호가 다르다', () => {
    const c = new PlayerCombat();
    expect(c.tryAttack()).toBe(1);
    expect(c.hit).toBeNull();
    c.update(0.05);
    const id = c.hit!.id;
    expect(c.tryAttack()).toBe(0); // 휘두르는 중
    c.update(SWING_TIME);
    expect(c.hit).toBeNull();
    c.update(0.2);
    expect(c.tryAttack()).toBe(2);
    c.update(0.05);
    expect(c.hit!.id).not.toBe(id);
  });
  it('세 번째 콤보는 더 넓고 강하며 다시 1단으로 돌아간다', () => {
    const c = new PlayerCombat();
    const dmg: number[] = [];
    for (let i = 0; i < 4; i++) {
      c.tryAttack();
      c.update(0.05);
      dmg.push(c.hit!.damage);
      c.update(SWING_TIME);
      c.update(0.6);
    }
    expect(dmg[0]).toBe(1);
    expect(c.combo).toBe(1);
  });
  it('연속으로 누르면 3단 콤보가 된다', () => {
    const c = new PlayerCombat();
    const combos: number[] = [];
    for (let i = 0; i < 3; i++) {
      combos.push(c.tryAttack());
      c.update(SWING_TIME + 0.01);
      c.update(0.13);
    }
    expect(combos).toEqual([1, 2, 3]);
  });
});

describe('성장', () => {
  it('별조각에 따라 능력이 풀린다', () => {
    expect(statsFor(0)).toEqual({ maxHp: 3, airJumps: 1, dash: false, power: 0 });
    expect(statsFor(1).dash).toBe(true);
    expect(statsFor(7)).toEqual({ maxHp: 6, airJumps: 2, dash: true, power: 1 });
  });
});
