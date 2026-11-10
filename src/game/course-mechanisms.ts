import * as THREE from 'three';
import { HALF, type PhysicsState } from '../physics/world';
import type { RouteCourse } from './routes';
import type { PlatformSpec } from './types';

const TAU = Math.PI * 2;
const palette = ['#d8eca9', '#8be8dc', '#ffd48d'];

export const relayColor = (number: number) => palette[number - 1] ?? palette[0];

export function phaseState(phase: NonNullable<PlatformSpec['phase']>, time: number): 'solid' | 'warning' | 'ghost' {
  const elapsed = ((time - phase.offset) % phase.period + phase.period) % phase.period;
  if (elapsed >= phase.on) return 'ghost';
  return elapsed > phase.on - .43 ? 'warning' : 'solid';
}

type Sweep = NonNullable<RouteCourse['sweeps']>[number];
const angleAt = (sweep: Sweep, time: number) => (time / sweep.period + sweep.offset) * TAU;

export function hitsSweep(sweep: Sweep, time: number, st: Pick<PhysicsState, 'x' | 'y' | 'z'>) {
  if (st.y - HALF > sweep.y + .24 || st.y + HALF < sweep.y - .25) return false;
  const a = angleAt(sweep, time);
  const x = st.x - sweep.x, z = st.z - sweep.z;
  const along = x * Math.cos(a) + z * Math.sin(a);
  return Math.abs(along) < sweep.radius && Math.abs(z * Math.cos(a) - x * Math.sin(a)) < .43;
}

export class CourseMechanisms {
  private readonly rotors: THREE.Group[] = [];
  private readonly air: THREE.Group[] = [];
  private readonly rings: THREE.Group[] = [];
  private readonly spentRings = new Set<number>();

  constructor(private readonly course: RouteCourse, group: THREE.Group) {
    const dark = new THREE.MeshLambertMaterial({ color: '#464052' });
    const fire = new THREE.MeshBasicMaterial({ color: '#ff947c' });
    for (const sweep of course.sweeps ?? []) {
      const rotor = new THREE.Group();
      rotor.position.set(sweep.x, sweep.y, sweep.z);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(sweep.radius * 2, .17, .38), dark);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sweep.radius * 2 + .035, .055, .39), fire);
      strip.position.y = .1;
      rotor.add(beam, strip);
      for (const sign of [-1, 1]) {
        const tip = new THREE.Mesh(new THREE.OctahedronGeometry(.24), fire);
        tip.position.x = sign * sweep.radius;
        rotor.add(tip);
      }
      this.rotors.push(rotor);
      group.add(rotor);
    }

    const windMat = new THREE.MeshBasicMaterial({ color: '#c4efbc', transparent: true, opacity: .54, depthWrite: false });
    for (const lift of course.lifts ?? []) {
      const wind = new THREE.Group();
      wind.position.set(lift.x, lift.y, lift.z);
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < 65; i++) {
        const f = i / 64, a = f * TAU * 2.15;
        points.push(new THREE.Vector3(Math.cos(a) * lift.radius, f * lift.height, Math.sin(a) * lift.radius));
      }
      const strand = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, .045, 4, false);
      const other = new THREE.Mesh(strand, windMat);
      other.rotation.y = Math.PI;
      wind.add(new THREE.Mesh(strand, windMat), other);
      const disk = new THREE.Mesh(new THREE.TorusGeometry(lift.radius, .06, 4, 26), windMat);
      disk.rotation.x = Math.PI / 2;
      wind.add(disk);
      this.air.push(wind);
      group.add(wind);
    }

    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffc9f1' });
    for (const ring of course.rings ?? []) {
      const marker = new THREE.Group();
      marker.position.set(ring.x, ring.y, ring.z);
      marker.rotation.y = ring.yaw;
      marker.add(new THREE.Mesh(new THREE.TorusGeometry(ring.radius, .085, 5, 32), ringMat));
      marker.add(new THREE.Mesh(new THREE.TorusGeometry(ring.radius + .14, .036, 4, 32), dark));
      for (let j = 0; j < 4; j++) {
        const angle = (j + .5) * TAU / 4;
        const accent = new THREE.Mesh(new THREE.OctahedronGeometry(.16), ringMat);
        accent.position.set(Math.cos(angle) * ring.radius, Math.sin(angle) * ring.radius, 0);
        marker.add(accent);
      }
      this.rings.push(marker);
      group.add(marker);
    }
  }

  reset() { this.spentRings.clear(); }

  inUpdraft({ x, y, z }: PhysicsState) {
    return this.course.lifts?.some(lift => y >= lift.y && y <= lift.y + lift.height
      && Math.hypot(x - lift.x, z - lift.z) < lift.radius) ?? false;
  }

  hit(time: number, st: PhysicsState) {
    return this.course.sweeps?.some(sweep => hitsSweep(sweep, time, st)) ?? false;
  }

  recharge(st: PhysicsState) {
    if (st.grounded || !(st.airDashUsed || st.dashCd > 0)) return false;
    const index = this.course.rings?.findIndex((ring, i) => !this.spentRings.has(i)
      && Math.hypot(st.x - ring.x, st.y - ring.y, st.z - ring.z) < ring.radius) ?? -1;
    if (index < 0) return false;
    this.spentRings.add(index);
    st.airDashUsed = false;
    st.dashCd = 0;
    return true;
  }

  draw(time: number) {
    this.rotors.forEach((rotor, i) => { rotor.rotation.y = -angleAt(this.course.sweeps![i], time); });
    this.air.forEach(wind => { wind.rotation.y = time * .86; });
    this.rings.forEach((ring, i) => {
      ring.scale.setScalar(this.spentRings.has(i) ? .91 : 1 + .024 * Math.sin(time * 4 + i));
    });
  }
}
