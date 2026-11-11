import { describe, it, expect } from 'vitest';
import { MeteorShower, MeteorEvent, Meteor, FALL_TIME, LAND_LIFE, COIN_MIN, COIN_MAX, SKY_HEIGHT, SKY_SIDE, TARGET_MIN, TARGET_MAX, FADE_TIME, MAX_ACTIVE } from './meteors';
import { mulberry32 } from '../util/rand';

const FLAT = { height: () => 0 };
const PLAYER = { x: 0, y: 0, z: 0 };
const DT = 0.1;

/** dt씩 seconds만큼 진행하며 이벤트를 모은다 */
function run(shower: MeteorShower, seconds: number, night: number, player = PLAYER): MeteorEvent[] {
  const out: MeteorEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) out.push(...shower.step(DT, player, night));
  return out;
}

/** 밤에 생성 이벤트가 나는 순간까지 진행하고 그 별똥별을 돌려준다 */
function spawnOne(shower: MeteorShower, player = PLAYER): Meteor {
  for (let i = 0; i < 2000; i++) {
    const spawn = shower.step(DT, player, 0.9).find((e) => e.kind === 'spawn');
    if (spawn && spawn.kind === 'spawn') return spawn.meteor;
  }
  throw new Error('spawn 없음');
}

describe('MeteorShower', () => {
  it('낮에는 생성하지 않는다', () => {
    const shower = new MeteorShower({ height: FLAT.height, rand: mulberry32(1) });
    const events = run(shower, 300, 0.3);
    expect(events.filter((e) => e.kind === 'spawn')).toHaveLength(0);
    expect(shower.meteors).toHaveLength(0);
  });

  it('밤에는 25~40초 사이에 첫 별똥별이 생긴다', () => {
    const shower = new MeteorShower({ height: FLAT.height, rand: () => 0.5 });
    let elapsed = 0;
    let spawnedAt = -1;
    while (spawnedAt < 0 && elapsed < 60) {
      elapsed += DT;
      if (shower.step(DT, PLAYER, 0.9).some((e) => e.kind === 'spawn')) spawnedAt = elapsed;
    }
    expect(spawnedAt).toBeGreaterThanOrEqual(25);
    expect(spawnedAt).toBeLessThanOrEqual(40 + DT);
  });

  it('목표는 플레이어에서 14~32m, 하늘은 목표 위 60m / 옆 30m에서 시작한다', () => {
    const shower = new MeteorShower({ height: () => 3, rand: mulberry32(7) });
    const player = { x: 10, y: 3, z: -5 };
    const m = spawnOne(shower, player);
    expect(m.phase).toBe('falling');
    expect(m.ty).toBe(3);
    const d = Math.hypot(m.tx - player.x, m.tz - player.z);
    expect(d).toBeGreaterThanOrEqual(TARGET_MIN);
    expect(d).toBeLessThanOrEqual(TARGET_MAX);
    // 생성 스텝에서는 아직 낙하 보간 전이라 현재 위치가 하늘 시작점이다
    expect(m.t).toBe(0);
    expect(m.y).toBeCloseTo(m.ty + SKY_HEIGHT, 5);
    expect(Math.hypot(m.x - m.tx, m.z - m.tz)).toBeCloseTo(SKY_SIDE, 5);
  });

  it('낙하 후 impact 이벤트가 나고 목표 지점에 착지한다', () => {
    const shower = new MeteorShower({ height: FLAT.height, rand: mulberry32(3) });
    const m = spawnOne(shower);
    const impact = run(shower, FALL_TIME + 0.3, 0).find((e) => e.kind === 'impact');
    expect(impact).toBeDefined();
    if (!impact || impact.kind !== 'impact') return;
    expect(impact.meteor).toBe(m);
    expect(m.phase).toBe('landed');
    expect(m.x).toBe(m.tx);
    expect(m.y).toBe(m.ty);
    expect(m.z).toBe(m.tz);
  });

  it('착지한 조각 위치에 가면 수집되고 코인을 준다', () => {
    const shower = new MeteorShower({ height: FLAT.height, rand: mulberry32(11) });
    const m = spawnOne(shower);
    run(shower, FALL_TIME + 0.2, 0);
    expect(m.phase).toBe('landed');
    const events = shower.step(DT, { x: m.x, y: m.y, z: m.z }, 0);
    const collect = events.find((e) => e.kind === 'collect');
    expect(collect).toBeDefined();
    if (!collect || collect.kind !== 'collect') return;
    expect(collect.coins).toBeGreaterThanOrEqual(COIN_MIN);
    expect(collect.coins).toBeLessThanOrEqual(COIN_MAX);
    expect(shower.meteors).toHaveLength(0);
  });

  it('낙하 중인 별똥별은 수집되지 않는다', () => {
    const shower = new MeteorShower({ height: FLAT.height, rand: mulberry32(11) });
    const m = spawnOne(shower);
    // 목표 지점 바로 위에 플레이어를 둬도 낙하 중이면 수집 안 됨
    const events = shower.step(DT, { x: m.tx, y: m.ty, z: m.tz }, 0);
    expect(m.phase).toBe('falling');
    expect(events.some((e) => e.kind === 'collect')).toBe(false);
    expect(shower.meteors).toHaveLength(1);
  });

  it('착지 후 20초가 지나면 expire 되고, 마지막 5초 동안 fading이 켜진다', () => {
    const shower = new MeteorShower({ height: FLAT.height, rand: mulberry32(5) });
    const m = spawnOne(shower);
    run(shower, FALL_TIME + 0.1, 0);
    expect(m.phase).toBe('landed');
    expect(m.life).toBeCloseTo(LAND_LIFE - 0.1, 5);

    run(shower, LAND_LIFE - FADE_TIME - 1, 0);
    expect(m.fading).toBe(false);
    run(shower, 1.5, 0);
    expect(m.fading).toBe(true);

    const events = run(shower, 5, 0);
    expect(events.some((e) => e.kind === 'expire')).toBe(true);
    expect(shower.meteors).toHaveLength(0);
  });

  it('낮이 되어도 남아 있는 별똥별은 낙하와 만료를 계속한다', () => {
    const shower = new MeteorShower({ height: FLAT.height, rand: mulberry32(9) });
    spawnOne(shower);
    const events = run(shower, LAND_LIFE + FALL_TIME + 1, 0.1);
    expect(events.some((e) => e.kind === 'impact')).toBe(true);
    expect(events.some((e) => e.kind === 'expire')).toBe(true);
  });

  it('동시 개수는 MAX_ACTIVE를 넘지 않는다', () => {
    const shower = new MeteorShower({ height: FLAT.height, rand: mulberry32(2) });
    let max = 0;
    for (let i = 0; i < 3000; i++) {
      shower.step(DT, PLAYER, 0.9);
      max = Math.max(max, shower.meteors.length);
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(MAX_ACTIVE);
  });

  it('물 아래 목표는 고르지 않는다', () => {
    const shower = new MeteorShower({ height: () => -5, rand: mulberry32(4) });
    const events = run(shower, 200, 0.9);
    expect(events.filter((e) => e.kind === 'spawn')).toHaveLength(0);
  });

  it('너무 가파른 곳은 고르지 않는다', () => {
    const shower = new MeteorShower({ height: (x) => x * 3, rand: mulberry32(4) });
    const events = run(shower, 200, 0.9);
    expect(events.filter((e) => e.kind === 'spawn')).toHaveLength(0);
  });
});
