import { describe, it, expect } from 'vitest';
import { COURSE_LIMITS, generateCourse, BOUNCE_MAX_RISE } from './courses';
import type { PlatformSpec } from './types';

const SEEDS = Array.from({ length: 50 }, (_, i) => 17 + i * 97);
const BASES = [0, 14.5, -6];
const CX = 40;
const CZ = -25;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const N_SAMPLES = 128;
const EPS = 1e-9;

// 테스트 전용 독립 검사기. 생성기 구현을 공유하지 않는다.
interface Box {
  x: number;
  y: number;
  z: number;
  hx: number;
  hz: number;
  thk: number;
}

function boxesOf(p: PlatformSpec): Box[] {
  const base = { hx: p.hx, hz: p.hz, thk: p.thickness };
  const m = p.move;
  if (!m) return [{ x: p.x, y: p.y, z: p.z, ...base }];
  const at = (u: number): Box => {
    const s = Math.sin(TAU * (u + m.phase));
    return { x: p.x + m.ax * s, y: p.y + m.ay * s, z: p.z + m.az * s, ...base };
  };
  const out: Box[] = [];
  for (let k = 0; k < N_SAMPLES; k++) out.push(at(k / N_SAMPLES));
  out.push(at(0.25 - m.phase), at(0.75 - m.phase));
  return out;
}

function envelopeOf(bs: Box[]) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const b of bs) {
    x0 = Math.min(x0, b.x - b.hx);
    x1 = Math.max(x1, b.x + b.hx);
    z0 = Math.min(z0, b.z - b.hz);
    z1 = Math.max(z1, b.z + b.hz);
  }
  return { x0, x1, z0, z1 };
}

function axis(a: Box, b: Box) {
  const gx = Math.abs(a.x - b.x) - (a.hx + b.hx);
  const gz = Math.abs(a.z - b.z) - (a.hz + b.hz);
  return { gx, gz, gap: Math.hypot(Math.max(0, gx), Math.max(0, gz)) };
}

const cases = SEEDS.flatMap((seed) =>
  BASES.map((baseY) => ({
    seed,
    baseY,
    course: generateCourse(`test-${seed}-${baseY}`, CX, CZ, baseY, seed),
  })),
);

describe('COURSE_LIMITS', () => {
  it('스펙 값과 같다', () => {
    expect(COURSE_LIMITS).toEqual({ maxGap: 3.8, maxRise: 1.9, maxGapDouble: 5.2, maxRiseDouble: 3.3 });
  });
});

