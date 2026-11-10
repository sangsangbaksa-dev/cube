import type { Abilities } from '../physics/world';

// 진행 상황: 모은 별조각, 정화한 균열, 별가루, 마지막 쉼터. localStorage에 저장한다.
const KEY = 'cubequest.save.v1';
export const SHARD_GOAL = 7;

export interface SaveData {
  shards: string[];
  gems: number;
  checkpoint: { x: number; y: number; z: number } | null;
  won: boolean;
  /** 보스가 떨어뜨리는 재료 */
  cores: number;
  weapons: string[];
  equipped: string;
}

/** 별조각 개수에 따라 풀리는 능력 (순서대로) */
export const UNLOCKS: { title: string; sub: string }[] = [
  { title: '새 능력: 대시', sub: 'Shift 또는 오른쪽 클릭 · 대시 중에는 무적이고 적을 들이받아요' },
  { title: '하트 +1', sub: '최대 체력이 늘었어요' },
  { title: '새 능력: 별빛 회전', sub: '회전 공격이 더 넓고 강해졌어요' },
  { title: '하트 +1', sub: '최대 체력이 늘었어요' },
  { title: '새 능력: 삼단 점프', sub: '공중에서 두 번 더 뛸 수 있어요' },
  { title: '하트 +1', sub: '최대 체력이 늘었어요' },
  { title: '일곱 번째 별조각!', sub: '등대로 돌아가 불을 밝혀요' },
];

/** 등대 작업대에서 만드는 무기 */
export interface Weapon { name: string; desc: string; gems: number; cores: number; radius: number; damage: number; knock: number; slam: number; bolt: boolean }
export const WEAPONS: Record<string, Weapon> = {
  fist: { name: '맨몸 회전', desc: '기본 회전 공격', gems: 0, cores: 0, radius: 0, damage: 0, knock: 1, slam: 0, bolt: false },
  sword: { name: '크리스털 검', desc: '더 넓게 베고 피해 +1', gems: 20, cores: 0, radius: 0.5, damage: 1, knock: 1, slam: 0, bolt: false },
  hammer: { name: '천둥 망치', desc: '내려찍기 범위가 크게 늘고 멀리 날려요', gems: 35, cores: 1, radius: 0.2, damage: 1, knock: 1.6, slam: 1.8, bolt: false },
  staff: { name: '별빛 지팡이', desc: '휘두를 때마다 별탄을 쏴요 (피해 2)', gems: 50, cores: 2, radius: 0, damage: 0, knock: 1, slam: 0, bolt: true },
};

export interface Stats {
  maxHp: number;
  airJumps: number;
  dash: boolean;
  /** 회전 공격 강화 단계 */
  power: number;
}

export function statsFor(shards: number): Stats {
  return {
    maxHp: 3 + (shards >= 2 ? 1 : 0) + (shards >= 4 ? 1 : 0) + (shards >= 6 ? 1 : 0),
    airJumps: shards >= 5 ? 2 : 1,
    dash: shards >= 1,
    power: shards >= 3 ? 1 : 0,
  };
}

export function applyStats(ab: Abilities, st: Stats) {
  ab.airJumps = st.airJumps;
  ab.dash = st.dash;
}

export function emptySave(): SaveData {
  return { shards: [], gems: 0, checkpoint: null, won: false, cores: 0, weapons: ['fist'], equipped: 'fist' };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      shards: Array.isArray(d.shards) ? d.shards.filter((s) => typeof s === 'string') : [],
      gems: typeof d.gems === 'number' && Number.isFinite(d.gems) ? d.gems : 0,
      checkpoint: d.checkpoint && Number.isFinite(d.checkpoint.x) ? d.checkpoint : null,
      won: d.won === true,
      cores: typeof d.cores === 'number' && Number.isFinite(d.cores) ? d.cores : 0,
      weapons: Array.isArray(d.weapons) ? ['fist', ...d.weapons.filter((w) => typeof w === 'string' && w !== 'fist' && w in WEAPONS)] : ['fist'],
      equipped: typeof d.equipped === 'string' && d.equipped in WEAPONS ? d.equipped : 'fist',
    };
  } catch {
    return emptySave();
  }
}

export function writeSave(d: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장소를 못 쓰면 이번 판만 */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}
