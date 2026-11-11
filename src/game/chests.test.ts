import { describe, it, expect } from 'vitest';
import { World } from '../world/terrain';
import { placeChests, Chests, hintFor, rewardFor, TIER_REWARD, CHEST_KEY, type ChestSpec, type ChestStorage, type ChestSaveData } from './chests';

const world = new World();
const sites = world.sites.map((s) => ({ x: s.x, z: s.z, r: s.r }));
const height = (x: number, z: number) => world.height(x, z);

function memStorage(initial: unknown = null): ChestStorage & { data: unknown } {
  const s = {
    data: initial as unknown,
    get: () => s.data as ChestSaveData | null,
    set: (v: ChestSaveData) => { s.data = v; },
  };
  return s;
}

const spec = (id: number, x: number, z: number, y = 0, tier: ChestSpec['tier'] = 'bronze'): ChestSpec => ({ id, x, y, z, tier });

describe('placeChests', () => {
  it('같은 시드면 같은 결과, 다른 시드면 다른 결과', () => {
    const a = placeChests({ height, sites });
    const b = placeChests({ height, sites });
    expect(a).toEqual(b);
    const c = placeChests({ height, sites, seed: 1 });
    expect(c).not.toEqual(a);
  });

  it('개수는 기본 24개까지, 자리가 모자라면 있는 만큼', () => {
    expect(placeChests({ height, sites }).length).toBeLessThanOrEqual(24);
    expect(placeChests({ height, sites }).length).toBeGreaterThan(10);
    expect(placeChests({ height: () => 0, sites: [], count: 10 }).length).toBe(10);
    expect(placeChests({ height: () => 0, sites: [], count: 10, worldR: 5 }).length).toBeLessThan(10);
  });

  it('광장(site)에서 r+8 안쪽에는 상자가 없다', () => {
    for (const c of placeChests({ height, sites })) {
      for (const s of sites) expect(Math.hypot(c.x - s.x, c.z - s.z)).toBeGreaterThanOrEqual(s.r + 8);
    }
  });

  it('서로 28m 이상 떨어지고, 높이가 -2 초과이며 경사가 1.5 이하', () => {
    const list = placeChests({ height, sites });
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      expect(a.y).toBeGreaterThan(-2);
      expect(a.y).toBe(height(a.x, a.z));
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        expect(Math.abs(height(a.x + dx, a.z + dz) - a.y)).toBeLessThanOrEqual(1.5);
      }
      for (let j = i + 1; j < list.length; j++) {
        expect(Math.hypot(a.x - list[j].x, a.z - list[j].z)).toBeGreaterThanOrEqual(28);
      }
    }
  });

  it('id는 0부터 순서대로, 등급은 세 가지 중 하나', () => {
    const list = placeChests({ height: () => 0, sites: [], count: 40 });
    list.forEach((c, i) => {
      expect(c.id).toBe(i);
      expect(['bronze', 'silver', 'gold']).toContain(c.tier);
    });
  });
});

describe('rewardFor', () => {
  it('등급 범위 안이고 id로 결정된다', () => {
    for (let id = 0; id < 50; id++) {
      for (const tier of ['bronze', 'silver', 'gold'] as const) {
        const [lo, hi] = TIER_REWARD[tier];
        const r = rewardFor(id, tier);
        expect(r).toBeGreaterThanOrEqual(lo);
        expect(r).toBeLessThanOrEqual(hi);
        expect(rewardFor(id, tier)).toBe(r);
      }
    }
  });
});