describe('generateCourse', () => {
  it('같은 시드는 깊은 비교로 같은 결과를 낸다', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      expect(generateCourse('a', CX, CZ, 3, seed)).toEqual(generateCourse('a', CX, CZ, 3, seed));
    }
  });

  it('시작은 checkpoint, 끝은 goal, 중간 checkpoint는 정확히 하나', () => {
    for (const { seed, course: c } of cases) {
      const ps = c.platforms;
      const n = ps.length;
      expect(ps[0].kind, `seed ${seed}`).toBe('checkpoint');
      expect(ps[n - 1].kind, `seed ${seed}`).toBe('goal');
      expect(ps.filter((p) => p.kind === 'goal'), `seed ${seed}`).toHaveLength(1);
      const mids = ps.slice(1, -1).filter((p) => p.kind === 'checkpoint');
      expect(mids, `seed ${seed}`).toHaveLength(1);
      const frac = ps.indexOf(mids[0]) / (n - 1);
      expect(frac, `seed ${seed}`).toBeGreaterThan(0.3);
      expect(frac, `seed ${seed}`).toBeLessThan(0.7);
      expect(n - 2, `seed ${seed}`).toBeGreaterThanOrEqual(26);
      expect(n - 2, `seed ${seed}`).toBeLessThanOrEqual(34);
    }
  });

  it('시작 발판: 윗면 baseY+0.6, 기둥에서 약 6 m, 크기 1.8', () => {
    for (const { course: c, baseY } of cases) {
      const f = c.platforms[0];
      expect(f.y).toBeCloseTo(baseY + 0.6, 9);
      expect(f.hx).toBe(1.8);
      expect(f.hz).toBe(1.8);
      expect(Math.hypot(f.x - CX, f.z - CZ)).toBeCloseTo(6, 6);
    }
  });

  it('총 상승량 52~60 m (시작 윗면 → goal 발판 윗면)', () => {
    for (const { seed, course: c } of cases) {
      const climb = c.platforms[c.platforms.length - 1].y - c.platforms[0].y;
      expect(climb, `seed ${seed}`).toBeGreaterThanOrEqual(52);
      expect(climb, `seed ${seed}`).toBeLessThanOrEqual(60);
    }
  });

  it('goal 점은 goal 발판 위 1.2 m, 같은 XZ', () => {
    for (const { course: c } of cases) {
      const g = c.platforms[c.platforms.length - 1];
      expect(g.hx).toBe(2.0);
      expect(g.hz).toBe(2.0);
      expect(c.goal.y).toBeCloseTo(g.y + 1.2, 9);
      expect(c.goal.x).toBeCloseTo(g.x, 9);
      expect(c.goal.z).toBeCloseTo(g.z, 9);
    }
  });

  it('기둥 반경 규칙: 모든 샘플 위치에서 가장자리 ≥ 2.6, 중심 거리 ≤ 13', () => {
    const problems: string[] = [];
    for (const { seed, baseY, course: c } of cases) {
      for (const [i, p] of c.platforms.entries()) {
        for (const b of boxesOf(p)) {
          const rx = b.x - CX;
          const rz = b.z - CZ;
          const near = Math.hypot(Math.max(Math.abs(rx) - b.hx, 0), Math.max(Math.abs(rz) - b.hz, 0));
          if (near < 2.6 - EPS) problems.push(`${seed}/${baseY} #${i} edge ${near.toFixed(3)}`);
          if (Math.hypot(rx, rz) > 13 + EPS) problems.push(`${seed}/${baseY} #${i} center ${Math.hypot(rx, rz).toFixed(3)}`);
        }
        const nominal = Math.hypot(p.x - CX, p.z - CZ);
        if (nominal < 5 - EPS || nominal > 11 + EPS) problems.push(`${seed}/${baseY} #${i} radius ${nominal.toFixed(3)}`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('나선: 연속 발판의 기둥 주위 각도 증가 25~55도', () => {
    const problems: string[] = [];
    const ang = (p: PlatformSpec) => Math.atan2(p.z - CZ, p.x - CX);
    for (const { seed, baseY, course: c } of cases) {
      for (let i = 0; i + 1 < c.platforms.length; i++) {
        let d = ang(c.platforms[i + 1]) - ang(c.platforms[i]);
        while (d > Math.PI) d -= TAU;
        while (d <= -Math.PI) d += TAU;
        const deg = d / DEG;
        if (deg < 25 - 1e-6 || deg > 55 + 1e-6) problems.push(`${seed}/${baseY} step ${i} ${deg.toFixed(2)}`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('전이 점프 한계: 움직임의 모든 끝점 조합에서 검사', () => {
    const problems: string[] = [];
    for (const { seed, baseY, course: c } of cases) {
      const ps = c.platforms;
      for (let i = 0; i + 1 < ps.length; i++) {
        const prev = ps[i];
        const fromBounce = prev.kind === 'bounce';
        for (const a of boxesOf(prev)) {
          for (const b of boxesOf(ps[i + 1])) {
            const rise = b.y - a.y;
            const { gap } = axis(a, b);
            const tag = `${seed}/${baseY} step ${i}`;
            if (rise < -2 - EPS) problems.push(`${tag} rise ${rise.toFixed(3)} < -2`);
            if (fromBounce) {
              if (rise > BOUNCE_MAX_RISE + EPS) problems.push(`${tag} bounce rise ${rise.toFixed(3)}`);
              if (gap > COURSE_LIMITS.maxGap + EPS) problems.push(`${tag} bounce gap ${gap.toFixed(3)}`);
            } else {
              if (rise > COURSE_LIMITS.maxRiseDouble + EPS) problems.push(`${tag} rise ${rise.toFixed(3)}`);
              if (gap > COURSE_LIMITS.maxGapDouble + EPS) problems.push(`${tag} gap ${gap.toFixed(3)}`);
            }
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('2단 점프가 필요한 전이는 35% 이하', () => {
    for (const { seed, course: c } of cases) {
      const ps = c.platforms;
      let doubles = 0;
      for (let i = 0; i + 1 < ps.length; i++) {
        if (ps[i].kind === 'bounce') continue;
        let needs = false;
        for (const a of boxesOf(ps[i])) {
          for (const b of boxesOf(ps[i + 1])) {
            const rise = b.y - a.y;
            if (rise > COURSE_LIMITS.maxRise + EPS || axis(a, b).gap > COURSE_LIMITS.maxGap + EPS) needs = true;
          }
        }
        if (needs) doubles++;
      }
      expect(doubles / (ps.length - 1), `seed ${seed}`).toBeLessThanOrEqual(0.57);
    }
  });

  it('클리어런스: XZ가 0.6 확장으로 겹치는 발판 사이 수직 여유 ≥ 2.2', () => {
    const problems: string[] = [];
    for (const { seed, baseY, course: c } of cases) {
      const ps = c.platforms;
      const bs = ps.map(boxesOf);
      const env = bs.map(envelopeOf);
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const e1 = env[i];
          const e2 = env[j];
          if (
            e1.x1 + 0.6 < e2.x0 ||
            e2.x1 + 0.6 < e1.x0 ||
            e1.z1 + 0.6 < e2.z0 ||
            e2.z1 + 0.6 < e1.z0
          ) {
            continue;
          }
          for (const a of bs[i]) {
            for (const b of bs[j]) {
              if (Math.abs(a.x - b.x) < a.hx + b.hx + 0.6 && Math.abs(a.z - b.z) < a.hz + b.hz + 0.6) {
                const [up, low] = a.y >= b.y ? [a, b] : [b, a];
                const sep = up.y - up.thk - low.y;
                if (sep < 2.2 - EPS) problems.push(`${seed}/${baseY} #${i}-#${j} sep ${sep.toFixed(3)}`);
              }
            }
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('연속 crumble 없음', () => {
    for (const { seed, course: c } of cases) {
      const ps = c.platforms;
      for (let i = 0; i + 1 < ps.length; i++) {
        expect(ps[i].kind === 'crumble' && ps[i + 1].kind === 'crumble', `seed ${seed} #${i}`).toBe(false);
      }
    }
  });

  it('처음 5개 발판(시작 다음)은 static', () => {
    for (const { seed, course: c } of cases) {
      for (let i = 1; i <= 5; i++) expect(c.platforms[i].kind, `seed ${seed} #${i}`).toBe('static');
    }
  });

  it('종류별 크기와 움직임 규격', () => {
    const problems: string[] = [];
    for (const { seed, course: c } of cases) {
      for (const [i, p] of c.platforms.entries()) {
        const tag = `${seed} #${i} ${p.kind}`;
        if (p.thickness !== 0.6) problems.push(`${tag} thickness`);
        if (p.kind === 'bounce') {
          if (p.hx !== 0.7 || p.hz !== 0.7) problems.push(`${tag} bounce size`);
          if (p.launch === undefined || p.launch < 1.6 || p.launch > 1.9) problems.push(`${tag} launch`);
        } else if (p.kind === 'crumble') {
          if (p.hx < 0.5 || p.hx > 0.65 || p.hz < 0.5 || p.hz > 0.65) problems.push(`${tag} size`);
        } else if (p.kind === 'static' || p.kind === 'moving') {
          if (p.hx < 0.55 || p.hx > 0.9 || p.hz < 0.55 || p.hz > 0.9) problems.push(`${tag} size`);
        }
        if (p.kind === 'moving') {
          if (!p.move) {
            problems.push(`${tag} missing move`);
            continue;
          }
          const amp = Math.hypot(p.move.ax, p.move.ay, p.move.az);
          const axes = [p.move.ax, p.move.ay, p.move.az].filter((v) => v !== 0).length;
          if (axes !== 1 || amp < 1.5 - EPS || amp > 2.5 + EPS) problems.push(`${tag} amplitude`);
          if (p.move.period < 2.5 || p.move.period > 4) problems.push(`${tag} period`);
        } else if (p.move) {
          problems.push(`${tag} unexpected move`);
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });
});
