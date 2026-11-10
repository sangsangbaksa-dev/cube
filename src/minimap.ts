import type { World } from './world/terrain';
import type { Tower } from './game/towers';

/** 북쪽(-Z)이 위인 지도. 높낮이는 밝기로, 탑은 금색 마름모 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private elapsed = Infinity;
  constructor(el: HTMLCanvasElement, private readonly world: World) {
    this.ctx = el.getContext('2d')!;
  }
  update(x: number, z: number, faceX: number, faceZ: number, dt: number, towers: Tower[], shards: string[]) {
    this.elapsed += dt;
    if (this.elapsed < 0.15) return;
    this.elapsed = 0;
    const c = this.ctx, W = 240, C = 120, sc = 0.7, N = 20, cell = W / N;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.roundRect(0, 0, W, W, 30); c.clip();
    c.fillStyle = 'rgba(18, 14, 42, .78)'; c.fillRect(0, 0, W, W);
    const h0 = this.world.height(x, z);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const wx = x + (i + 0.5 - N / 2) / sc * cell / 1, wz = z + (j + 0.5 - N / 2) / sc * cell / 1;
      const d = Math.max(-1, Math.min(1, (this.world.height(wx, wz) - h0) / 30));
      c.fillStyle = d > 0 ? `rgba(197, 180, 255, ${0.12 + d * 0.5})` : `rgba(80, 200, 180, ${0.1 - d * 0.25})`;
      c.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5);
    }
    const P = (wx: number, wz: number): [number, number] => [C + (wx - x) * sc, C + (wz - z) * sc];
    const mark = (wx: number, wz: number, color: string, done: boolean) => {
      let [px, pz] = P(wx, wz);
      const dx = px - C, dz = pz - C, d = Math.hypot(dx, dz), max = 104;
      if (d > max) { px = C + dx / d * max; pz = C + dz / d * max; }
      c.save(); c.translate(px, pz); c.rotate(Math.PI / 4);
      c.fillStyle = done ? 'rgba(200,200,220,.5)' : color; c.strokeStyle = '#1a1238'; c.lineWidth = 2;
      c.fillRect(-7, -7, 14, 14); c.strokeRect(-7, -7, 14, 14); c.restore();
    };
    mark(this.world.home.x, this.world.home.z, '#6fe3ff', false);
    for (const t of towers) {
      const p = t.course.platforms[0];
      mark(p.x, p.z, t.info.color, shards.includes(t.id));
    }
    const l = Math.hypot(faceX, faceZ) || 1;
    c.translate(C, C); c.rotate(Math.atan2(faceX / l, -faceZ / l));
    c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 5); c.lineTo(-8, 9); c.closePath();
    c.fillStyle = '#5aa9ff'; c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); c.fill();
    c.restore();
    c.fillStyle = '#eef0ff'; c.font = 'bold 15px system-ui'; c.textAlign = 'center'; c.fillText('N', C, 20);
  }
}
