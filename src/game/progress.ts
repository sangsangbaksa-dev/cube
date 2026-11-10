// 진행 상황: 모은 별조각, 별가루, 마지막 쉼터. localStorage에 저장한다.
const KEY = 'cubequest.save.v2';
export const SHARD_GOAL = 7;

export interface SaveData {
  shards: string[];
  /** 주운 별가루 id */
  dust: number[];
  checkpoint: { x: number; y: number; z: number } | null;
  won: boolean;
}

export function emptySave(): SaveData {
  return { shards: [], dust: [], checkpoint: null, won: false };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      shards: Array.isArray(d.shards) ? d.shards.filter((s) => typeof s === 'string') : [],
      dust: Array.isArray(d.dust) ? d.dust.filter((n) => Number.isInteger(n)) : [],
      checkpoint: d.checkpoint && Number.isFinite(d.checkpoint.x) && Number.isFinite(d.checkpoint.y) && Number.isFinite(d.checkpoint.z) ? d.checkpoint : null,
      won: d.won === true,
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
