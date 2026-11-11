import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  GHOST_DT,
  GHOST_MAX_SAMPLES,
  GHOST_STORAGE_KEY,
  GhostRecorder,
  GhostStore,
  type GhostStorage,
  type GhostTrack,
  ghostAt,
} from './ghost';

// 메모리 저장소 (DOM 없이 주입)
function memoryStorage(initial: unknown = null) {
  let value: unknown = initial;
  const storage: GhostStorage = {
    get: () => value,
    set: (v) => {
      value = JSON.parse(JSON.stringify(v));
    },
  };
  return { storage, peek: () => value };
}

const zeroTrack = (samples: number): GhostTrack => ({ dt: GHOST_DT, points: new Array(samples * 3).fill(0) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GhostRecorder 샘플링', () => {
  it('120Hz로 1초 동안 달리면 0.1초 간격 11개만 기록한다', () => {
    const rec = new GhostRecorder();
    rec.start();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      rec.sample(t, t * 10, 0, 0); // x는 시간에 비례
    }
    const track = rec.finish();
    expect(track.dt).toBe(GHOST_DT);
    expect(track.points.length).toBe(11 * 3);
    // 격자점 k는 x = k (0.1s * 10)
    for (let k = 0; k <= 10; k++) expect(track.points[k * 3]).toBeCloseTo(k, 2);
  });

  it('0.1초가 안 지나면 첫 샘플 하나만 기록한다', () => {
    const rec = new GhostRecorder();
    rec.start();
    rec.sample(0, 1, 2, 3);
    rec.sample(0.05, 1.5, 2, 3);
    rec.sample(0.09, 1.9, 2, 3);
    expect(rec.finish().points).toEqual([1, 2, 3]);
  });

  it('위치는 소수 둘째 자리로 반올림한다', () => {
    const rec = new GhostRecorder();
    rec.start();
    rec.sample(0, 1.234, -0.016, 9.876);
    expect(rec.finish().points).toEqual([1.23, -0.02, 9.88]);
  });

  it('start 전 샘플은 무시한다', () => {
    const rec = new GhostRecorder();
    rec.sample(0, 1, 1, 1);
    expect(rec.finish().points).toEqual([]);
  });

  it('최대 길이에서 멈추고 그 트랙은 저장된다', () => {
    const rec = new GhostRecorder();
    rec.start();
    for (let i = 0; i <= 6500; i++) rec.sample(i * GHOST_DT, 0, 0, 0);
    const track = rec.finish();
    expect(track.points.length / 3).toBe(GHOST_MAX_SAMPLES);
    expect(new GhostStore(memoryStorage().storage).set('c1', track)).toBe(true);
  });
});

describe('ghostAt 보간', () => {
  const track: GhostTrack = { dt: 0.1, points: [0, 0, 0, 1, 2, 3, 1, 2, 5] };
  const out = { x: 0, y: 0, z: 0 };

  it('샘플 사이를 선형 보간한다', () => {
    expect(ghostAt(track, 0.05, out)).toBe(true);
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(1.5);
  });

  it('정확히 샘플 시각이면 그 위치다', () => {
    expect(ghostAt(track, 0.1, out)).toBe(true);
    expect(out).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('끝을 넘으면 마지막 위치를 유지하고 false를 돌려준다', () => {
    expect(ghostAt(track, 0.2, out)).toBe(true);
    expect(out).toEqual({ x: 1, y: 2, z: 5 });
    expect(ghostAt(track, 5, out)).toBe(false);
    expect(out).toEqual({ x: 1, y: 2, z: 5 });
  });

  it('빈 트랙은 false다', () => {
    expect(ghostAt({ dt: 0.1, points: [] }, 0, out)).toBe(false);
  });
});

describe('GhostStore', () => {
  const track: GhostTrack = { dt: 0.1, points: [0, 0, 0, 1, 1, 1] };

  it('저장 후 같은 값을 다시 읽는다 (왕복)', () => {
    const { storage, peek } = memoryStorage();
    const store = new GhostStore(storage);
    expect(store.set('course-a', track)).toBe(true);
    expect(store.get('course-a')).toEqual(track);
    expect(store.get('course-b')).toBeNull();
    expect(peek()).toEqual({ 'course-a': track });
  });

  it('기본 저장소는 localStorage의 cubequest.ghost.v1 키를 쓴다', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    });
    const store = new GhostStore();
    expect(store.set('course-a', track)).toBe(true);
    expect(JSON.parse(mem.get(GHOST_STORAGE_KEY) ?? 'null')).toEqual({ 'course-a': track });
    expect(new GhostStore().get('course-a')).toEqual(track);
  });

  it('최대 길이(6000점)까지는 저장하고 넘으면 저장하지 않는다', () => {
    const store = new GhostStore(memoryStorage().storage);
    expect(store.set('ok', zeroTrack(GHOST_MAX_SAMPLES))).toBe(true);
    expect(store.set('too-long', zeroTrack(GHOST_MAX_SAMPLES + 1))).toBe(false);
    expect(store.get('too-long')).toBeNull();
    expect(store.get('ok')).not.toBeNull();
  });

  it('검증에 실패한 트랙은 저장하지 않는다', () => {
    const store = new GhostStore(memoryStorage().storage);
    expect(store.set('x', { dt: 0.1, points: [1, 2] })).toBe(false);
    expect(store.set('x', { dt: 0.1, points: ['a', 'b', 'c'] as unknown as number[] })).toBe(false);
    expect(store.set('x', { dt: 0.1, points: [NaN, 0, 0] })).toBe(false);
    expect(store.set('x', { dt: 0, points: [0, 0, 0] })).toBe(false);
    expect(store.get('x')).toBeNull();
  });

  it('손상된 저장 데이터는 무시하고 정상 항목만 읽는다', () => {
    const { storage } = memoryStorage({
      good: track,
      short: { dt: 0.1, points: [1, 2] },
      strings: { dt: 0.1, points: ['1', '2', '3'] },
      nullEntry: null,
      noDt: { points: [1, 2, 3] },
      proto: '__proto__',
    });
    const store = new GhostStore(storage);
    expect(store.get('good')).toEqual(track);
    expect(store.get('short')).toBeNull();
    expect(store.get('strings')).toBeNull();
    expect(store.get('nullEntry')).toBeNull();
    expect(store.get('noDt')).toBeNull();
    expect(store.get('__proto__')).toBeNull();
    expect(store.get('toString')).toBeNull();
  });

  it('저장소 자체가 깨졌거나 던지면 null을 돌려주고 예외를 내지 않는다', () => {
    expect(new GhostStore(memoryStorage('not an object').storage).get('a')).toBeNull();
    expect(new GhostStore(memoryStorage([1, 2]).storage).get('a')).toBeNull();
    const throwing: GhostStorage = {
      get: () => {
        throw new Error('boom');
      },
      set: () => {
        throw new Error('quota');
      },
    };
    const store = new GhostStore(throwing);
    expect(store.get('a')).toBeNull();
    expect(store.set('a', track)).toBe(false);
  });
});
