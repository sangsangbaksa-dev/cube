import { describe, it, expect } from 'vitest';
import { Wisps, SPECIES, COIN, WISP_KEY, CATCH_R, MAX_ACTIVE, sanitizeCounts, type WispEvent, type WispSave, type WispStorage } from './wisps';
import { mulberry32 } from '../util/rand';

const flat = () => 0;
const far = { x: 1000, y: 0, z: 1000 };

/** 메모리 저장소. 저장된 값을 열어볼 수 있다 */
function memory(initial: unknown = null) {
  const box = { value: initial as WispSave | null, writes: [] as WispSave[] };
  const storage: WispStorage = {
    get: () => box.value,
    set: (v) => { box.writes.push(v); box.value = v; },
  };
  return { storage, box };
}

/** 첫 스폰을 만든다 (dt 0이면 보충 타이머가 바로 0이 되어 하나 나온다) */
function spawnOne(w: Wisps, player = far) {
  const ev = w.step(0, player, 0);
  const sp = ev.find((e) => e.kind === 'spawn');
  if (!sp) throw new Error('스폰 없음');
  return w.active.find((a) => a.id === sp.wisp.id)!;
}

describe('종 목록', () => {
  it('12종, id 중복 없음, 희귀도는 흔함/희귀/전설 각 4종', () => {
    expect(SPECIES.length).toBe(12);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(12);
    const count = (r: string) => SPECIES.filter((s) => s.rarity === r).length;
    expect([count('common'), count('rare'), count('epic')]).toEqual([4, 4, 4]);
  });
});

describe('스폰', () => {
  it('낮에는 day/any, 밤에는 night/any 정령만 나온다', () => {
    const check = (night: number, allowed: string[]) => {
      const w = new Wisps({ height: flat, rand: mulberry32(7) });
      const seen: string[] = [];
      for (let t = 0; t < 1200; t += 0.5) {
        for (const e of w.step(0.5, { x: 0, y: 0, z: 0 }, night)) {
          if (e.kind === 'spawn') seen.push(e.wisp.species.habitat);
        }
      }
      expect(seen.length).toBeGreaterThan(20);
      for (const h of seen) expect(allowed).toContain(h);
    };
    check(0, ['day', 'any']);
    check(1, ['night', 'any']);
  });

  it('동시에 최대 3마리, 시간이 지나면 3마리까지 찬다', () => {
    const w = new Wisps({ height: flat, rand: mulberry32(3) });
    let max = 0;
    for (let t = 0; t < 90; t += 0.5) {
      w.step(0.5, { x: 0, y: 0, z: 0 }, 0);
      max = Math.max(max, w.active.length);
      expect(w.active.length).toBeLessThanOrEqual(MAX_ACTIVE);
    }
    expect(max).toBe(MAX_ACTIVE);
  });

  it('플레이어 주변 18~35m 링에 생성되고, 보충은 6~12초 간격', () => {
    const w = new Wisps({ height: flat, rand: mulberry32(11) });
    const p = { x: 5, y: 0, z: -3 };
    const first = w.step(0, p, 0);
    expect(first.filter((e) => e.kind === 'spawn').length).toBe(1);
    const sp = first[0] as Extract<WispEvent, { kind: 'spawn' }>;
    const r = Math.hypot(sp.wisp.x - p.x, sp.wisp.z - p.z);
    expect(r).toBeGreaterThanOrEqual(18);
    expect(r).toBeLessThanOrEqual(35);

    let elapsed = 0;
    let second: number | null = null;
    while (second === null && elapsed < 30) {
      elapsed += 0.1;
      const ev = w.step(0.1, p, 0);
      if (ev.some((e) => e.kind === 'spawn')) second = elapsed;
    }
    expect(second).not.toBeNull();
    expect(second!).toBeGreaterThanOrEqual(5.9);
    expect(second!).toBeLessThanOrEqual(12.2);
  });

  it('정령은 지면 위 1.2m를 떠다닌다', () => {
    const w = new Wisps({ height: (x) => x * 0.1, rand: mulberry32(5) });
    const a = spawnOne(w);
    expect(a.y).toBeCloseTo(a.x * 0.1 + 1.2, 6);
    w.step(3, far, 0);
    const b = w.active.find((x) => x.id === a.id)!;
    expect(b.y).toBeCloseTo(b.x * 0.1 + 1.2, 6);
  });
});

