// 원정 고스트: 최고 기록의 큐브 위치를 저장하고 다시 재생한다. DOM/THREE 없이 테스트 가능한 순수 로직.
import { readJSON, writeJSON } from './events';

/** 샘플 간격(초) */
export const GHOST_DT = 0.1;
/** 최대 샘플 수 (6000 = 10분) */
export const GHOST_MAX_SAMPLES = 6000;
export const GHOST_STORAGE_KEY = 'cubequest.ghost.v1';

const EPS = 1e-9;

/** points: x,y,z 평탄 배열. i번째 샘플은 points[i*3 .. i*3+2] */
export interface GhostTrack {
  dt: number;
  points: number[];
}

/** 주입 가능한 저장소. 기본값은 events.ts의 readJSON/writeJSON */
export interface GhostStorage {
  get(): unknown;
  set(v: Record<string, GhostTrack>): void;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 0.1초 격자에 맞춰 위치를 기록한다. 샘플 사이는 선형 보간. */
export class GhostRecorder {
  private points: number[] = [];
  private t0 = 0;
  private nextT = 0;
  private prev: { r: number; x: number; y: number; z: number } | null = null;
  private active = false;

  start() {
    this.points = [];
    this.prev = null;
    this.nextT = 0;
    this.active = true;
  }

  /** t는 초 단위 시각. start() 이후 첫 호출을 시간 0으로 본다. */
  sample(t: number, x: number, y: number, z: number) {
    if (!this.active || !Number.isFinite(t)) return;
    if (this.prev === null) {
      this.t0 = t;
      this.push(x, y, z);
      this.nextT = GHOST_DT;
    } else {
      const r = t - this.t0;
      const p = this.prev;
      const span = r - p.r;
      // 이번 프레임 시각을 넘는 격자점만 기록
      while (this.nextT <= r + EPS && this.count() <= GHOST_MAX_SAMPLES) {
        const k = span > 0 ? (this.nextT - p.r) / span : 1;
        this.push(p.x + (x - p.x) * k, p.y + (y - p.y) * k, p.z + (z - p.z) * k);
        this.nextT += GHOST_DT;
      }
    }
    this.prev = { r: t - this.t0, x, y, z };
  }

  finish(): GhostTrack {
    this.active = false;
    return { dt: GHOST_DT, points: this.points.slice() };
  }

  private count() {
    return this.points.length / 3;
  }

  // 최대치에 닿으면 더 쌓지 않는다.
  private push(x: number, y: number, z: number) {
    if (this.count() >= GHOST_MAX_SAMPLES) return;
    this.points.push(round2(x), round2(y), round2(z));
  }
}

/**
 * t 시점의 위치를 out에 쓴다.
 * 끝을 넘으면 마지막 위치를 유지하고 false를 돌려준다. 재생 중이면 true.
 */
export function ghostAt(track: GhostTrack, t: number, out: { x: number; y: number; z: number }): boolean {
  const p = track.points;
  const n = Math.floor(p.length / 3);
  if (n === 0) return false;
  const last = (n - 1) * track.dt;
  if (!(t <= last + EPS)) {
    const i = (n - 1) * 3;
    out.x = p[i];
    out.y = p[i + 1];
    out.z = p[i + 2];
    return false;
  }
  const f = Math.max(0, t) / track.dt;
  const i = Math.min(Math.floor(f), n - 1);
  const k = f - i;
  const a = i * 3;
  const b = Math.min(i + 1, n - 1) * 3;
  out.x = p[a] + (p[b] - p[a]) * k;
  out.y = p[a + 1] + (p[b + 1] - p[a + 1]) * k;
  out.z = p[a + 2] + (p[b + 2] - p[a + 2]) * k;
  return true;
}

/** 저장 데이터 검증: 유한한 숫자 배열, 길이 3의 배수, 최대 샘플 수 이하 */
export function isValidGhostTrack(v: unknown): v is GhostTrack {
  if (!v || typeof v !== 'object') return false;
  const { dt, points } = v as { dt?: unknown; points?: unknown };
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return false;
  if (!Array.isArray(points)) return false;
  if (points.length === 0 || points.length % 3 !== 0) return false;
  if (points.length / 3 > GHOST_MAX_SAMPLES) return false;
  return points.every((n) => typeof n === 'number' && Number.isFinite(n));
}

const defaultStorage: GhostStorage = {
  get: () => readJSON<unknown>(GHOST_STORAGE_KEY),
  set: (v) => writeJSON(GHOST_STORAGE_KEY, v),
};

/** 코스별 최고 기록 고스트 저장소 */
export class GhostStore {
  private readonly storage: GhostStorage;

  constructor(storage: GhostStorage = defaultStorage) {
    this.storage = storage;
  }

  get(courseId: string): GhostTrack | null {
    const track = this.load()[courseId];
    return track ?? null;
  }

  /** 저장했으면 true. 검증에 걸리거나 저장소가 실패하면 false */
  set(courseId: string, track: GhostTrack): boolean {
    if (!isValidGhostTrack(track)) return false;
    const all = this.load();
    all[courseId] = { dt: track.dt, points: track.points.slice() };
    try {
      this.storage.set(all);
      return true;
    } catch {
      return false;
    }
  }

  // 손상된 항목은 버린다. 프로토타입 키(__proto__ 등)와 섞이지 않도록 null 프로토타입을 쓴다.
  private load(): Record<string, GhostTrack> {
    const out: Record<string, GhostTrack> = Object.create(null);
    let raw: unknown;
    try {
      raw = this.storage.get();
    } catch {
      return out;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [key, value] of Object.entries(raw)) {
      if (isValidGhostTrack(value)) out[key] = value;
    }
    return out;
  }
}
