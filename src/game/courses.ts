// 별의 탑: 중앙 기둥 둘레를 나선으로 오르는 파쿠르 코스 생성기.
// 순수 TypeScript (three.js / DOM 없음). 같은 시드는 항상 같은 코스를 만든다.
import { mulberry32 } from '../util/rand';
import type { CourseSpec, PlatformKind, PlatformSpec } from './types';

/** 점프 한계. 일반 점프 2.4 m, 2단 점프로 약 +1.9 m 추가. */
export const COURSE_LIMITS: {
  maxGap: number;
  maxRise: number;
  maxGapDouble: number;
  maxRiseDouble: number;
} = { maxGap: 3.8, maxRise: 1.9, maxGapDouble: 5.2, maxRiseDouble: 3.3 };

/** 튕김 발판 다음 발판까지 허용되는 상승량 (launch 1.6~1.9 → 약 6~8.6 m 솟구침) */
export const BOUNCE_MAX_RISE = 5.5;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const CENTER_CLEAR = 2.6; // 기둥 중심 → 발판 가장자리 최소 거리
const CENTER_MAX = 13; // 기둥 중심 → 발판 중심 최대 거리
const MIN_RISE = -2;
const CLEARANCE = 2.2; // 겹치는 발판 사이 수직 여유 (큐브 높이 1 + 여유)
const OVERLAP_MARGIN = 0.9; // 스펙 0.6 + 샘플링 오차 여유 0.3
const THICKNESS = 0.6;
const TOP_OFFSET = 0.6; // 시작 발판 윗면 = baseY + 0.6
const START_R = 6;
const GOAL_LIFT = 1.2;
const CLIMB_MIN = 52;
const CLIMB_MAX = 60;
const DOUBLE_SHARE = 0; // 더블점프 없음: 한 번 점프로 닿는 전이만 허용
const SAMPLES = 64; // 움직이는 발판의 위상 샘플 수 (끝점 2개는 별도 추가)
const CANDIDATES = 80; // 한 단계에서 후보를 바꿔 가며 시도하는 횟수
const RESTARTS = 300; // 실패 시 처음부터 다시 만드는 횟수 (같은 RNG 흐름이라 결정적)

interface Box {
  x: number;
  y: number;
  z: number;
  hx: number;
  hz: number;
  thk: number;
}

