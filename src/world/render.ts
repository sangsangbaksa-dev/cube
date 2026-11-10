import * as THREE from 'three';
import { makeRoute, routeInfo } from '../game/routes';
import type { Obstacle } from '../physics/world';
import { mulberry32 } from '../util/rand';
import { WORLD_R, type World } from './terrain';

// 저폴리·플랫 셰이딩 오픈월드. 황혼과 밤 사이를 오가는 하늘.
const CELL = 3;
const GRASS_A = new THREE.Color('#587f73'), GRASS_B = new THREE.Color('#776f8b'), GRASS_C = new THREE.Color('#b48e64');
const ROCK = new THREE.Color('#5f596f'), SNOW = new THREE.Color('#c1bdd5'), PLAZA = new THREE.Color('#929086');

function terrainMesh(world: World): THREE.Mesh {
  const n = Math.floor((WORLD_R * 2 + 40) / CELL) + 1, half = (n - 1) * CELL / 2;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const c = new THREE.Color(), tmp = new THREE.Color();
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -half + i * CELL, z = -half + j * CELL, h = world.height(x, z);
    const k = (i * n + j) * 3;
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    const slope = Math.abs(h - world.height(x + 2, z)) + Math.abs(h - world.height(x, z + 2));
    const t = (Math.sin(x * 0.011) + Math.sin(z * 0.013 + 1.7) + Math.sin((x + z) * 0.007)) / 3 * 0.5 + 0.5;
    c.copy(GRASS_A).lerp(t < 0.5 ? GRASS_B : GRASS_C, Math.abs(t - 0.5) * 1.5);
    c.lerp(tmp.setScalar(0).add(c).multiplyScalar(0.9), (i * 7 + j * 13) % 5 * 0.04);
    if (slope > 2.2) c.lerp(ROCK, Math.min(1, (slope - 2.2) / 2));
    if (h > 26) c.lerp(SNOW, Math.min(1, (h - 26) / 14));
    const site = world.siteAt(x, z, 4);
    if (site) {
      const a = Math.hypot(x - site.x, z - site.z) / (site.r + 4);
      c.lerp(site.id === 6 ? ROCK : PLAZA, (1 - a * a) * .52);
    }
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = a + 1, d = a + n, e = d + 1;
    idx.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

export interface Dust { id: number; x: number; y: number; z: number; mesh: THREE.Mesh }
export interface Deco { obstacles: Obstacle[]; group: THREE.Group; crystals: THREE.InstancedMesh; dust: Dust[] }

interface Trail { site: World['home']; points: THREE.Vector3[] }
function makeTrails(world: World): Trail[] {
  return world.towers.map((site) => {
    const { x, z } = makeRoute(site).platforms[0];
    const length = Math.hypot(x, z), ax = x / length, az = z / length;
    const points: THREE.Vector3[] = [];
    for (let i = 0, n = Math.ceil(length / 1.6); i <= n; i++) {
      const t = i / n, along = 9 + t * (length - 9);
      const bend = Math.sin(t * Math.PI) ** 2 * Math.sin(t * 5.5 + site.id) * Math.min(length * .09, 16);
      const px = along * ax - bend * az, pz = along * az + bend * ax;
      points.push(new THREE.Vector3(px, world.height(px, pz), pz));
    }
    return { site, points };
  });
}

function trailSurface(world: World, trail: Trail): THREE.Mesh {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const c = new THREE.Color(), tint = new THREE.Color(routeInfo(trail.site).color), dust = new THREE.Color('#a39783');
  const points = trail.points;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(i + 1, points.length - 1)];
    const dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz);
    for (let j = 0; j < 5; j++) {
      const w = (j - 2) * (.55 + .11 * Math.sin(i * .93 + trail.site.id));
      const x = p.x + dz / n * w, z = p.z - dx / n * w;
      positions.push(x, world.height(x, z) + .083, z);
      c.copy(dust).lerp(tint, .1 + .07 * Math.sin(i * .4)).multiplyScalar(j === 0 || j === 4 ? .78 : .94 + .05 * Math.sin(i * 2.7));
      colors.push(c.r, c.g, c.b);
      if (i < points.length - 1 && j < 4) {
        const k = i * 5 + j;
        indices.push(k, k + 5, k + 1, k + 1, k + 5, k + 6);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

/** 숲, 바위, 길가의 야생화와 별가루. */
function decorate(world: World, trails: Trail[]): Deco {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  const trees: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [], crys: THREE.Matrix4[] = [], flowers: THREE.Matrix4[] = [], grass: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const rnd = mulberry32(77);
  const free = (x: number, z: number, pad: number) => !world.siteAt(x, z, pad);
  const trailGrid = new Map<string, THREE.Vector3[]>();
  for (const { points } of trails) for (const a of points) {
    const k = `${Math.floor(a.x / 8)},${Math.floor(a.z / 8)}`;
    const cell = trailGrid.get(k) ?? [];
    if (!cell.length) trailGrid.set(k, cell);
    cell.push(a);
  }
  const onPath = (x: number, z: number) => {
    const gx = Math.floor(x / 8), gz = Math.floor(z / 8);
    for (let i = -1; i < 2; i++) for (let j = -1; j < 2; j++) {
      if (trailGrid.get(`${gx + i},${gz + j}`)?.some((a) => Math.hypot(a.x - x, a.z - z) < 3.2)) return true;
    }
    return false;
  };
  const slopeAt = (x: number, z: number) => Math.abs(world.height(x + 1.5, z) - world.height(x - 1.5, z)) + Math.abs(world.height(x, z + 1.5) - world.height(x, z - 1.5));
  const grassAt = (x: number, z: number) => {
    const sc = .53 + rnd() * .68;
    q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
    grass.push(m.compose(p.set(x, world.height(x, z) - .03, z), q, s.set(sc, sc, sc)).clone());
  };

  for (let k = 0; k < 3650; k++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (WORLD_R - 25);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!free(x, z, 5) || onPath(x, z)) continue;
    const y = world.height(x, z), slope = slopeAt(x, z);
    if (slope > 2.4 || y > 30) continue;
    const roll = rnd(), sc = 0.78 + rnd() * 1.24;
    const grove = Math.sin(x * .079 + Math.cos(z * .043)) + Math.cos(z * .096) * .62;
    q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
    if (roll < 0.62) {
      if (grove < -.28 && rnd() < .81) continue;
      trees.push(m.compose(p.set(x, y - 0.1, z), q, s.set(sc, sc * (0.9 + rnd() * 0.7), sc)).clone());
      obstacles.push({ x, z, r: 0.45 * sc, top: Infinity });
    } else if (roll < 0.9) {
      rocks.push(m.compose(p.set(x, y, z), q, s.set(sc, sc * 0.7, sc)).clone());
      obstacles.push({ x, z, r: 0.85 * sc, top: y + 0.75 * sc });
    } else {
      crys.push(m.compose(p.set(x, y, z), q, s.set(sc * 0.6, sc * 1.4, sc * 0.6)).clone());
      obstacles.push({ x, z, r: 0.4 * sc, top: Infinity });
    }
    if (k % 3 === 0) for (let j = 0; j < 3; j++) grassAt(x + rnd() * 4 - 2, z + rnd() * 4 - 2);
  }

  const dust: Dust[] = [];
  const dustGeo = new THREE.OctahedronGeometry(.27, 0);
  const dustMat = new THREE.MeshBasicMaterial({ color: '#ffe1a3' });
  const marker = new THREE.CylinderGeometry(.17, .23, 1, 5);
  const markerMat = new THREE.MeshLambertMaterial({ color: '#535366' });
  for (const trail of trails) {
    group.add(trailSurface(world, trail));
    const { points, site } = trail;
    const mat = new THREE.MeshBasicMaterial({ color: routeInfo(site).color });
    for (let i = 3; i < points.length - 3; i += 5) {
      const a = points[i], b = points[i + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const side = i % 2 ? 1 : -1;
      if (i === 3 || i % 15 === 3) {
        const x = a.x + dz / len * 1.95 * side, z = a.z - dx / len * 1.95 * side, y = world.height(x, z);
        const post = new THREE.Mesh(marker, markerMat);
        post.position.set(x, y + .52, z);
        const tip = new THREE.Mesh(dustGeo, mat); tip.position.set(x, y + 1.16, z); tip.scale.setScalar(.72);
        group.add(post, tip);
      }
      for (let k = 0; k < 8; k++) {
        const offset = 2.25 + rnd() * 3, shift = (rnd() - .5) * 5;
        const x = a.x + dx / len * shift + side * dz / len * offset, z = a.z + dz / len * shift - side * dx / len * offset;
        const y = world.height(x, z), sc = .22 + rnd() * .47;
        q.setFromEuler(new THREE.Euler(0, rnd() * 6, (rnd() - .5) * .33));
        if (k % 3 === 0) flowers.push(m.compose(p.set(x, y, z), q, s.set(sc, sc, sc)).clone());
        grassAt(x, z);
      }
    }
    for (const f of [.24, .51, .77]) {
      const a = points[Math.floor(points.length * f)];
      const mesh = new THREE.Mesh(dustGeo, dustMat);
      mesh.position.set(a.x, a.y + .8, a.z);
      group.add(mesh);
      dust.push({ id: dust.length, x: a.x, y: a.y + .8, z: a.z, mesh });
    }
  }

  const treeGeo = new THREE.ConeGeometry(1.1, 2.6, 6); treeGeo.translate(0, 2.4, 0);
  const t2 = new THREE.ConeGeometry(0.8, 1.9, 6); t2.translate(0, 3.6, 0);
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, 1.3, 5); trunk.translate(0, 0.65, 0);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((mm, k) => im.setMatrixAt(k, mm));
    im.count = list.length;
    group.add(im);
    return im;
  };
  const firs = add(treeGeo, new THREE.MeshLambertMaterial({ color: '#467a70', flatShading: true }), trees);
  const canopy = add(t2, new THREE.MeshLambertMaterial({ color: '#609482', flatShading: true }), trees);
  for (let k = 0; k < trees.length; k++) {
    const c = new THREE.Color().setHSL(.34 + rnd() * .13, .19, .65 + rnd() * .27);
    firs.setColorAt(k, c); canopy.setColorAt(k, c);
  }
  add(trunk, new THREE.MeshLambertMaterial({ color: '#5a3c4a', flatShading: true }), trees);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0); rockGeo.translate(0, 0.35, 0);
  add(rockGeo, new THREE.MeshLambertMaterial({ color: '#6a6290', flatShading: true }), rocks);
  const cGeo = new THREE.OctahedronGeometry(0.7, 0); cGeo.translate(0, 0.7, 0);
  const crystals = add(cGeo, new THREE.MeshLambertMaterial({ color: '#7ff0ff', emissive: '#38c8ff', emissiveIntensity: 0.6, flatShading: true }), crys);
  const blooms = add(new THREE.IcosahedronGeometry(.42, 0), new THREE.MeshLambertMaterial({ color: '#d9be97', flatShading: true }), flowers);
  blooms.geometry.translate(0, .62, 0);
  for (let k = 0; k < flowers.length; k++) blooms.setColorAt(k, new THREE.Color(k % 6 < 4 ? '#e0d6af' : k % 6 === 4 ? '#c3a1b7' : '#9ab5bc'));
  const stems = new THREE.CylinderGeometry(.049, .065, .64, 4); stems.translate(0, .32, 0);
  add(stems, new THREE.MeshLambertMaterial({ color: '#7d9580' }), flowers);
  const tufts: number[] = [];
  for (let k = 0; k < 6; k++) {
    const a = k * 2.399, x = Math.cos(a) * .28, z = Math.sin(a) * .28, h = .39 + rnd() * .33;
    tufts.push(x - .095, 0, z, x + .095, 0, z, x * 1.9 + .05, h, z * 1.9);
  }
  const blades = new THREE.BufferGeometry();
  blades.setAttribute('position', new THREE.Float32BufferAttribute(tufts, 3)); blades.computeVertexNormals();
  const grassMesh = add(blades, new THREE.MeshLambertMaterial({ color: '#91aa86', side: THREE.DoubleSide }), grass);
  for (let k = 0; k < grass.length; k++) grassMesh.setColorAt(k, new THREE.Color(k % 3 === 0 ? '#b6a589' : '#8fafad'));
  const courtyard = new THREE.Mesh(new THREE.RingGeometry(4.05, 8.8, 56), new THREE.MeshLambertMaterial({ color: '#9a9395' }));
  courtyard.rotation.x = -Math.PI / 2; courtyard.position.set(0, world.home.y + .042, 0);
  group.add(courtyard);
  const trim = new THREE.Mesh(new THREE.RingGeometry(8.7, 8.82, 56), new THREE.MeshBasicMaterial({ color: '#c9b6a6' }));
  trim.rotation.x = -Math.PI / 2; trim.position.set(0, world.home.y + .048, 0);
  group.add(trim);
  return { obstacles, group, crystals, dust };
}

