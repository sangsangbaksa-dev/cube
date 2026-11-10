import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMonsterModel, createOrb, createRiftCore, createShard } from './monsterModels';
import type { MonsterAnim, BaseKind as MonsterKind } from './types';

const KINDS: MonsterKind[] = ['slime', 'spiker', 'bat', 'caster', 'golem'];

const idle: MonsterAnim = {
  time: 0, moving: 0, airborne: false, vy: 0, telegraph: 0, attacking: false, hurt: 0, dying: 0, night: 0,
};

const states: MonsterAnim[] = [
  idle,
  { ...idle, time: 1.3, moving: 1, night: 1 },
  { ...idle, time: 2.1, airborne: true, vy: 6 },
  { ...idle, time: 3.0, telegraph: 1 },
  { ...idle, time: 3.5, attacking: true, moving: 0.5 },
  { ...idle, time: 4.0, hurt: 1 },
  { ...idle, time: 5.0, dying: 0.05 },
  { ...idle, time: 5.5, dying: 0.5 },
  { ...idle, time: 6.0, dying: 1 },
];

describe('createMonsterModel', () => {
  for (const kind of KINDS) {
    it(`creates ${kind} and animates through all states without throwing`, () => {
      const m = createMonsterModel(kind);
      expect(m.group).toBeInstanceOf(THREE.Group);
      expect(m.group.children.length).toBeGreaterThan(0);
      expect(m.height).toBeGreaterThan(0);
      expect(m.radius).toBeGreaterThan(0);
      for (const s of states) {
        expect(() => m.update(1 / 60, s)).not.toThrow();
      }
      // 죽음 완료 후에는 숨겨진다
      m.update(1 / 60, { ...idle, dying: 1 });
      expect(m.group.children[0].visible).toBe(false);
      m.dispose();
    });

    it(`${kind} has a finite, feet-origin bounding box`, () => {
      const m = createMonsterModel(kind);
      m.update(1 / 60, idle);
      const box = new THREE.Box3().setFromObject(m.group);
      expect(Number.isFinite(box.min.y)).toBe(true);
      expect(box.max.y).toBeGreaterThan(0.3);
      m.dispose();
    });
  }

  it('hurt flash raises the body emissive', () => {
    const m = createMonsterModel('slime');
    let maxEmissive = 0;
    m.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) {
        maxEmissive = Math.max(maxEmissive, o.material.emissiveIntensity);
      }
    });
    m.update(1 / 60, { ...idle, hurt: 1 });
    let flashed = 0;
    m.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) {
        flashed = Math.max(flashed, o.material.emissiveIntensity);
      }
    });
    expect(flashed).toBeGreaterThan(maxEmissive);
    m.dispose();
  });
});

describe('createOrb', () => {
  it('creates, updates and disposes', () => {
    const o = createOrb();
    expect(o.mesh).toBeDefined();
    expect(() => o.update(0.5)).not.toThrow();
    expect(() => o.dispose()).not.toThrow();
  });
});

describe('createRiftCore', () => {
  it('updates across hp, active and flash states', () => {
    const r = createRiftCore();
    expect(r.group).toBeInstanceOf(THREE.Group);
    expect(() => {
      r.update(0, 1, true);
      r.update(0.016, 0.5, true);
      r.flash();
      r.update(0.032, 0, true);
      r.update(0.1, 0.2, false);
    }).not.toThrow();
  });
});

describe('createShard', () => {
  it('creates and updates', () => {
    const s = createShard();
    expect(s.group).toBeInstanceOf(THREE.Group);
    expect(s.group.children.length).toBeGreaterThan(0);
    expect(() => s.update(1.25)).not.toThrow();
  });
});
