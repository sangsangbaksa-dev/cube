import { describe, expect, it } from 'vitest';
import { TOWER_COUNT, World } from './terrain';

describe('오픈월드 지형', () => {
  const w = new World();
  it('집 하나와 탑 일곱 개', () => {
    expect(w.home.role).toBe('home');
    expect(w.towers.length).toBe(TOWER_COUNT);
  });
  it('광장은 평평하다', () => {
    for (const s of w.sites) for (let a = 0; a < 6.3; a += 0.7) {
      expect(Math.abs(w.height(s.x + Math.cos(a) * (s.r - 1), s.z + Math.sin(a) * (s.r - 1)) - s.y)).toBeLessThan(0.01);
    }
  });
  it('어디서나 유한한 높이고 이웃과 급격히 어긋나지 않는다', () => {
    for (let x = -340; x <= 340; x += 17) for (let z = -340; z <= 340; z += 17) {
      if (Math.hypot(x, z) > 335) continue;
      const h = w.height(x, z);
      expect(Number.isFinite(h)).toBe(true);
      expect(Math.abs(h - w.height(x + 1, z))).toBeLessThan(2.5);
    }
  });
  it('집에서 각 탑까지 직선 길이가 적당하다', () => {
    for (const t of w.towers) expect(Math.hypot(t.x, t.z)).toBeLessThan(300);
  });
});
