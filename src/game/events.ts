// 게임 진행 중 일어나는 일들. main.ts가 만들어 각 시스템(업적, 콤보, 의뢰 …)에 흘려 보낸다.
// 시스템들은 이 이벤트만 보고 동작하므로 DOM/Three.js 없이 테스트할 수 있다.

export type GameEvent =
  | { type: 'jump' }
  | { type: 'dash' }
  /** 공중 내려찍기 착지. power 0~1 (떨어진 높이 비례) */
  | { type: 'slam'; power: number }
  /** 솟구치는/방향 발사대에 튕겨 오름 */
  | { type: 'launch' }
  /** 착지. impact는 수직 속도 크기, onPlatform은 코스 발판 위인지 */
  | { type: 'land'; impact: number; onPlatform: boolean }
  /** 별가루 하나 주움. collected/total은 주운 뒤 개수 */
  | { type: 'dust'; collected: number; total: number }
  /** 본편 별조각 획득. count는 획득 뒤 개수 (1~7) */
  | { type: 'shard'; id: string; count: number }
  | { type: 'checkpoint' }
  /** 떨어지거나 R을 눌러 되돌아감 */
  | { type: 'respawn' }
  /** 원정 완주. time 초, improved는 최고 기록 갱신 여부 */
  | { type: 'expedition'; id: string; time: number; improved: boolean }
  | { type: 'guardianStrike' }
  | { type: 'guardianDefeated' }
  /** 등대를 밝힘 */
  | { type: 'victory' }
  /** 고정 스텝마다 한 번. 이동 거리(m), 공중에 있는지, 현재 높이 */
  | { type: 'tick'; dt: number; moved: number; grounded: boolean; y: number; night: number };

export type GameEventType = GameEvent['type'];

/** 아주 작은 이벤트 버스 */
export class EventBus {
  private readonly handlers: ((e: GameEvent) => void)[] = [];
  on(handler: (e: GameEvent) => void) { this.handlers.push(handler); return () => { const i = this.handlers.indexOf(handler); if (i >= 0) this.handlers.splice(i, 1); }; }
  emit(e: GameEvent) { for (const h of this.handlers) h(e); }
}

/** localStorage 래퍼: 저장소를 못 써도 게임은 돌아가야 한다 */
export function readJSON<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
export function writeJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 이번 판만 */ }
}
