export type PlatformKind = 'static' | 'moving' | 'crumble' | 'bounce' | 'checkpoint' | 'goal';

/** 파쿠르 발판 하나. y는 윗면 높이(월드 좌표). 상자 모양이고 축에 정렬되어 있다. */
export interface PlatformSpec {
  kind: PlatformKind;
  x: number;
  y: number;
  z: number;
  /** 가로/세로 반 크기 */
  hx: number;
  hz: number;
  /** 두께 (윗면에서 아래로) */
  thickness: number;
  /** moving: 중심 기준으로 (ax,ay,az) 진폭만큼 sin으로 왕복. period 초, phase 0~1 */
  move?: { ax: number; ay: number; az: number; period: number; phase: number };
  orbit?: { radius: number; period: number; phase: number };
  /** bounce: 점프 속도의 몇 배로 쏘아 올리는가 */
  launch?: number;
}

export interface CourseSpec {
  id: string;
  /** 탑 중심 */
  x: number;
  z: number;
  /** 지면 높이 */
  baseY: number;
  platforms: PlatformSpec[];
  /** 별조각이 놓이는 곳 (goal 발판 위 공중) */
  goal: { x: number; y: number; z: number };
}
