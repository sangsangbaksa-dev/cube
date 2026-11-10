// 게임 시스템이 함께 쓰는 자료형. 렌더링과 무관한 순수 데이터만 둔다.

export type BaseKind = 'slime' | 'spiker' | 'bat' | 'caster' | 'golem';
/** 기본 몸집 몬스터 + 큰 변종과 보스 */
export type MonsterKind = BaseKind | 'bigslime' | 'batking' | 'eyelord';

/** 몬스터 모델 애니메이션에 넘기는 상태 (모두 0~1 범위면 0~1) */
export interface MonsterAnim {
  time: number;
  /** 이동 속도 비율 0~1 */
  moving: number;
  airborne: boolean;
  /** 수직 속도 (스쿼시/스트레치용) */
  vy: number;
  /** 공격 준비 동작 0~1 (1이면 곧 공격) */
  telegraph: number;
  /** 공격 중인가 (돌진, 급강하, 내려찍기 등) */
  attacking: boolean;
  /** 맞은 직후 1 → 0으로 줄어든다 */
  hurt: number;
  /** 죽는 중 0 → 1 (1이면 사라짐) */
  dying: number;
  /** 밤 정도 0~1. 밤에는 눈이 더 빛난다 */
  night: number;
}

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
