import { describe, expect, it } from 'vitest';
import {
  AIR_JUMP_HEIGHT, DASH_SPEED, HALF, JUMP_HEIGHT, PhysicsWorld, type Obstacle, type PhysicsInput,
} from './world';
import type { Terrain } from './terrain';

const flat: Terrain = { height: () => 0 };
const idle: PhysicsInput = { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false };
const src = (list: Obstacle[]) => ({ near: () => list });

function run(w: PhysicsWorld, n: number, inp: PhysicsInput = idle) {
  for (let i = 0; i < n; i++) w.step(inp);
}

describe('이단 점프', () => {
  it('능력이 있으면 공중에서 한 번 더 뛴다', () => {
    const w = new PhysicsWorld(flat);
    w.abilities.airJumps = 1;
    run(w, 3);
    w.step({ ...idle, jumpPressed: true, jumpHeld: true });
    let peak = 0;
    // 꼭대기 근처에서 두 번째 점프
    for (let i = 0; i < 22; i++) { w.step({ ...idle, jumpHeld: true }); peak = Math.max(peak, w.state.y); }
    w.step({ ...idle, jumpPressed: true, jumpHeld: true });
    expect(w.state.airJumped).toBe(true);
    for (let i = 0; i < 80; i++) { w.step({ ...idle, jumpHeld: true }); peak = Math.max(peak, w.state.y); }
    expect(peak - HALF).toBeGreaterThan(JUMP_HEIGHT + AIR_JUMP_HEIGHT * 0.8);
    // 세 번째는 안 된다
    run(w, 5, { ...idle, jumpHeld: true });
    expect(w.state.grounded).toBe(true);
  });

  it('착지하면 공중 점프가 다시 채워진다', () => {
    const w = new PhysicsWorld(flat);
    w.abilities.airJumps = 1;
    w.step({ ...idle, jumpPressed: true, jumpHeld: true });
    run(w, 5);
    w.step({ ...idle, jumpPressed: true });
    expect(w.state.airJumpsLeft).toBe(0);
    run(w, 120);
    expect(w.state.grounded).toBe(true);
    expect(w.state.airJumpsLeft).toBe(1);
  });
});

describe('대시', () => {
  it('잠겨 있으면 아무 일도 없다', () => {
    const w = new PhysicsWorld(flat);
    w.step({ ...idle, dashPressed: true, faceX: 1, faceZ: 0 });
    expect(w.state.dashed).toBe(false);
  });
  it('바라보는 방향으로 빠르게 나아가고 재사용 대기가 있다', () => {
    const w = new PhysicsWorld(flat);
    w.abilities.dash = true;
    w.step({ ...idle, dashPressed: true, faceX: 1, faceZ: 0 });
    expect(w.state.dashed).toBe(true);
    expect(w.state.vx).toBeGreaterThan(DASH_SPEED * 0.9);
    run(w, 15);
    expect(w.state.x).toBeGreaterThan(2.5);
    w.step({ ...idle, dashPressed: true, faceX: 1, faceZ: 0 });
    expect(w.state.dashed).toBe(false); // 대기 중
  });
  it('공중 대시는 착지 전까지 한 번뿐이다', () => {
    const w = new PhysicsWorld(flat);
    w.abilities.dash = true;
    w.step({ ...idle, jumpPressed: true, jumpHeld: true });
    run(w, 3, { ...idle, jumpHeld: true });
    w.step({ ...idle, jumpHeld: true, dashPressed: true, faceX: 0, faceZ: 1 });
    expect(w.state.dashed).toBe(true);
    run(w, 30, { ...idle, jumpHeld: true });
    w.step({ ...idle, dashPressed: true, faceX: 0, faceZ: 1 });
    if (!w.state.grounded) expect(w.state.dashed).toBe(false);
  });
});

describe('내려찍기', () => {
  it('공중에서 빠르게 떨어지고 착지 이벤트를 남긴다', () => {
    const w = new PhysicsWorld(flat);
    w.teleport(0, 8, 0);
    w.step({ ...idle, slamPressed: true });
    expect(w.state.slamming).toBe(true);
    let landed = false;
    for (let i = 0; i < 60 && !landed; i++) { w.step(idle); landed = w.state.slamLanded; }
    expect(landed).toBe(true);
    expect(w.state.y).toBeCloseTo(HALF, 4);
    expect(w.state.slamming).toBe(false);
  });
  it('땅에서는 시작되지 않는다', () => {
    const w = new PhysicsWorld(flat);
    run(w, 3);
    w.step({ ...idle, slamPressed: true });
    expect(w.state.slamming).toBe(false);
  });
});

