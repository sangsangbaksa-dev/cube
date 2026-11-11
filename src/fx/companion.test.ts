import { describe, it, expect } from 'vitest';
import { FollowerMotion } from './companion';

const FRAME = 1 / 60;
type V = { x: number; y: number; z: number };

const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// 바라보는 방향 (0,0,-1) 기준 목표 위치: 뒤 1.3, 오른쪽 0.7, 위 1.1 + 둥실거림
function wantAt(t: V, time: number): V {
  return { x: t.x + 0.7, y: t.y + 1.1 + Math.sin(time * 2.2) * 0.12, z: t.z + 1.3 };
}

describe('FollowerMotion', () => {
  it('목표 뒤쪽 어깨 위로 수렴한다', () => {
    const m = new FollowerMotion();
    m.step(FRAME, { x: 0, y: 0, z: 0 }, 0, -1, 0); // 첫 호출은 바로 붙는다
    const target = { x: 10, y: 0, z: -5 };
    let time = 0;
    let p = m.position;
    for (let i = 0; i < 60; i++) {
      time += FRAME;
      p = m.step(FRAME, target, 0, -1, time);
      if (i === 0) {
        // 한 프레임 만에 순간이동하지 않는다
        expect(dist(p, wantAt(target, time))).toBeGreaterThan(5);
      }
    }
    // 4초 뒤에는 수평 오차가 거의 없고, 둥실거림만큼만 차이
    for (let i = 0; i < 180; i++) {
      time += FRAME;
      p = m.step(FRAME, target, 0, -1, time);
    }
    const want = wantAt(target, time);
    expect(Math.hypot(p.x - want.x, p.z - want.z)).toBeLessThan(0.02);
    expect(Math.abs(p.y - want.y)).toBeLessThan(0.12);
  });

  it('바라보는 방향에 따라 뒤와 옆 위치가 돌아간다', () => {
    const m = new FollowerMotion();
    m.step(FRAME, { x: 0, y: 0, z: 0 }, 1, 0, 0); // 동쪽(+X)을 본다
    const p = m.step(FRAME, { x: 0, y: 0, z: 0 }, 1, 0, 0);
    // 뒤 1.3 => x=-1.3, 오른쪽(바라보는 +X 기준 -Z쪽) 0.7 => z=-0.7 (처음 스냅 직후라 거의 도달)
    expect(p.x).toBeCloseTo(-1.3, 6);
    expect(p.z).toBeCloseTo(-0.7, 6);
  });

  it('목표가 25m 이상 떨어지면 즉시 스냅한다', () => {
    const m = new FollowerMotion();
    m.step(FRAME, { x: 0, y: 0, z: 0 }, 0, -1, 0);
    const far = { x: 100, y: 0, z: 0 };
    const p = m.step(FRAME, far, 0, -1, 0);
    expect(p.x).toBeCloseTo(100.7, 6);
    expect(p.z).toBeCloseTo(1.3, 6);
    expect(m.velocity.x).toBe(0);
  });

  it('25m 미만 점프는 스냅하지 않고 천천히 따라간다', () => {
    const m = new FollowerMotion();
    m.step(FRAME, { x: 0, y: 0, z: 0 }, 0, -1, 0);
    const p = m.step(FRAME, { x: 10, y: 0, z: 0 }, 0, -1, 0);
    expect(p.x).toBeLessThan(10.7 - 5);
    expect(p.x).toBeGreaterThan(0.7);
  });

  it('dt가 커도 NaN이나 폭주가 없다', () => {
    const m = new FollowerMotion();
    m.step(FRAME, { x: 0, y: 0, z: 0 }, 0, -1, 0);
    const dts = [0.016, 3, 0.5, 10, 1e6, 0.05];
    let time = 0;
    for (let i = 0; i < 300; i++) {
      const dt = dts[i % dts.length];
      const target = { x: Math.sin(i * 0.3) * 2, y: 0, z: Math.cos(i * 0.2) * 2 };
      time += dt;
      const p = m.step(dt, target, Math.cos(i), Math.sin(i), time);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      expect(dist(p, wantAt(target, time))).toBeLessThan(10);
      const v = m.velocity;
      expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(100);
    }
  });

  it('잘못된 입력(NaN)은 무시하고 위치를 유지한다', () => {
    const m = new FollowerMotion();
    const before = m.step(FRAME, { x: 2, y: 0, z: 2 }, 0, -1, 0);
    const after = m.step(FRAME, { x: NaN, y: 0, z: 0 }, 0, -1, 0);
    expect(after).toEqual(before);
    const afterFace = m.step(FRAME, { x: 2, y: 0, z: 2 }, NaN, -1, 0);
    expect(Number.isFinite(afterFace.x)).toBe(true);
  });
});
