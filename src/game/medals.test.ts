import { describe, it, expect } from 'vitest';
import { routeLength, parTimes, medalFor, medalRank, MEDAL_INFO, type ParTimes } from './medals';
import type { PlatformSpec } from './types';

/** 중심이 (x, y - thickness/2, z)가 되도록 두께 0짜리 발판. y는 윗면 */
const plat = (x: number, y: number, z: number, thickness = 0): PlatformSpec =>
  ({ kind: 'static', x, y, z, hx: 1, hz: 1, thickness });

describe('routeLength', () => {
  it('수평 이동은 거리 그대로', () => {
    expect(routeLength([plat(0, 0, 0), plat(3, 0, 4)])).toBeCloseTo(5);
  });

  it('올라가는 구간은 상승량 1.5배를 더한다', () => {
    // 수평 3 + 상승 2*1.5 = 6
    expect(routeLength([plat(0, 0, 0), plat(3, 2, 0)])).toBeCloseTo(6);
  });

  it('내려가는 구간은 상승 가중치 없이 수평 거리만', () => {
    expect(routeLength([plat(0, 5, 0), plat(3, 0, 0)])).toBeCloseTo(3);
  });

  it('발판 중심은 윗면에서 두께 절반 아래로 본다', () => {
    // 두께 2인 발판 두 개의 윗면이 같으면 중심 높이 차는 0
    expect(routeLength([plat(0, 4, 0, 2), plat(3, 4, 0, 2)])).toBeCloseTo(3);
    // 두께 차이로 중심이 1 올라간 경우: 수평 0 + 상승 1*1.5
    expect(routeLength([plat(0, 0, 0, 0), plat(0, 2, 0, 2)])).toBeCloseTo(1.5);
  });

  it('발판이 하나 이하이면 0', () => {
    expect(routeLength([])).toBe(0);
    expect(routeLength([plat(0, 0, 0)])).toBe(0);
  });
});

describe('parTimes', () => {
  it('길이 6.2m, 발판 2개: base = 1 + 0.7 = 1.7초', () => {
    const par = parTimes([plat(0, 0, 0), plat(6.2, 0, 0)]);
    // gold 1.7, silver 1.7*1.35=2.295 → 2.3, bronze 1.7*1.8=3.06 → 3.1
    expect(par).toEqual({ gold: 1.7, silver: 2.3, bronze: 3.1 });
  });

  it('소수 첫째 자리로 반올림한다(올림 아님)', () => {
    // 수평 2.108m → 2.108/6.2 + 0.7 = 1.04 → gold 1.0 (올림이면 1.1)
    const par = parTimes([plat(0, 0, 0), plat(2.108, 0, 0)]);
    expect(par.gold).toBe(1);
  });

  it('금 < 은 < 동 순서를 지킨다', () => {
    const par = parTimes([plat(0, 0, 0), plat(10, 3, 0), plat(20, 6, 5)]);
    expect(par.gold).toBeLessThan(par.silver);
    expect(par.silver).toBeLessThan(par.bronze);
  });

  it('발판이 2개 미만이면 모두 999', () => {
    expect(parTimes([])).toEqual({ gold: 999, silver: 999, bronze: 999 });
    expect(parTimes([plat(0, 0, 0)])).toEqual({ gold: 999, silver: 999, bronze: 999 });
  });
});

describe('medalFor', () => {
  const par: ParTimes = { gold: 10, silver: 13.5, bronze: 18 };

  it('금 경계: 기준 시간 이하는 금, 그 위 0.01초는 은', () => {
    expect(medalFor(10, par)).toBe('gold');
    expect(medalFor(9.9, par)).toBe('gold');
    expect(medalFor(10.01, par)).toBe('silver');
  });

  it('은 경계', () => {
    expect(medalFor(13.5, par)).toBe('silver');
    expect(medalFor(13.51, par)).toBe('bronze');
  });

  it('동 경계: 동빛 기준 초과는 메달 없음', () => {
    expect(medalFor(18, par)).toBe('bronze');
    expect(medalFor(18.01, par)).toBeNull();
    expect(medalFor(0, par)).toBe('gold');
  });
});

describe('medalRank', () => {
  it('gold 3, silver 2, bronze 1, null 0', () => {
    expect(medalRank('gold')).toBe(3);
    expect(medalRank('silver')).toBe(2);
    expect(medalRank('bronze')).toBe(1);
    expect(medalRank(null)).toBe(0);
  });

  it('갱신 판정: 높은 등급이 낮은 등급보다 크다', () => {
    expect(medalRank('gold')).toBeGreaterThan(medalRank('silver'));
    expect(medalRank('bronze')).toBeGreaterThan(medalRank(null));
  });
});

describe('MEDAL_INFO', () => {
  it('이름과 반짝이 보상', () => {
    expect(MEDAL_INFO.gold.name).toBe('금빛 별');
    expect(MEDAL_INFO.silver.name).toBe('은빛 별');
    expect(MEDAL_INFO.bronze.name).toBe('동빛 별');
    expect([MEDAL_INFO.gold.coins, MEDAL_INFO.silver.coins, MEDAL_INFO.bronze.coins]).toEqual([30, 15, 8]);
  });
});