interface Built {
  /** x,z는 기둥 기준 상대 좌표, y는 절대 높이 (중심 기준 명목값) */
  spec: PlatformSpec;
  /** 움직임의 모든 샘플 위치 */
  boxes: Box[];
  /** 모든 샘플을 감싸는 XZ 범위 */
  ex0: number;
  ex1: number;
  ez0: number;
  ez1: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 움직이는 발판은 진폭 끝점(sin=±1)을 반드시 포함하도록 위상을 샘플링한다. */
function samplesOf(p: PlatformSpec): Box[] {
  const { hx, hz } = p;
  const thk = p.thickness;
  const m = p.move;
  if (!m) return [{ x: p.x, y: p.y, z: p.z, hx, hz, thk }];
  const at = (u: number): Box => {
    const s = Math.sin(TAU * (u + m.phase));
    return { x: p.x + m.ax * s, y: p.y + m.ay * s, z: p.z + m.az * s, hx, hz, thk };
  };
  const out: Box[] = [];
  for (let k = 0; k < SAMPLES; k++) out.push(at(k / SAMPLES));
  out.push(at(0.25 - m.phase), at(0.75 - m.phase));
  return out;
}

function makeBuilt(spec: PlatformSpec): Built {
  const boxes = samplesOf(spec);
  let ex0 = Infinity;
  let ex1 = -Infinity;
  let ez0 = Infinity;
  let ez1 = -Infinity;
  for (const b of boxes) {
    ex0 = Math.min(ex0, b.x - b.hx);
    ex1 = Math.max(ex1, b.x + b.hx);
    ez0 = Math.min(ez0, b.z - b.hz);
    ez1 = Math.max(ez1, b.z + b.hz);
  }
  return { spec, boxes, ex0, ex1, ez0, ez1 };
}

/** XZ 축별 간격 (음수면 겹침) */
function axisGap(a: Box, b: Box): { gx: number; gz: number } {
  return {
    gx: Math.abs(a.x - b.x) - (a.hx + b.hx),
    gz: Math.abs(a.z - b.z) - (a.hz + b.hz),
  };
}

/** 두 XZ 사각형의 최단 거리 (겹치면 0) */
function edgeGap(a: Box, b: Box): number {
  const { gx, gz } = axisGap(a, b);
  return Math.hypot(Math.max(0, gx), Math.max(0, gz));
}

/** 위 발판의 밑면 - 아래 발판의 윗면 */
function verticalClearance(a: Box, b: Box): number {
  const [up, low] = a.y >= b.y ? [a, b] : [b, a];
  return up.y - up.thk - low.y;
}

function radiusOk(b: Built): boolean {
  return b.boxes.every((s) => {
    const near = Math.hypot(Math.max(Math.abs(s.x) - s.hx, 0), Math.max(Math.abs(s.z) - s.hz, 0));
    return near >= CENTER_CLEAR && Math.hypot(s.x, s.z) <= CENTER_MAX;
  });
}

/** 전이 검사. 불가능하면 ok=false, 2단 점프가 필요하면 needsDouble=true. */
function checkTransition(prev: Built, next: Built): { ok: boolean; needsDouble: boolean } {
  const fromBounce = prev.spec.kind === 'bounce';
  let needsDouble = false;
  for (const a of prev.boxes) {
    for (const b of next.boxes) {
      const rise = b.y - a.y;
      const gap = edgeGap(a, b);
      if (rise < MIN_RISE) return { ok: false, needsDouble };
      if (fromBounce) {
        if (rise > BOUNCE_MAX_RISE || gap > COURSE_LIMITS.maxGap) return { ok: false, needsDouble };
      } else {
        if (rise > COURSE_LIMITS.maxRiseDouble || gap > COURSE_LIMITS.maxGapDouble) {
          return { ok: false, needsDouble };
        }
        if (rise > COURSE_LIMITS.maxRise || gap > COURSE_LIMITS.maxGap) needsDouble = true;
      }
    }
  }
  return { ok: true, needsDouble };
}

/** 겹칠 수 있는 모든 기존 발판과 수직 여유를 검사한다. */
function clearanceOk(p: Built, others: readonly Built[]): boolean {
  for (const e of others) {
    if (
      e.ex1 + OVERLAP_MARGIN < p.ex0 ||
      p.ex1 + OVERLAP_MARGIN < e.ex0 ||
      e.ez1 + OVERLAP_MARGIN < p.ez0 ||
      p.ez1 + OVERLAP_MARGIN < e.ez0
    ) {
      continue;
    }
    for (const a of e.boxes) {
      for (const b of p.boxes) {
        const { gx, gz } = axisGap(a, b);
        if (gx < OVERLAP_MARGIN && gz < OVERLAP_MARGIN && verticalClearance(a, b) < CLEARANCE) {
          return false;
        }
      }
    }
  }
  return true;
}

function pickKind(i: number, n: number, prevKind: PlatformKind, t: number, rnd: () => number): PlatformKind {
  if (i <= 5) return 'static'; // 시작 직후 5개는 쉬운 정적 발판
  const r = rnd();
  const pBounce = i <= n - 3 && prevKind !== 'bounce' ? 0.07 : 0;
  const pMove = 0.1 + 0.25 * t;
  const pCrumble = prevKind !== 'crumble' ? 0.05 + 0.15 * t : 0;
  if (r < pBounce) return 'bounce';
  if (r < pBounce + pMove) return 'moving';
  if (r < pBounce + pMove + pCrumble) return 'crumble';
  return 'static';
}

function sizeFor(kind: PlatformKind, rnd: () => number): { hx: number; hz: number } {
  switch (kind) {
    case 'checkpoint':
      return { hx: 1.8, hz: 1.8 };
    case 'goal':
      return { hx: 2.0, hz: 2.0 };
    case 'bounce':
      return { hx: 0.7, hz: 0.7 };
    case 'crumble':
      return { hx: 0.5 + rnd() * 0.15, hz: 0.5 + rnd() * 0.15 };
    default:
      return { hx: 0.55 + rnd() * 0.35, hz: 0.55 + rnd() * 0.35 };
  }
}

/** 한 축 왕복. 수평이면 나선 접선에 가까운 축, 가끔 수직. */
function pickMove(theta: number, rnd: () => number): NonNullable<PlatformSpec['move']> {
  const a = 1.5 + rnd() * 1.0;
  const period = 2.5 + rnd() * 1.5;
  const phase = rnd();
  const vertical = rnd() < 0.3;
  if (vertical) return { ax: 0, ay: a, az: 0, period, phase };
  const tx = -Math.sin(theta);
  const tz = Math.cos(theta);
  return Math.abs(tx) >= Math.abs(tz)
    ? { ax: a, ay: 0, az: 0, period, phase }
    : { ax: 0, ay: 0, az: a, period, phase };
}

/** 한 번의 코스 빌드 시도. 실패하면 null. */
function buildOnce(rnd: () => number, baseY: number): Built[] | null {
  const n = 30 + Math.floor(rnd() * 7); // 전체 30~36 (내부 발판 28~34)
  const mid = Math.floor((n - 1) / 2);
  const startY = baseY + TOP_OFFSET;
  const goalY = startY + CLIMB_MIN + rnd() * (CLIMB_MAX - CLIMB_MIN);

  let theta = rnd() * TAU;
  let radius = START_R;
  const list: Built[] = [
    makeBuilt({
      kind: 'checkpoint',
      x: START_R * Math.cos(theta),
      y: startY,
      z: START_R * Math.sin(theta),
      hx: 1.8,
      hz: 1.8,
      thickness: THICKNESS,
    }),
  ];
  let transitions = 0;
  let doubles = 0;

  for (let i = 1; i < n; i++) {
    const prevBuilt = list[list.length - 1];
    const prev = prevBuilt.spec;
    const isGoal = i === n - 1;
    const stepsLeft = n - i; // 이번 전이를 포함해 남은 전이 수
    const remaining = goalY - prev.y;
    const desired = remaining / stepsLeft;
    const t = i / (n - 1);
    let accepted: Built | null = null;
    let acceptedDouble = 0;

    for (let tries = 0; tries < CANDIDATES && !accepted; tries++) {
      const kind: PlatformKind = isGoal ? 'goal' : i === mid ? 'checkpoint' : pickKind(i, n, prev.kind, t, rnd);
      const candTheta = theta + (i <= 5 ? 25 + rnd() * 15 : 25 + rnd() * (20 + 10 * t)) * DEG;
      const r = isGoal ? 5.5 + rnd() * 1.5 : clamp(radius + (rnd() * 2 - 1) * 2, 5.2, 10.5);
      const { hx, hz } = sizeFor(kind, rnd);

      let rise: number;
      if (isGoal) {
        rise = remaining; // 마지막 발판은 목표 높이에 정확히 맞춘다
      } else {
        rise = desired + (rnd() * 2 - 1) * 0.25;
        const boosted = 3 + rnd() * 2;
        const useBoost = rnd() < 0.8;
        if (prev.kind === 'bounce' && useBoost) {
          // 튕김 뒤에는 큰 상승을 허용 (계획 높이를 넘지 않을 때만)
          const after = (remaining - boosted) / (stepsLeft - 1);
          if (after >= 0.6 && after <= 1.4) rise = boosted;
        }
        rise = clamp(rise, 0.2, BOUNCE_MAX_RISE);
      }

      const move = kind === 'moving' ? pickMove(candTheta, rnd) : undefined;
      const spec: PlatformSpec = {
        kind,
        x: r * Math.cos(candTheta),
        y: prev.y + rise,
        z: r * Math.sin(candTheta),
        hx,
        hz,
        thickness: THICKNESS,
        ...(move ? { move } : {}),
        ...(kind === 'bounce' ? { launch: 1.6 + rnd() * 0.3 } : {}),
      };

      const built = makeBuilt(spec);
      if (!radiusOk(built)) continue;
      const tr = checkTransition(prevBuilt, built);
      if (!tr.ok) continue;
      const dbl = tr.needsDouble ? 1 : 0;
      if (doubles + dbl > DOUBLE_SHARE * (transitions + 1)) continue;
      if (!clearanceOk(built, list)) continue;

      accepted = built;
      acceptedDouble = dbl;
      theta = candTheta;
      radius = r;
    }

    if (!accepted) return null;
    list.push(accepted);
    transitions++;
    doubles += acceptedDouble;
  }
  return list;
}

/**
 * 별의 탑 코스를 만든다.
 * @param x,z 기둥 중심
 * @param baseY 지면 높이 (시작 발판 윗면은 baseY + 0.6)
 * @param seed 같은 시드는 항상 같은 코스
 */
export function generateCourse(id: string, x: number, z: number, baseY: number, seed: number): CourseSpec {
  const rnd = mulberry32(seed);
  for (let attempt = 0; attempt < RESTARTS; attempt++) {
    const list = buildOnce(rnd, baseY);
    if (!list) continue;
    const platforms: PlatformSpec[] = list.map((b) => ({ ...b.spec, x: x + b.spec.x, z: z + b.spec.z }));
    const last = platforms[platforms.length - 1];
    return {
      id,
      x,
      z,
      baseY,
      platforms,
      goal: { x: last.x, y: last.y + GOAL_LIFT, z: last.z },
    };
  }
  throw new Error(`generateCourse: 레이아웃을 만들지 못했다 (seed ${seed})`);
}
