import type { Terrain } from '../physics/terrain';
import { mulberry32, noise2 } from '../util/rand';

export const ROUTES = [
  { name: '초원 돌계단', color: '#e4ce8e', hint: '스페이스를 길게 누르면 더 높이 뛰어요.', x: -26, z: -44, r: 15 },
  { name: '바람의 탑', color: '#a8d6dc', hint: '탑을 한 바퀴씩 돌며 쉼터까지 올라가세요.', x: 66, z: -49, r: 17 },
  { name: '부서진 수로', color: '#8be2ca', hint: '청록색 발판이 가까워졌을 때 올라타세요.', x: 119, z: 44, r: 24 },
  { name: '수정 동굴', color: '#c3a5f2', hint: '돌문으로 들어가 수정 불빛을 따라가세요.', x: 65, z: 153, r: 33 },
  { name: '회오리 첨탑', color: '#90cbff', hint: '소용돌이를 타고 분홍색 발판에서 솟아오르세요.', x: -138, z: 150, r: 24 },
  { name: '잿빛 제련소', color: '#f3a17a', hint: '주황색 발판은 밟으면 곧 무너져요.', x: -241, z: -37, r: 30 },
  { name: '폭풍의 심장', color: '#e0b4ff', hint: '별조각 여섯 개로 수호자의 봉인을 여세요.', x: -113, z: -263, r: 25 },
  { name: '달빛 점멸교', color: '#b8a2ef', hint: '테두리만 보이는 발판은 사라진 상태예요. 빛이 차오를 때 뛰세요.', x: -76, z: 44, r: 24 },
  { name: '유리빙하', color: '#9bdef2', hint: '빙판에서는 발을 떼도 미끄러져요. 코너에 닿기 전에 방향을 틀어요.', x: 26, z: 88, r: 25 },
  { name: '자석 공방', color: '#ffbd83', hint: '화살표 발사대를 밟고, 날아가는 동안 착지점을 향해 조종하세요.', x: 147, z: -71, r: 27 },
  { name: '세 빛의 회랑', color: '#9de4aa', hint: '빛나는 스위치를 밟으면 같은 번호의 발판이 나타나요.', x: -126, z: -119, r: 27 },
  { name: '톱니 정원', color: '#ecac89', hint: '회전하는 붉은 날을 뛰어넘으세요. 맞으면 마지막 쉼터로 돌아가요.', x: 175, z: 151, r: 29 },
  { name: '종이학 협곡', color: '#d5e5a2', hint: '바람 기둥 안으로 뛰면 위로 떠올라요. 충분히 오른 뒤 옆으로 빠져나가세요.', x: 6, z: -247, r: 31 },
  { name: '혜성 관문', color: '#f0b2dd', hint: '공중에서 빛의 고리를 통과하면 대시를 다시 쓸 수 있어요.', x: 155, z: -239, r: 35 },
] as const;

export const STORY_ROUTE_COUNT = 7;
export const EXPEDITION_COUNT = ROUTES.length - STORY_ROUTE_COUNT;
export type Route = (typeof ROUTES)[number];

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
export const TOWER_COUNT = ROUTES.length;
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
      if (d <= s.r) { h = s.y; break; }
      const k = 1 - smooth((d - s.r) / 22);
      h = h + (s.y - h) * k;
    }
    const cave = this.sites[4];
    const cx = Math.abs(x - cave.x), cz = cave.z - z;
    if (cx < 14 && cz > -28 && cz < 19) {
      h -= 6.6 * smooth((14 - cx) / 4.5) * smooth((cz + 28) / 4.5) * smooth((19 - cz) / 6);
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
  for (const [i, route] of ROUTES.entries()) sites.push({
    id: i + 1, x: route.x + (rnd() - 0.5) * 2, z: route.z + (rnd() - 0.5) * 2, r: route.r, y: 0, role: 'tower',
  });
  return sites;
}
