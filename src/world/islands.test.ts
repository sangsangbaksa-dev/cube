import { describe, expect, it } from 'vitest';
import { FALL_Y, World } from './islands';

describe('부유섬', () => {
  const w = new World();
  it('집 + 탑 4 + 균열 3 이상이 있고 모두 다리로 이어진다', () => {
    expect(w.islands.filter((i) => i.role === 'tower').length).toBe(4);
    expect(w.islands.filter((i) => i.role === 'rift').length).toBe(3);
    expect(w.bridges.length).toBe(w.islands.length - 1);
  });
  it('섬 위는 땅, 섬 사이는 허공이다', () => {
    for (const i of w.islands) expect(w.height(i.x, i.z)).toBeGreaterThan(FALL_Y);
    expect(w.height(5000, 5000)).toBeLessThan(FALL_Y);
  });
  it('다리를 따라 걸으면 끊김 없이 이어진다', () => {
    for (const b of w.bridges) {
      let prev = w.height(b.a.x, b.a.z);
      for (let t = 0; t <= 1; t += 0.01) {
        const x = b.a.x + (b.b.x - b.a.x) * t, z = b.a.z + (b.b.z - b.a.z) * t;
        const h = w.height(x, z);
        expect(h).toBeGreaterThan(FALL_Y);
        expect(Math.abs(h - prev)).toBeLessThan(2.6);
        prev = h;
      }
    }
  });
});