describe('도망과 포획', () => {
  it('6m 안으로 오면 놀라서 반대 방향으로 4m/s 도망간다', () => {
    const w = new Wisps({ height: flat, rand: mulberry32(9) });
    const a = spawnOne(w);
    // 플레이어를 정령 바로 옆 4m (포획 거리 밖, 놀람 거리 안)
    const p = { x: a.x - 4, y: a.y, z: a.z };
    w.step(0.1, p, 0);
    const f = w.active.find((x) => x.id === a.id)!;
    expect(f.fleeing).toBe(true);
    const d0 = Math.hypot(f.x - p.x, f.z - p.z);
    w.step(1, p, 0);
    const g = w.active.find((x) => x.id === a.id)!;
    const d1 = Math.hypot(g.x - p.x, g.z - p.z);
    expect(d1 - d0).toBeCloseTo(4, 3);
  });

  it('2.2m 안이면 포획, 점프 중에도 3D 거리로 잡힌다', () => {
    const w = new Wisps({ height: flat, rand: mulberry32(2), storage: memory().storage });
    const a = spawnOne(w);
    const ev = w.step(0.1, { x: a.x, y: a.y + CATCH_R - 0.2, z: a.z }, 0);
    const c = ev.find((e) => e.kind === 'catch') as Extract<WispEvent, { kind: 'catch' }>;
    expect(c).toBeDefined();
    expect(c.wisp.id).toBe(a.id);
    expect(c.firstTime).toBe(true);
    expect(c.coins).toBe(COIN[a.species.rarity] * 3);
    expect(w.caught(a.species.id)).toBe(1);
  });

  it('포획은 1회: 잡힌 정령은 목록에서 빠지고 다시 잡히지 않는다', () => {
    const w = new Wisps({ height: flat, rand: mulberry32(4), storage: memory().storage });
    const a = spawnOne(w);
    const p = { x: a.x + 1, y: a.y, z: a.z };
    const first = w.step(0.1, p, 0);
    expect(first.filter((e) => e.kind === 'catch').length).toBe(1);
    expect(w.active.find((x) => x.id === a.id)).toBeUndefined();
    const again = w.step(0.1, p, 0);
    expect(again.filter((e) => e.kind === 'catch' && e.wisp.id === a.id).length).toBe(0);
    expect(w.caught(a.species.id)).toBe(1);
  });

  it('이미 잡은 종은 보너스 없이 기본 코인', () => {
    const all: Record<string, number> = {};
    for (const s of SPECIES) all[s.id] = 1;
    const w = new Wisps({ height: flat, rand: mulberry32(6), storage: memory({ counts: all }).storage });
    const a = spawnOne(w);
    const ev = w.step(0.1, { x: a.x + 0.5, y: a.y, z: a.z }, 0);
    const c = ev.find((e) => e.kind === 'catch') as Extract<WispEvent, { kind: 'catch' }>;
    expect(c.firstTime).toBe(false);
    expect(c.coins).toBe(COIN[a.species.rarity]);
    expect(w.caught(a.species.id)).toBe(2);
  });
});

describe('소멸', () => {
  it('40초가 지나면 사라진다', () => {
    const w = new Wisps({ height: flat, rand: mulberry32(8) });
    const a = spawnOne(w);
    const ev = w.step(40, far, 0);
    expect(ev.some((e) => e.kind === 'vanish' && e.wisp.id === a.id)).toBe(true);
    expect(w.active.find((x) => x.id === a.id)).toBeUndefined();
  });

  it('놀라서 멀리 달아나 40m 밖으로 나가면 사라진다', () => {
    const w = new Wisps({ height: flat, rand: mulberry32(10) });
    const a = spawnOne(w);
    const p = { x: a.x - 4, y: a.y, z: a.z };
    w.step(0.1, p, 0);
    const ev = w.step(10, p, 0);
    expect(ev.some((e) => e.kind === 'vanish' && e.wisp.id === a.id)).toBe(true);
  });
});

describe('저장', () => {
  it('잡은 기록이 저장되고, 새로 열면 복원된다', () => {
    const m = memory();
    const w = new Wisps({ height: flat, rand: mulberry32(1), storage: m.storage });
    const a = spawnOne(w);
    w.step(0.1, { x: a.x + 1, y: a.y, z: a.z }, 0);
    expect(m.box.value).toEqual({ counts: { [a.species.id]: 1 } });

    const w2 = new Wisps({ height: flat, storage: m.storage });
    expect(w2.caught(a.species.id)).toBe(1);
    expect(w2.discovered).toBe(1);
    expect(w2.total).toBe(12);
  });

  it('손상된 저장값은 알려진 id의 양의 정수만 남긴다', () => {
    const bad = { counts: { dew: 2, glow: -1, dusk: 1.5, moss: '3', wind: 0, nope: 4, rainbow: true } };
    const w = new Wisps({ height: flat, storage: memory(bad).storage });
    expect(w.caught('dew')).toBe(2);
    expect(w.caught('glow')).toBe(0);
    expect(w.caught('dusk')).toBe(0);
    expect(w.caught('nope')).toBe(0);
    expect(w.discovered).toBe(1);
    expect(sanitizeCounts('garbage')).toEqual({});
    expect(sanitizeCounts([1, 2])).toEqual({});
    expect(sanitizeCounts(null)).toEqual({});
  });

  it('저장소가 실패해도 게임은 돌아간다', () => {
    const broken: WispStorage = {
      get: () => { throw new Error('denied'); },
      set: () => { throw new Error('full'); },
    };
    const w = new Wisps({ height: flat, rand: mulberry32(12), storage: broken });
    const a = spawnOne(w);
    const ev = w.step(0.1, { x: a.x + 1, y: a.y, z: a.z }, 0);
    expect(ev.some((e) => e.kind === 'catch')).toBe(true);
    expect(w.caught(a.species.id)).toBe(1);
  });

  it('기본 저장 키는 cubequest.wisps.v1', () => {
    expect(WISP_KEY).toBe('cubequest.wisps.v1');
  });
});
