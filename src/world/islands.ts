import type { Terrain } from '../physics/terrain';
import { mulberry32, noise2 } from '../util/rand';

// 구름 바다 위에 떠 있는 섬들과 그 사이를 잇는 좁은 다리. 시드만으로 정해진다.
export type IslandRole = 'home' | 'tower' | 'rift' | 'wild';
export interface Island {
  id: number;
  x: number;
  z: number;
  r: number;
  /** 윗면 높이 */
  y: number;
  role: IslandRole;
  /** 색 테마 0~3 */
  theme: number;
}
export interface Bridge { a: Island; b: Island; ax: number; az: number; bx: number; bz: number; w: number }

export const VOID = -200;
/** 이보다 아래로 떨어지면 추락으로 본다 */
export const FALL_Y = -32;
const SEED = 4242;

export function makeIslands(seed = SEED): { islands: Island[]; bridges: Bridge[] } {
  const rnd = mulberry32(seed);
  const islands: Island[] = [{ id: 0, x: 0, z: 0, r: 26, y: 4, role: 'home', theme: 0 }];
  let tries = 0;
  while (islands.length < 16 && tries++ < 4000) {
    const a = rnd() * Math.PI * 2, d = 55 + Math.sqrt(rnd()) * 250;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const r = 17 + rnd() * 13;
    if (islands.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 14)) continue;
    // 가까운 섬과 너무 멀면 다리가 길어지니 버린다
    const near = Math.min(...islands.map((o) => Math.hypot(o.x - x, o.z - z) - o.r - r));
    if (near > 34) continue;
    islands.push({ id: islands.length, x, z, r, y: 2 + rnd() * 14, role: 'wild', theme: 1 + Math.floor(rnd() * 3) });
  }
  // 역할: 큰 섬은 탑(4), 다음은 균열(3). 집에서 가까운 순으로 하나씩 섞는다
  const byDist = islands.slice(1).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  const big = byDist.filter((i) => i.r >= 22);
  let towers = 0, rifts = 0;
  for (const i of big) {
    if (towers < 4 && (towers <= rifts || rifts >= 3)) { i.role = 'tower'; towers++; }
    else if (rifts < 3) { i.role = 'rift'; rifts++; }
  }
  for (const i of byDist) if (i.role === 'wild' && rifts < 3 && i.r >= 19) { i.role = 'rift'; rifts++; }
  for (const i of byDist) if (i.role === 'wild' && towers < 4 && i.r >= 19) { i.role = 'tower'; towers++; }

  // 다리: 최소 신장 트리 + 짧은 여분 하나
  const bridges: Bridge[] = [];
  const inTree = new Set([0]);
  while (inTree.size < islands.length) {
    let best: [number, number, number] = [-1, -1, Infinity];
    for (const i of inTree) for (const o of islands) {
      if (inTree.has(o.id)) continue;
      const g = Math.hypot(islands[i].x - o.x, islands[i].z - o.z) - islands[i].r - o.r;
      if (g < best[2]) best = [i, o.id, g];
    }
    inTree.add(best[1]);
    bridges.push(bridge(islands[best[0]], islands[best[1]]));
  }
  return { islands, bridges };
}

function bridge(a: Island, b: Island): Bridge {
  const d = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
  return { a, b, ax: a.x + ux * (a.r - 3), az: a.z + uz * (a.r - 3), bx: b.x - ux * (b.r - 3), bz: b.z - uz * (b.r - 3), w: 1.7 };
}

/** 섬 윗면 높이 (섬 밖이면 VOID) */
export function islandHeight(i: Island, x: number, z: number): number {
  const dx = x - i.x, dz = z - i.z;
  const d = Math.hypot(dx, dz);
  if (d > i.r * 1.3) return VOID;
  const wob = 1 + 0.14 * noise2(Math.atan2(dz, dx) * 2.2 + i.id * 7, i.id, 11);
  const e = d / (i.r * wob);
  if (e > 1.12) return VOID;
  // 탑/균열/집 가운데는 평평한 광장
  const flat = i.role === 'wild' ? 0 : Math.min(1, Math.max(0, (e - 0.55) / 0.3));
  const bumps = (noise2(x * 0.09, z * 0.09, i.id) * 1.3 + noise2(x * 0.25, z * 0.25, i.id + 3) * 0.3) * (i.role === 'wild' ? 1 : flat);
  const hill = i.role === 'wild' ? Math.max(0, noise2(x * 0.04, z * 0.04, i.id + 9)) * 5 * (1 - e) : 0;
  let h = i.y + bumps + hill;
  if (e > 0.9) h -= ((e - 0.9) / 0.22) ** 2 * 2.5; // 가장자리는 둥글게 깎인다
  return h;
}

function bridgeHeight(b: Bridge, x: number, z: number): number {
  const vx = b.bx - b.ax, vz = b.bz - b.az;
  const len2 = vx * vx + vz * vz;
  const t = Math.max(0, Math.min(1, ((x - b.ax) * vx + (z - b.az) * vz) / len2));
  const px = b.ax + vx * t, pz = b.az + vz * t;
  const d = Math.hypot(x - px, z - pz);
  if (d > b.w) return VOID;
  const sag = Math.sin(t * Math.PI) * Math.min(2, Math.sqrt(len2) * 0.04);
  return b.a.y + (b.b.y - b.a.y) * (t * t * (3 - 2 * t)) - sag + 0.2;
}

export class World implements Terrain {
  readonly islands: Island[];
  readonly bridges: Bridge[];
  constructor(seed = SEED) {
    const w = makeIslands(seed);
    this.islands = w.islands;
    this.bridges = w.bridges;
  }

  height(x: number, z: number): number {
    let h = VOID;
    for (const i of this.islands) {
      if (Math.abs(x - i.x) > i.r * 1.3 || Math.abs(z - i.z) > i.r * 1.3) continue;
      const v = islandHeight(i, x, z);
      if (v > h) h = v;
    }
    for (const b of this.bridges) {
      if (x < Math.min(b.ax, b.bx) - 2 || x > Math.max(b.ax, b.bx) + 2 || z < Math.min(b.az, b.bz) - 2 || z > Math.max(b.az, b.bz) + 2) continue;
      const v = bridgeHeight(b, x, z);
      if (v > h) h = v;
    }
    return h;
  }

  islandAt(x: number, z: number): Island | null {
    let best: Island | null = null, bd = Infinity;
    for (const i of this.islands) {
      const d = Math.hypot(x - i.x, z - i.z) / i.r;
      if (d < 1.1 && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  get home(): Island { return this.islands[0]; }
}