/** 하늘 돔 + 구름 바다 + 별. night 0~1로 색이 바뀐다 */
export class Sky {
  readonly group = new THREE.Group();
  readonly sun = new THREE.DirectionalLight('#ffb889', 1.6);
  readonly hemi = new THREE.HemisphereLight('#b9a4ff', '#3a2a55', 1.4);
  private readonly uTop = { value: new THREE.Color() };
  private readonly uHor = { value: new THREE.Color() };
  private readonly uLow = { value: new THREE.Color() };
  private readonly uTime = { value: 0 };
  private readonly uNight = { value: 0 };
  private readonly stars: THREE.Points;
  private readonly sea: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: this.uTop, hor: this.uHor, low: this.uLow },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 low; varying vec3 vP;
        void main(){ vec3 d = normalize(vP); float y = d.y; vec3 c = y > 0. ? mix(hor, top, pow(y, .58)) : mix(hor, low, pow(-y, .4));
        float s = max(0., dot(d, normalize(vec3(-.58,.105,-.81))));
        c += vec3(.58,.23,.087) * pow(s, 22.) * hor.r + vec3(1.,.61,.33)*smoothstep(.99915,.99935,s)*hor.r;
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
        }`,
    }));
    dome.renderOrder = -10;
    this.group.add(dome);
    // 구름 바다: 아주 넓은 평면 위로 흐르는 노이즈
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { t: this.uTime, night: this.uNight, hor: this.uHor, low: this.uLow },
      vertexShader: 'varying vec2 vW; varying float vD; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xz; vD = length(w.xz - cameraPosition.xz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float t; uniform float night; uniform vec3 hor; uniform vec3 low; varying vec2 vW; varying float vD;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        void main(){ vec2 p = vW*.02 + vec2(t*.01, t*.006); float c = n(p)*.5 + n(p*2.3)*.3 + n(p*5.1)*.2;
          vec3 col = mix(low, hor, smoothstep(.35, .85, c) * (1. - night*.5));
          float fade = smoothstep(650., 150., vD);
          gl_FragColor = vec4(col, fade * (.55 + .45*c)); }`,
    }));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.visible = false;
    this.group.add(this.sea);
    const sp: number[] = [];
    const rnd = mulberry32(5);
    for (let k = 0; k < 900; k++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05, r = Math.sqrt(1 - y * y);
      sp.push(Math.cos(a) * r * 380, y * 380, Math.sin(a) * r * 380);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff4d6', size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.group.add(this.stars);
    scene.add(this.group, this.sun, this.sun.target, this.hemi);
  }

  /** night 0(황혼)~1(밤) */
  update(camera: THREE.Camera, time: number, night: number, fog: THREE.Fog) {
    this.group.position.copy(camera.position);
    this.sea.position.set(camera.position.x, -45, camera.position.z);
    this.uTime.value = time;
    this.uNight.value = night;
    const lerp = (a: string, b: string, out: THREE.Color) => out.set(a).lerp(new THREE.Color(b), night);
    lerp('#596994', '#141733', this.uTop.value);
    lerp('#e7a68a', '#585379', this.uHor.value);
    lerp('#8c7488', '#302944', this.uLow.value);
    fog.color.copy(this.uHor.value).lerp(this.uLow.value, 0.45);
    (this.stars.material as THREE.PointsMaterial).opacity = 0.15 + night * 0.85;
    this.sun.color.set('#ffb889').lerp(new THREE.Color('#8fa0ff'), night);
    this.sun.intensity = 1.7 - night * 1.0;
    this.hemi.intensity = 1.5 - night * 0.6;
    this.hemi.color.set('#c9b4ff').lerp(new THREE.Color('#6f6ad8'), night);
    this.sun.position.set(camera.position.x - 60, camera.position.y + 45 - night * 25, camera.position.z - 40);
    this.sun.target.position.copy(camera.position);
  }
}

export function buildWorld(world: World, scene: THREE.Scene): Deco {
  scene.add(terrainMesh(world));
  const deco = decorate(world, makeTrails(world));
  scene.add(deco.group);
  return deco;
}