describe('Chests', () => {
  it('멀거나 높이 차가 크면 열리지 않고, 가까우면 한 번만 연다', () => {
    const c = new Chests([spec(0, 10, 10, 0)], memStorage());
    expect(c.step({ x: 0, y: 0, z: 0 })).toEqual([]);
    expect(c.step({ x: 10, y: 5, z: 10 })).toEqual([]); // 높이 차 5
    const ev = c.step({ x: 10, y: 1, z: 11.5 }); // 수평 거리 1.5
    expect(ev).toHaveLength(1);
    expect(ev[0]).toEqual({ kind: 'open', spec: spec(0, 10, 10, 0), coins: rewardFor(0, 'bronze') });
    expect(c.step({ x: 10, y: 0, z: 10 })).toEqual([]);
    expect(c.openedCount).toBe(1);
    expect(c.total).toBe(1);
  });

  it('list와 nearest는 안 연 상자 기준', () => {
    const c = new Chests([spec(0, 0, 0), spec(1, 30, 0), spec(2, 0, 50)], memStorage());
    c.step({ x: 0, y: 0, z: 0 });
    expect(c.list().map((l) => l.opened)).toEqual([true, false, false]);
    const n = c.nearest({ x: 0, z: 0 });
    expect(n?.spec.id).toBe(1);
    expect(n?.dist).toBe(30);
    const all = new Chests([spec(0, 0, 0)], memStorage());
    all.step({ x: 0, y: 0, z: 0 });
    expect(all.nearest({ x: 0, z: 0 })).toBeNull();
  });

  it('열린 상태가 저장되고 다시 불러와도 유지된다', () => {
    const store = memStorage();
    const specs = [spec(0, 0, 0), spec(1, 40, 0)];
    new Chests(specs, store).step({ x: 0, y: 0, z: 0 });
    expect(store.data).toEqual({ opened: [0] });
    const again = new Chests(specs, store);
    expect(again.openedCount).toBe(1);
    expect(again.step({ x: 0, y: 0, z: 0 })).toEqual([]);
    expect(again.step({ x: 40, y: 0, z: 0 })).toHaveLength(1);
    expect(store.data).toEqual({ opened: [0, 1] });
  });

  it('손상된 저장 데이터는 무시하고, 없는 id도 버린다', () => {
    const specs = [spec(0, 0, 0), spec(1, 40, 0), spec(2, 80, 0)];
    const bad: unknown[] = [null, 'abc', 5, [], { opened: 'x' }, { opened: null }];
    for (const v of bad) {
      const c = new Chests(specs, memStorage(v));
      expect(c.openedCount).toBe(0);
    }
    const mixed = new Chests(specs, memStorage({ opened: [1.5, 'a', 999, -1, 2, 2, null, 1] }));
    expect(mixed.openedCount).toBe(2);
    expect(mixed.list().map((l) => l.opened)).toEqual([false, true, true]);
  });

  it('저장소가 던져도 게임은 돌아간다', () => {
    const throwing: ChestStorage = {
      get: () => { throw new Error('denied'); },
      set: () => { throw new Error('denied'); },
    };
    const c = new Chests([spec(0, 0, 0)], throwing);
    expect(c.step({ x: 0, y: 0, z: 0 })).toHaveLength(1);
    expect(c.openedCount).toBe(1);
  });

  it('기본 저장소(localStorage 없음)에서도 생성된다', () => {
    const c = new Chests([spec(0, 0, 0)]);
    expect(c.total).toBe(1);
    expect(CHEST_KEY).toBe('cubequest.chests.v1');
  });
});

describe('hintFor', () => {
  const origin = { x: 0, z: 0 };
  it('북은 -Z 방향', () => {
    expect(hintFor(origin, spec(0, 0, -38))).toBe('북쪽 38m');
  });
  it('방위 8개 방향', () => {
    expect(hintFor(origin, spec(0, 27, -27))).toBe('북동쪽 38m');
    expect(hintFor(origin, spec(0, 38, 0))).toBe('동쪽 38m');
    expect(hintFor(origin, spec(0, 0, 38))).toBe('남쪽 38m');
    expect(hintFor(origin, spec(0, -38, 0))).toBe('서쪽 38m');
    expect(hintFor(origin, spec(0, -27, 27))).toBe('남서쪽 38m');
  });
  it('6m 미만이면 아주 가까워요', () => {
    expect(hintFor(origin, spec(0, 3, 4))).toBe('아주 가까워요!');
    expect(hintFor(origin, spec(0, 6, 0))).toBe('동쪽 6m');
  });
});
