import { describe, expect, it } from 'vitest';
import { HALF, PhysicsWorld } from '../physics/world';
import { World } from '../world/terrain';
import { makeRoute } from './routes';

const world = new World();

describe('파쿠르 코스', () => {
  it('스폰을 중심으로 가까운 입문 코스부터 먼 수호자 코스까지 이어진다', () => {
    const routes = world.towers.map(makeRoute);
    const distances = routes.map(({ x, z }) => Math.hypot(x, z));
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(new Set(routes.map((r) => r.id)).size).toBe(7);
    expect(routes[0].platforms.length).toBeLessThan(8);
    expect(routes[4].platforms.some((p) => p.orbit)).toBe(true);
  });

  it.each([
    { site: 5, start: 3, offsetX: -.801, offsetZ: -.641, initial: 3.59, speed: .64, steer: 3.952, turn: 12 },
    { site: 6, start: 7, offsetX: -.794, offsetZ: .937, initial: 2.832, speed: .566, steer: 2.484, turn: 13 },
  ])('코스 $site: 정면 점프는 벽에 막히고 공중에서 돌아 착지할 수 있다', (c) => {
    const route = makeRoute(world.towers[c.site - 1]);
    const [from, to] = route.platforms.slice(c.start, c.start + 2);
    const wall = route.barriers[0];
    const boxes = route.platforms.map((p) => ({ x: p.x, z: p.z, r: 0, hx: p.hx, hz: p.hz, top: p.y, collisionBottom: p.y - p.thickness }));
    const phys = new PhysicsWorld(world, from.x, from.z, { near: () => [...boxes, { ...wall, r: 0, collisionBottom: wall.bottom }] });
    const s = phys.state;
    const run = (curve: boolean) => {
      const angle = curve ? c.initial : Math.atan2(to.z - from.z, to.x - from.x);
      phys.teleport(from.x + (curve ? c.offsetX : 0), from.y + HALF, from.z + (curve ? c.offsetZ : 0));
      Object.assign(s, { vx: Math.cos(angle) * c.speed, vz: Math.sin(angle) * c.speed, grounded: true, buffer: 0, standingOn: boxes[c.start] });
      for (let i = 0; i < 44; i++) {
        const dx = to.x - s.x, dz = to.z - s.z;
        const rounding = curve && i < c.turn;
        const dir = rounding ? c.steer : Math.atan2(dz - s.vz * .19, dx - s.vx * .19);
        const len = rounding ? 1 : Math.min(1, Math.hypot(dx, dz) / 1.1);
        phys.step({ moveX: Math.cos(dir) * len, moveZ: Math.sin(dir) * len, jumpPressed: i === 0, jumpHeld: true });
        if (s.standingOn === boxes[c.start + 1]) return true;
      }
      return false;
    };
    expect(run(false)).toBe(false);
    expect(run(true)).toBe(true);
  });

  it('동굴의 낮은 천장은 큐브의 머리를 막지만 발판 사이를 건널 수 있다', () => {
    const cave = makeRoute(world.towers[3]);
    const [a, b] = cave.platforms.slice(2, 4);
    const ceiling = cave.barriers[0];
    const obstacles = [a, b].map((p) => ({ ...p, r: 0, top: p.y, collisionBottom: p.y - p.thickness }));
    const sim = new PhysicsWorld(world, a.x, a.z, { near: () => [...obstacles, { ...ceiling, r: 0, collisionBottom: ceiling.bottom }] });
    const s = sim.state;
    sim.teleport(a.x, a.y + HALF, a.z + .55);
    Object.assign(s, { grounded: true, vz: 5, standingOn: obstacles[0] });
    let max = s.y;
    for (let i = 0; i < 34; i++) {
      const dx = b.x - s.x, dz = b.z - s.z;
      const direction = Math.atan2(dz - s.vz * .16, dx - s.vx * .16);
      sim.step({ moveX: Math.cos(direction), moveZ: Math.sin(direction), jumpPressed: i === 0, jumpHeld: true });
      max = Math.max(max, s.y);
      if (s.standingOn === obstacles[1]) break;
    }
    expect(s.standingOn).toBe(obstacles[1]);
    expect(max + HALF).toBeLessThanOrEqual(ceiling.bottom + .051);
  });
});
