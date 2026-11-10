import type { Obstacle } from '../physics/world';

/** 충돌체 공간 격자. near()는 같은 배열을 재사용한다 */
export class ObstacleGrid {
  private readonly cells = new Map<number, Obstacle[]>();
  private readonly out: Obstacle[] = [];
  constructor(private readonly size = 12) {}
  private key(cx: number, cz: number) { return (cx + 4096) * 8192 + (cz + 4096); }
  add(o: Obstacle, reach = 0) {
    const r = (o.hx !== undefined ? Math.max(o.hx, o.hz ?? o.hx) : o.r) + reach;
    for (let cx = Math.floor((o.x - r) / this.size); cx <= Math.floor((o.x + r) / this.size); cx++)
      for (let cz = Math.floor((o.z - r) / this.size); cz <= Math.floor((o.z + r) / this.size); cz++) {
        const k = this.key(cx, cz);
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push(o);
      }
  }
  near(x: number, z: number): Obstacle[] {
    this.out.length = 0;
    const l = this.cells.get(this.key(Math.floor(x / this.size), Math.floor(z / this.size)));
    if (l) for (const o of l) this.out.push(o);
    return this.out;
  }
}