describe('떠 있는 상자 발판', () => {
  const plat: Obstacle = { x: 0, z: 0, r: 0, hx: 1.5, hz: 1.5, top: 3, collisionBottom: 2.4 };

  it('밑으로 걸어 지나가도 위로 순간이동하지 않는다', () => {
    const w = new PhysicsWorld(flat, -5, 0, src([plat]));
    run(w, 90, { ...idle, moveX: 1 });
    expect(w.state.x).toBeGreaterThan(3);
    expect(w.state.y).toBeCloseTo(HALF, 4);
  });

  it('아래에서 뛰면 머리를 부딪친다', () => {
    const w = new PhysicsWorld(flat, 0, 0, src([plat]));
    w.teleport(0, HALF, 0);
    run(w, 3);
    expect(w.state.y).toBeCloseTo(HALF, 4);
    w.step({ ...idle, jumpPressed: true, jumpHeld: true });
    let top = 0;
    for (let i = 0; i < 60; i++) { w.step({ ...idle, jumpHeld: true }); top = Math.max(top, w.state.y + HALF); }
    expect(top).toBeLessThanOrEqual(2.4 + 1e-6);
  });

  it('위에서 떨어지면 윗면에 선다', () => {
    const w = new PhysicsWorld(flat, 0, 0, src([plat]));
    w.teleport(0.5, 6, 0.5);
    run(w, 90);
    expect(w.state.grounded).toBe(true);
    expect(w.state.y).toBeCloseTo(3 + HALF, 4);
    expect(w.state.standingOn).toBe(plat);
  });

  it('옆에서 걸어오면 상자 옆면에 막힌다', () => {
    const tall: Obstacle = { x: 0, z: 0, r: 0, hx: 1, hz: 1, top: 2 };
    const w = new PhysicsWorld(flat, -4, 0.3, src([tall]));
    run(w, 120, { ...idle, moveX: 1 });
    expect(w.state.x).toBeLessThan(-1 - HALF * 0.85);
    expect(w.state.y).toBeCloseTo(HALF, 4);
  });
});

describe('움직이는 발판', () => {
  it('위에 선 큐브를 함께 옮긴다', () => {
    const plat: Obstacle = { x: 0, z: 0, r: 0, hx: 1.2, hz: 1.2, top: 2, collisionBottom: 1.4, dx: 0, dy: 0, dz: 0 };
    const w = new PhysicsWorld(flat, 0, 0, src([plat]));
    w.teleport(0, 3, 0);
    run(w, 60);
    expect(w.state.standingOn).toBe(plat);
    for (let i = 0; i < 60; i++) {
      plat.dx = 0.03; plat.x += 0.03;
      w.step(idle);
    }
    expect(w.state.x).toBeCloseTo(plat.x, 1);
    expect(w.state.grounded).toBe(true);
  });

  it('튕김 상자 위에 서면 하늘로 쏘아 올린다', () => {
    const pad: Obstacle = { x: 0, z: 0, r: 0, hx: 1, hz: 1, top: 1, launch: 1.7 };
    const w = new PhysicsWorld(flat, 0, 0, src([pad]));
    w.teleport(0, 3, 0);
    let launched = false;
    for (let i = 0; i < 60; i++) { w.step(idle); launched ||= w.state.launched; }
    expect(launched).toBe(true);
  });
});

describe('넉백', () => {
  it('충격을 받으면 날아가고 잠깐 조작이 약해진다', () => {
    const w = new PhysicsWorld(flat);
    run(w, 3);
    w.impulse(10, 6, 0, 0.3);
    expect(w.state.stunT).toBeGreaterThan(0);
    w.step({ ...idle, moveX: -1 });
    expect(w.state.vx).toBeGreaterThan(8);
    run(w, 60);
    expect(w.state.x).toBeGreaterThan(2);
  });
});
