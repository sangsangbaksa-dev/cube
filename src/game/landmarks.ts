import * as THREE from 'three';
import type { Obstacle } from '../physics/world';
import { mulberry32 } from '../util/rand';
import { STORY_ROUTE_COUNT, type Site, type World } from '../world/terrain';
import { routeInfo, type RouteCourse } from './routes';

const BOX = new THREE.BoxGeometry();
const STONE = new THREE.DodecahedronGeometry(1, 0);
const CRYSTAL = new THREE.OctahedronGeometry(1, 0);
const cylinder = new THREE.CylinderGeometry(.87, 1, 1, 8);

export function buildLandmark(world: World, site: Site, course: RouteCourse, group: THREE.Group, solids: Obstacle[]) {
  const { x, y, z, id } = site;
  const root = new THREE.Group();
  root.position.set(x, y, z);
  group.add(root);
  const rnd = mulberry32(74 + id * 156);
  const color = new THREE.Color(routeInfo(site).color);
  const stone = new THREE.MeshLambertMaterial({ color: color.clone().lerp(new THREE.Color('#242737'), .74), flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: '#33334c', flatShading: true });
  const shade = new THREE.MeshLambertMaterial({ color: '#24243a', flatShading: true });
  const edge = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(.57), flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color });
  const crystalMat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: .32, flatShading: true });
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, sx: number, sy: number, sz: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.scale.set(sx, sy, sz);
    root.add(m);
    return m;
  };
  const rock = (px: number, py: number, pz: number, sx: number, sy: number, sz: number, mat = stone) => {
    const m = mesh(STONE, mat, px, py, pz, sx, sy, sz);
    m.rotation.set((rnd() - .5) * .4, rnd() * Math.PI, (rnd() - .5) * .4);
    return m;
  };
  const crystal = (px: number, py: number, pz: number, h: number) => {
    const m = mesh(CRYSTAL, crystalMat, px, py + h * .54, pz, h * .31, h, h * .3);
    m.rotation.set((rnd() - .5) * .6, rnd() * 5, (rnd() - .5) * .65);
    return m;
  };
  const band = (px: number, py: number, pz: number, r: number, tint: THREE.Material = edge) =>
    mesh(cylinder, tint, px, py, pz, r, .24, r);
  const start = course.platforms[0], sx = start.x - x, sz = start.z - z;
  // 입구의 두 짧은 표식은 먼 거리에서 보이는 빛기둥과 같은 색이다.
  for (const sign of [-1, 1]) {
    const px = sx + sign * (start.hx + .7), pz = sz + .25;
    const h = world.height(x + px, z + pz) - y;
    mesh(cylinder, dark, px, h + .67, pz, .24, 1.4, .24);
    mesh(CRYSTAL, glow, px, h + 1.44, pz, .27, .46, .27);
  }
  if (id > STORY_ROUTE_COUNT) {
    const next = course.platforms[1];
    const entrance = new THREE.Group();
    entrance.position.set(sx, start.y - y, sz);
    entrance.rotation.y = Math.atan2(next.x - start.x, next.z - start.z);
    root.add(entrance);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(BOX, stone);
      post.scale.set(.43, 3.3, .64);
      post.position.set(side * 2.25, 1.32, -.7);
      entrance.add(post);
      const cap = new THREE.Mesh(CRYSTAL, glow);
      cap.scale.set(.27, .47, .27);
      cap.position.set(side * 2.25, 3.13, -.7);
      entrance.add(cap);
    }
    const lintel = new THREE.Mesh(BOX, edge);
    lintel.scale.set(4.98, .32, .62);
    lintel.position.set(0, 2.99, -.7);
    entrance.add(lintel);
  }
  for (const b of course.barriers) {
    const px = b.x - x, pz = b.z - z, py = (b.bottom + b.top) * .5 - y;
    const low = id === 4 && b.kind === 'ceiling' && b.bottom - y < 4;
    mesh(BOX, id === 4 ? low ? dark : shade : dark, px, py, pz, b.hx * 2, b.top - b.bottom, b.hz * 2);
    if (id !== 4) {
      // 벽의 바깥 모서리에만 빛을 달아 우회하는 방향을 보여 준다.
      const far = id === 5 ? pz - b.hz : px - b.hx;
      const wx = id === 5 ? px : far, wz = id === 5 ? far : pz;
      const h = b.top - b.bottom;
      mesh(BOX, glow, wx, py, wz, .15, h * .94, .15);
      for (let j = 1; j < 5; j++) mesh(BOX, edge, px, b.bottom - y + j * h / 5, pz, b.hx * 2 + .06, .095, b.hz * 2 + .06);
    }
  }

  if (id === 1) {
    for (const p of course.platforms.slice(1)) {
      const py = p.y - y;
      rock(p.x - x, py * .33 - .5, p.z - z, p.hx * .84, py * .57 + .7, p.hz * .83);
    }
    for (const [px, pz, h] of [[-8, -3, 3.6], [-6, -7, 2.4], [3, -7, 1.8], [8, -3, 2.7]]) {
      rock(px, .3, pz, 1.2, 1.1, 1.1);
      crystal(px, .6, pz, h);
    }
  }
  if (id === 8) {
    for (const [px, pz, h] of [[14, 1, 5.4], [5, 3, 7.2], [-2, -6, 8.4], [-11, 9, 7.1], [-17, 1, 10]]) {
      mesh(cylinder, stone, px, h / 2 - .45, pz, .74, h, .74);
      band(px, h - .52, pz, .81);
      const moon = mesh(new THREE.TorusGeometry(.69, .09, 6, 24, Math.PI * 1.52), glow, px, h + .1, pz, 1, 1, 1);
      moon.rotation.y = .32;
      moon.rotation.z = -.42;
    }
  }
  if (id === 9) {
    for (const [px, pz, h] of [[-6.5, -12, 6.2], [3.5, -12, 4.1], [10.6, -7.1, 7.2], [14.4, 1, 5.3], [12.4, 10.1, 6.8], [2, 13.6, 3.5], [-8.9, 15.9, 5.6]]) {
      rock(px, .4, pz, 2.4, 1.2, 2.1);
      crystal(px, .5, pz, h * .63);
      crystal(px + 1.1, .28, pz - .65, h * .31);
    }
  }
  if (id === 10) {
    for (const p of course.platforms.filter(p => p.launchVector)) {
      const px = p.x - x, py = p.y - y, pz = p.z - z;
      mesh(cylinder, shade, px, (py - .65) / 2, pz, 1, py + .45, 1);
      for (let j = 1; j <= 3; j++) band(px, py * j / 4, pz, 1.13, j === 2 ? glow : edge);
    }
    for (const [px, pz] of [[-9, 5.8], [2, -9.5], [15, -.2], [17, 16.7]]) {
      mesh(BOX, dark, px, 1.8, pz, 1.12, 4.2, 1.12).rotation.z = .17;
      mesh(BOX, glow, px - .26, 3.45, pz, .56, .12, 1.18);
    }
  }
  if (id === 11) {
    for (const [px, pz, height] of [[14, 3, 4.5], [2, -3.4, 7], [-8.5, 9.5, 8.2], [-15, -4, 10.9], [0, -12.2, 13]]) {
      mesh(BOX, dark, px, height * .5 - .4, pz, .68, height, 1.25);
      mesh(BOX, edge, px, height - .39, pz, 1.1, .23, 1.7);
      mesh(BOX, glow, px + .35, height * .58, pz, .042, height * .65, .16);
      crystal(px, height - .28, pz, .9);
    }
  }
  if (id === 12) {
    mesh(cylinder, shade, 0, 2.5, 0, 1.46, 5.7, 1.46);
    band(0, 5.51, 0, 1.44, glow);
    band(0, 3.92, 0, 1.41);
    const rim = new THREE.TorusGeometry(9.43, .07, 5, 56);
    mesh(rim, edge, 0, .1, 0, 1, 1, 1).rotation.x = Math.PI / 2;
    for (let j = 0; j < 12; j++) {
      const a = j * Math.PI / 6;
      mesh(BOX, stone, Math.cos(a) * 10.11, .17, Math.sin(a) * 10.11, .77, .35, 1.05).rotation.y = -a;
    }
  }
  if (id === 13) {
    const sail = new THREE.ConeGeometry(1.2, 3.3, 3);
    for (const [px, pz, height] of [[-8.5, 11.7, 10.2], [.4, 6.5, 15], [11.5, 1.6, 21.5], [10.1, -10, 26], [-3.2, -18.2, 28]]) {
      const mast = mesh(cylinder, stone, px, height / 2 - .42, pz, .48, height, .48);
      mast.rotation.z = -.055;
      const wing = mesh(sail, crystalMat, px + height * .027, height + .5, pz, 1.2, .86, .44);
      wing.rotation.z = .96;
    }
  }
  if (id === 14) {
    for (const p of course.platforms.filter(p => p.kind === 'checkpoint' || p.kind === 'goal')) {
      const h = p.y - y;
      mesh(cylinder, shade, p.x - x, h / 2 - .62, p.z - z, .79, h + .25, .79);
      band(p.x - x, h - 1.15, p.z - z, .85, glow);
    }
    for (const [px, pz, h] of [[-18, 8, 5], [-4, 17, 4.2], [9, 9, 5.4], [19, -9, 7.8], [6, -22, 11]]) {
      crystal(px, .2, pz, h);
    }
  }
  if (id === 2) {
    const top = course.goal.y - y + 1;
    mesh(cylinder, stone, 0, top / 2 - .5, 0, 2.5, top + 1, 2.5);
    for (let h = 1; h < top; h += 3.5) band(0, h, 0, 2.52 - h * .013);
    mesh(CRYSTAL, crystalMat, 0, top + .9, 0, 1.15, 2.5, 1.15);
    solids.push({ x, z, r: 2.32, top: Infinity });
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      mesh(BOX, dark, Math.cos(a) * 2.15, 2, Math.sin(a) * 2.15, .78, 4, .78);
    }
  }
  if (id === 3) {
    const water = new THREE.MeshPhongMaterial({ color: '#2b777d', shininess: 70, emissive: '#2d7775', emissiveIntensity: .24 });
    mesh(BOX, water, 2, .03, .1, 41, .08, 6.3);
    for (const sign of [-1, 1]) {
      for (let k = -4; k <= 4; k++) {
        const px = k * 4.8, pz = sign * 4.2 + px * .14;
        const h = 2.4 + (k + 4) * .61;
        mesh(BOX, stone, px, h / 2 - .2, pz, .78, h + .4, .78);
        mesh(BOX, edge, px, h, pz, 1.05, .24, 1.05);
        if (k < 4 && (k + 4) % 3 !== 2) mesh(BOX, dark, px + 2.4, h - .15, pz + .34, 4.8, .37, .38).rotation.z = .12;
      }
    }
    for (let k = 0; k < 14; k++) mesh(BOX, glow, -17 + rnd() * 38, .086, -.2 + (rnd() - .5) * 5, .35 + rnd() * 2, .01, .022);
  }
  if (id === 4) {
    // 바깥은 암산, 안쪽에는 충돌 형태가 정확한 벽과 낮은 천장.
    for (let i = 0; i < 29; i++) {
      const side = i % 2 ? 1 : -1, pz = -18 + (i / 28) * 43;
      rock(side * (12.7 + rnd() * 1.6), 5 + rnd() * 3, pz, 3.4 + rnd() * 1.5, 7 + rnd() * 2, 3.3 + rnd() * 1.4, i % 3 ? stone : dark);
      if (i % 2 === 0) rock((rnd() - .5) * 17, 13.25 + rnd() * 1.1, pz + .8, 4.5 + rnd() * 1.3, 2.5 + rnd() * 3.0, 4 + rnd() * 2, i % 3 ? dark : stone);
    }
    for (let k = 0; k < 8; k++) {
      rock(-10 + k * 2.9, 4.4 + rnd() * 2, 27.3, 3.6, 8.4 + rnd() * 3, 2.8, dark);
    }
    for (const sign of [-1, 1]) {
      rock(sign * 7.8, 4, -20, 4.2, 7.5, 2.85);
      crystal(sign * 4.6, -.4, -22.6, 2.7);
      mesh(BOX, edge, sign * 3.15, 2.6, -20, .58, 5.45, .93);
    }
    mesh(BOX, edge, 0, 5.32, -20, 6.85, .55, 1.08);
    mesh(CRYSTAL, glow, 0, 5.05, -20.58, .37, .37, .27);
    const pool = new THREE.MeshPhongMaterial({ color: '#1c4957', emissive: '#24516d', emissiveIntensity: .25, shininess: 100 });
    mesh(BOX, pool, 0, -3.05, 4.1, 21.5, .13, 36.4);
    const glint = new THREE.MeshBasicMaterial({ color: '#76accb', transparent: true, opacity: .42 });
    for (let i = 0; i < 37; i++) {
      mesh(BOX, glint, (rnd() - .5) * 20, -2.979, -13 + rnd() * 35, .22 + rnd() * 2.5, .006, .035);
      if (i < 24) {
        const side = i % 2 ? 1 : -1, px = side * (7.8 + rnd() * 1.8), pz = -15 + rnd() * 39;
        rock(px, -2.8, pz, 1.2, 1.3, 1.1, shade);
        crystal(px, -2.65, pz, .8 + rnd() * 3.5);
      }
      if (i < 22) {
        const px = (rnd() - .5) * 19, pz = -15 + rnd() * 39, h = 1.5 + rnd() * 4;
        mesh(new THREE.ConeGeometry(.7 + rnd() * .4, h, 5), stone, px, 11.9 - h * .5, pz, 1, 1, 1).rotation.z = Math.PI;
      }
    }
    const warning = new THREE.MeshBasicMaterial({ color: '#e9b684' });
    for (const px of [-2.7, 2.7]) for (const pz of [-16.99, -6.12]) {
      mesh(BOX, warning, px, 2.82, pz, .52, .16, .12);
    }
    const nearLight = new THREE.PointLight('#b696ff', 40, 16, 2);
    nearLight.position.set(-3.5, 3.75, -11);
    const farLight = new THREE.PointLight('#81bed5', 125, 23, 2);
    farLight.position.set(7.5, 7.2, 13.5);
    root.add(nearLight, farLight);
    for (const [px, pz, h] of [[-3.2, -15, 1.3], [3.45, -8.5, 1.6], [-5.1, 2, 2.4], [6.8, 21.9, 4.8]]) crystal(px, h - 1.2, pz, h);
  }
  if (id === 5 || id === 6) {
    const [u, v] = id === 5 ? [3, 4] : [7, 8];
    const a = course.platforms[u], b = course.platforms[v];
    const points = [a, b].map((p) => new THREE.Vector3(p.x - x, p.y - y + .018, p.z - z));
    const signX = id === 5 ? 0 : -1, signZ = id === 5 ? -1 : 0;
    for (const [i, p] of points.entries()) for (let j = 0; j < 3; j++) {
      const k = .53 + j * .15, cross = (j - 1) * .18;
      mesh(BOX, glow, p.x + signX * k + signZ * cross, p.y, p.z + signZ * k + signX * cross,
        id === 5 ? .13 : .22, .019, id === 5 ? .22 : .13).rotation.y = (i === 0 ? 1 : -1) * .45;
    }
  }
  if (id === 5) {
    for (const i of [-1, 1]) for (let k = 0; k < 4; k++) {
      const a = .4 + k * 1.37, r = 12.5 + i * 1.6;
      rock(Math.cos(a) * r, 1.4, Math.sin(a) * r, 1.25, 3 + rnd() * 3, 1.45);
    }
    for (let j = 0; j < 3; j++) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < 100; i++) {
        const f = i / 99, a = f * Math.PI * 5.4 + j * 2.1, r = 1.55 + f * 2.75;
        points.push(new THREE.Vector3(Math.cos(a) * r, 2 + f * 24, Math.sin(a) * r));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 100, j === 0 ? .09 : .042, 4, false);
      root.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: j === 0 ? '#b4e3ff' : '#84abd9', transparent: true, opacity: j === 0 ? .74 : .43 })));
    }
    for (let k = 0; k < 11; k++) {
      const a = k * 2.399, r = 1.9 + k * .15;
      rock(Math.cos(a) * r, 2 + k * 2.1, Math.sin(a) * r, .55 + rnd() * .9, .46 + rnd() * .6, .62 + rnd() * .7);
    }
  }
  if (id === 6) {
    const ember = new THREE.MeshBasicMaterial({ color: '#be664f' });
    for (let k = 0; k < 14; k++) {
      const a = .4 + k * Math.PI * 2 / 14, r = 17.5 + (rnd() - .5) * 8;
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      const h = 4 + rnd() * 9;
      rock(px, h * .29, pz, 1.5 + rnd() * 2, h * .8, 1.6 + rnd() * 1.5, k % 3 === 0 ? stone : dark);
      if (k % 2 === 0) mesh(CRYSTAL, ember, px + .9, .85, pz, .46, 1.3, .38);
    }
    const slag = mesh(BOX, new THREE.MeshPhongMaterial({ color: '#593837', emissive: '#b84932', emissiveIntensity: .17, shininess: 16 }), 0, .05, 2, 27, .1, 20);
    slag.rotation.y = -.24;
    for (let k = 0; k < 14; k++) {
      const px = (rnd() - .5) * 21, pz = 2 + (rnd() - .5) * 15;
      const streak = mesh(BOX, ember, px, .11, pz, 1 + rnd() * 2.8, .01, .036);
      streak.rotation.y = rnd() * 4;
    }
  }
  if (id === 7) {
    mesh(BOX, shade, 0, 2.08, -.7, 16.18, 4.7, 14.98);
    solids.push({ x, z: z - .7, r: 0, hx: 8.09, hz: 7.49, top: y + 4.34 });
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      mesh(cylinder, stone, dx * 7.9, 3.1, dz * 7.4 - .7, 1.17, 7.8, 1.17);
      band(dx * 7.9, 6.6, dz * 7.4 - .7, 1.2);
      crystal(dx * 7.9, 6.6, dz * 7.4 - .7, 1.27);
    }
    const line = new THREE.Mesh(new THREE.RingGeometry(5.78, 5.84, 36), new THREE.MeshBasicMaterial({ color: '#a180d5', transparent: true, opacity: .75, depthWrite: false }));
    line.position.set(0, 4.822, -.7);
    line.rotation.x = -Math.PI / 2;
    root.add(line);
    for (const side of [-1, 1]) {
      mesh(cylinder, dark, side * 3.1, 2.3, 11, .61, 5.6, .61);
      crystal(side * 3.1, 4.9, 11, 1.35);
    }
  }
}
