// 원정 타임 트라이얼 메달. 발판 배치로 기준 시간(par)을 정하고, 완주 시간을 등급에 대응시킨다.
// DOM/THREE 없이 동작하는 순수 로직.
import type { PlatformSpec } from './types';

export type Medal = 'gold' | 'silver' | 'bronze' | null;
export type ParTimes = { gold: number; silver: number; bronze: number };

/** 기준 속도(m/s). 발판 사이를 이 속도로 달린다고 본다 */
const REFERENCE_SPEED = 6.2;
/** 발판 하나당 더해지는 시간(초): 점프/착지 여유 */
const PER_PLATFORM = 0.35;
/** 위로 올라가는 거리는 수평 거리보다 이만큼 더 무겁게 센다 */
const RISE_WEIGHT = 1.5;
/** 발판이 너무 적어 기준 시간을 만들 수 없을 때 쓰는 값 */
const UNRANKED = 999;

/** 발판 중심(윗면에서 두께 절반 아래)을 순서대로 이은 3D 경로 길이. 내려가는 구간은 수평 거리만 센다 */
export function routeLength(platforms: PlatformSpec[]): number {
  let total = 0;
  for (let i = 1; i < platforms.length; i++) {
    const a = platforms[i - 1];
    const b = platforms[i];
    const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
    const ay = a.y - a.thickness / 2;
    const by = b.y - b.thickness / 2;
    const rise = Math.max(0, by - ay);
    total += horizontal + rise * RISE_WEIGHT;
  }
  return total;
}

/** 소수 첫째 자리 반올림(올림 아님) */
const round1 = (v: number) => Math.round(v * 10) / 10;

export function parTimes(platforms: PlatformSpec[]): ParTimes {
  if (platforms.length < 2) return { gold: UNRANKED, silver: UNRANKED, bronze: UNRANKED };
  const base = routeLength(platforms) / REFERENCE_SPEED + platforms.length * PER_PLATFORM;
  return {
    gold: round1(base * 1.0),
    silver: round1(base * 1.35),
    bronze: round1(base * 1.8),
  };
}

/** 시간이 par 이하이면 해당 메달, 동빛 기준을 넘으면 null */
export function medalFor(time: number, par: ParTimes): Medal {
  if (time <= par.gold) return 'gold';
  if (time <= par.silver) return 'silver';
  if (time <= par.bronze) return 'bronze';
  return null;
}

export const MEDAL_INFO: Record<'gold' | 'silver' | 'bronze', { name: string; color: string; coins: number }> = {
  gold: { name: '금빛 별', color: '#ffd36b', coins: 30 },
  silver: { name: '은빛 별', color: '#d9e2ee', coins: 15 },
  bronze: { name: '동빛 별', color: '#d9925a', coins: 8 },
};

/** 메달 등급 순위. 갱신 판정에 쓴다 (gold 3 … null 0) */
export function medalRank(m: Medal): number {
  switch (m) {
    case 'gold': return 3;
    case 'silver': return 2;
    case 'bronze': return 1;
    default: return 0;
  }
}
