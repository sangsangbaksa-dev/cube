import { STORY_ROUTE_COUNT, TOWER_COUNT } from '../world/terrain';

// 진행 상황: 모은 별조각, 별가루, 마지막 쉼터, 원정 최고 기록.
const KEY = 'cubequest.save.v3';
export const SHARD_GOAL = STORY_ROUTE_COUNT;

export interface SaveData {
  shards: string[];
  /** 주운 별가루 id */
  dust: number[];
  checkpoint: { x: number; y: number; z: number } | null;
  won: boolean;
  records: Record<string, number>;
}

export function emptySave(): SaveData {
  return { shards: [], dust: [], checkpoint: null, won: false, records: {} };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const d = JSON.parse(raw) as Partial<SaveData>;
    const records: SaveData['records'] = {};
    for (let id = STORY_ROUTE_COUNT + 1; id <= TOWER_COUNT; id++) {
      const key = `route-${id}`, time = d.records?.[key];
      if (typeof time === 'number' && Number.isFinite(time) && time > 0) records[key] = time;
    }
    return {
      shards: Array.isArray(d.shards) ? [...new Set(d.shards.filter((s) => typeof s === 'string' && /^route-[1-7]$/.test(s)))] : [],
      dust: Array.isArray(d.dust) ? d.dust.filter((n) => Number.isInteger(n)) : [],
      checkpoint: d.checkpoint && Number.isFinite(d.checkpoint.x) && Number.isFinite(d.checkpoint.y) && Number.isFinite(d.checkpoint.z) ? d.checkpoint : null,
      won: d.won === true,
      records,
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
