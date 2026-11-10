import { it, expect } from 'vitest';
import { World, STORY_ROUTE_COUNT } from '../world/terrain';
import { PhysicsWorld, type PhysicsInput } from '../physics/world';
import { Tower } from './towers';
import { phaseState, hitsSweep } from './course-mechanisms';
import { mulberry32 } from '../util/rand';

it('all authored expedition jumps are possible in the game engine', () => {
  const world = new World(), rnd = mulberry32(126617);
  const missing: string[] = [];
  for (const site of world.towers.slice(STORY_ROUTE_COUNT)) {
    const tower = new Tower(world, site);
    const phys = new PhysicsWorld(world, site.x, site.z, { near: () => tower.obstacles });
    phys.abilities.dash = true;
    const s = phys.state;
    for (let i = 0; i < tower.plats.length - 1; i++) {
      const from = tower.plats[i], to = tower.plats[i + 1];
      const rise = to.spec.y - from.spec.y, distance = Math.hypot(to.spec.x - from.spec.x, to.spec.z - from.spec.z);
      const lift = rise > 4 ? tower.course.lifts?.find(l => Math.hypot(l.x - from.spec.x, l.z - from.spec.z) < 4) : undefined;
      const ring = distance > 10 ? tower.course.rings?.find(r => Math.hypot(r.x - from.spec.x, r.z - from.spec.z) < 7) : undefined;
      let found = 0;
      for (let j = 0; j < 700 && found < 3; j++) {
        const time = j ? rnd() * 8.2 : 0;
        const forward = Math.atan2((lift ?? to.spec).z - from.spec.z, (lift ?? to.spec).x - from.spec.x);
        const angle = forward + (j ? (rnd() - .5) * .58 : 0);
        const v = j ? rnd() * 8.5 : 3;
        const x = from.spec.x + (j ? (rnd() * 2 - 1) * from.spec.hx * .94 : 0);
        const z = from.spec.z + (j ? (rnd() * 2 - 1) * from.spec.hz * .94 : 0);
        const firstDash = ring ? 8 + Math.floor(rnd() * 15) : j > 380 && !lift ? 9 + Math.floor(rnd() * 10) : -1;
        let charged = false, secondDash = false, exitLift = false;
        phys.teleport(x, from.spec.y + .5, z);
        Object.assign(s, { vx: Math.cos(angle) * v, vz: Math.sin(angle) * v, grounded: true, onSteep: false, groundY: from.spec.y, standingOn: from.ob });
        const input: PhysicsInput = { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: true };
        tower.mechanisms?.reset();
        for (let k = 0; k < 190; k++) {
          for (const p of tower.plats) p.ob.disabled = !!p.spec.phase && phaseState(p.spec.phase, time + k / 60) === 'ghost';
          if (k === 0 && from.ob.disabled) break;
          if (lift && s.y > to.spec.y + (1.32 + j % 4 * .14)) exitLift = true;
          const destination = lift && !exitLift ? lift : ring && !charged ? ring : to.spec;
          const dx = destination.x - s.x, dz = destination.z - s.z;
          const heading = Math.atan2(dz - s.vz * .19, dx - s.vx * .19);
          const amount = Math.min(1, Math.hypot(dx, dz) / (lift && !exitLift ? 1.9 : 1.1));
          input.moveX = Math.cos(heading) * amount;
          input.moveZ = Math.sin(heading) * amount;
          input.jumpPressed = k === 0 && from.spec.kind !== 'sling';
          input.jumpHeld = k < (j % 4 === 3 && !lift && !ring ? 13 : 100);
          input.updraft = tower.mechanisms?.inUpdraft(s);
          input.dashPressed = k === firstDash || (!!ring && charged && !secondDash && s.dashT <= 1 / 60);
          if (charged && input.dashPressed) secondDash = true;
          phys.step(input);
          if (tower.mechanisms?.recharge(s)) charged = true;
          if (tower.course.sweeps?.some(sweep => hitsSweep(sweep, time + k / 60, s))) break;
          if (s.standingOn === to.ob || (to.spec.kind === 'sling' && s.launched && Math.hypot(s.x - to.spec.x, s.z - to.spec.z) < 2)) {
            if (ring && !secondDash) break;
            found++;
            break;
          }
          if (k > 8 && s.grounded && s.groundY < from.spec.y - .5) break;
        }
      }
      if (found < 3) missing.push(`${site.id} ${i}->${i + 1}: ${found}`);
    }
  }
  expect(missing).toEqual([]);
}, 30000);

it('relay platforms remain intangible until their matching switch is reached in order', () => {
  const world = new World();
  const tower = new Tower(world, world.towers[10]);
  const sim = new PhysicsWorld(world, tower.island.x, tower.island.z, { near: () => tower.obstacles });
  const switches = tower.plats.filter(p => p.spec.relay);
  const bridge = tower.plats.filter(p => p.spec.requires === 1);
  tower.step(1 / 60, sim.state);
  expect(bridge.every(p => p.ob.disabled)).toBe(true);
  sim.state.standingOn = switches[1].ob;
  expect(tower.takeRelay(sim.state)).toBe(false);
  sim.state.standingOn = switches[0].ob;
  expect(tower.takeRelay(sim.state)).toBe(true);
  tower.step(1 / 60, sim.state);
  expect(bridge.every(p => !p.ob.disabled)).toBe(true);
  expect(tower.plats.filter(p => p.spec.requires === 2).every(p => p.ob.disabled)).toBe(true);
  tower.resetExpedition();
  tower.step(1 / 60, sim.state);
  expect(bridge.every(p => p.ob.disabled)).toBe(true);
});
