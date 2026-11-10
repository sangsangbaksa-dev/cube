// 물리가 지면을 읽는 최소한의 약속. 지형 생성은 world 쪽에서 한다.
export interface Terrain {
  height(x: number, z: number): number;
  /** 수면 높이. 없으면 물이 없는 지형 */
  waterLevel?: number;
  waterAt?(x: number, z: number): number;
}

export function waterHeightAt(terrain: Terrain, x: number, z: number): number {
  return terrain.waterAt?.(x, z) ?? terrain.waterLevel ?? -Infinity;
}

export function surfaceNormal(
  t: Terrain, x: number, z: number,
  out: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 },
): { x: number; y: number; z: number } {
  const e = 0.3;
  const nx = -(t.height(x + e, z) - t.height(x - e, z)) / (2 * e);
  const nz = -(t.height(x, z + e) - t.height(x, z - e)) / (2 * e);
  const len = Math.hypot(nx, 1, nz);
  out.x = nx / len; out.y = 1 / len; out.z = nz / len;
  return out;
}
