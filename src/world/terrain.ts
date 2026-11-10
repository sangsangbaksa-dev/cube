import type { Terrain } from '../physics/terrain';
import { mulberry32, noise2 } from '../util/rand';

// 끝없이 이어진 언덕과 능선 위에 별의 탑 일곱 개가 서 있는 오픈월드. 시드만으로 정해진다.
export interface Site {
  id: number;
  x: number;
  z: number;
  /** 평평한 광장 반경 */
  r: number;
  /** 광장 높이 */
  y: number;
  role: 'home' | 'tower';
}

export const WORLD_R = 400;
/** 이보다 낮아지면 비정상 추락으로 본다 */
export const FALL_Y = -40;
export const TOWER_COUNT = 7;
const SEED = 4242;

function raw(x: number, z: number, d: number): number {
  // 큰 능선 + 중간 언덕 + 잔 굴곡. 집에서 멀수록 가파르다
  const wild = Math.min(1, d / 220);
  const big = noise2(x * 0.0045, z * 0.0045, 3) * 1.0;
  const mid = noise2(x * 0.014, z * 0.014, 8) * 0.45;
  const small = noise2(x * 0.045, z * 0.045, 21) * 0.1;
  const ridge = Math.abs(noise2(x * 0.008 + 40, z * 0.008, 5));
  return (big + mid) * (7 + wild * 30) + small * (2 + wild * 3) + (0.5 - ridge) * wild * 14;
}

export class World implements Terrain {
  readonly sites: Site[];
  constructor(seed = SEED) {
    this.sites = makeSites(seed);
    for (const s of this.sites) s.y = this.base(s.x, s.z);
  }
  get home(): Site { return this.sites[0]; }
  get towers(): Site[] { return this.sites.slice(1); }

  private base(x: number, z: number): number {
    const d = Math.hypot(x, z);
    let h = raw(x, z, d);
    // 바깥 둘레는 산벽
    if (d > WORLD_R - 30) h += ((d - (WORLD_R - 30)) / 30) ** 2 * 40;
    return h;
  }

  height(x: number, z: number): number {
    let h = this.base(x, z);
    for (const s of this.sites) {
      const dx = x - s.x, dz = z - s.z;
      if (Math.abs(dx) > s.r + 22 || Math.abs(dz) > s.r + 22) continue;
      const d = Math.hypot(dx, dz);
      if (d >= s.r + 22) continue;
      const k = d <= s.r ? 1 : 1 - smooth((d - s.r) / 22);
      h = h + (s.y - h) * k;
    }
    return h;
  }

  siteAt(x: number, z: number, pad = 0): Site | null {
    for (const s of this.sites) if (Math.hypot(x - s.x, z - s.z) < s.r + pad) return s;
    return null;
  }
}

function smooth(t: number): number { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

function makeSites(seed: number): Site[] {
  const rnd = mulberry32(seed);
  const sites: Site[] = [{ id: 0, x: 0, z: 0, r: 20, y: 0, role: 'home' }];
  // 일곱 방향으로 퍼뜨린다. 가까운 탑은 쉬운 길, 먼 탑은 긴 여정
  const a0 = rnd() * Math.PI * 2;
  for (let k = 0; k < TOWER_COUNT; k++) {
    const a = a0 + (k / TOWER_COUNT) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const d = 110 + (k % 3) * 70 + rnd() * 50;
    sites.push({ id: k + 1, x: Math.cos(a) * d, z: Math.sin(a) * d, r: 17, y: 0, role: 'tower' });
  }
  return sites;
}
