import type { World } from './world/islands';
import type { Tower } from './game/towers';
import type { Rift } from './game/rifts';

/** 북쪽(-Z)이 위인 지도. 섬, 다리, 탑(금색)과 균열(보라) */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private elapsed = Infinity;
  constructor(el: HTMLCanvasElement, private readonly world: World) {
    this.ctx = el.getContext('2d')!;
  }
  update(x: number, z: number, faceX: number, faceZ: number, dt: number, towers: Tower[], rifts: Rift[], shards: string[]) {
    this.elapsed += dt;
    if (this.elapsed < 0.15) return;
    this.elapsed = 0;
    const c = this.ctx, W = 240, C = 120, sc = 0.42;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.roundRect(0, 0, W, W, 30); c.clip();
    c.fillStyle = 'rgba(18, 14, 42, .72)'; c.fillRect(0, 0, W, W);
    const P = (wx: number, wz: number): [number, number] => [C + (wx - x) * sc, C + (wz - z) * sc];
    c.strokeStyle = 'rgba(197, 139, 92, .7)'; c.lineWidth = 3;
    for (const b of this.world.bridges) { c.beginPath(); c.moveTo(...P(b.ax, b.az)); c.lineTo(...P(b.bx, b.bz)); c.stroke(); }
    for (const i of this.world.islands) {
      const [px, pz] = P(i.x, i.z);
      c.beginPath(); c.arc(px, pz, i.r * sc, 0, Math.PI * 2);
      c.fillStyle = i.role === 'home' ? 'rgba(95, 212, 180, .75)' : 'rgba(142, 123, 240, .45)'; c.fill();
    }
    const mark = (wx: number, wz: number, color: string, done: boolean) => {
      let [px, pz] = P(wx, wz);
      const dx = px - C, dz = pz - C, d = Math.hypot(dx, dz), max = 104;
      if (d > max) { px = C + dx / d * max; pz = C + dz / d * max; }
      c.save(); c.translate(px, pz); c.rotate(Math.PI / 4);
      c.fillStyle = done ? 'rgba(200,200,220,.5)' : color; c.strokeStyle = '#1a1238'; c.lineWidth = 2;
      c.fillRect(-7, -7, 14, 14); c.strokeRect(-7, -7, 14, 14); c.restore();
    };
    const home = this.world.home;
    mark(home.x, home.z, '#6fe3ff', false);
    for (const t of towers) mark(t.island.x, t.island.z, '#ffd36b', shards.includes(t.id));
    for (const r of rifts) mark(r.island.x, r.island.z, '#b06bff', shards.includes(r.id));
    const l = Math.hypot(faceX, faceZ) || 1;
    c.translate(C, C); c.rotate(Math.atan2(faceX / l, -faceZ / l));
    c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 5); c.lineTo(-8, 9); c.closePath();
    c.fillStyle = '#5aa9ff'; c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); c.fill();
    c.restore();
    c.fillStyle = '#eef0ff'; c.font = 'bold 15px system-ui'; c.textAlign = 'center'; c.fillText('N', C, 20);
  }
}
