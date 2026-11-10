import * as THREE from 'three';
import type { Obstacle } from '../physics/world';
import { mulberry32 } from '../util/rand';
import { WORLD_R, type World } from './terrain';

// 저폴리·플랫 셰이딩 오픈월드. 황혼과 밤 사이를 오가는 하늘.
const CELL = 3;
const GRASS_A = new THREE.Color('#4fc3a8'), GRASS_B = new THREE.Color('#8e7bf0'), GRASS_C = new THREE.Color('#f2b25c');
const ROCK = new THREE.Color('#5b5080'), SNOW = new THREE.Color('#e8e4ff'), PLAZA = new THREE.Color('#cfc8f5');

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
    if (world.siteAt(x, z, -1)) c.lerp(PLAZA, 0.4);
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

/** 나무·바위·크리스털과 별가루가 놓인 돌기둥 계단 */
function decorate(world: World): Deco {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  const trees: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [], crys: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const rnd = mulberry32(77);
  const free = (x: number, z: number, pad: number) => !world.siteAt(x, z, pad);
  const slopeAt = (x: number, z: number) => Math.abs(world.height(x + 1.5, z) - world.height(x - 1.5, z)) + Math.abs(world.height(x, z + 1.5) - world.height(x, z - 1.5));

  for (let k = 0; k < 2600; k++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (WORLD_R - 25);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!free(x, z, 8)) continue;
    const y = world.height(x, z), slope = slopeAt(x, z);
    if (slope > 2.4 || y > 30) continue;
    const roll = rnd(), sc = 0.8 + rnd() * 0.8;
    q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
    if (roll < 0.62) {
      trees.push(m.compose(p.set(x, y - 0.1, z), q, s.set(sc, sc * (0.9 + rnd() * 0.7), sc)).clone());
      obstacles.push({ x, z, r: 0.45 * sc, top: Infinity });
    } else if (roll < 0.9) {
      rocks.push(m.compose(p.set(x, y, z), q, s.set(sc, sc * 0.7, sc)).clone());
      obstacles.push({ x, z, r: 0.85 * sc, top: y + 0.75 * sc });
    } else {
      crys.push(m.compose(p.set(x, y, z), q, s.set(sc * 0.6, sc * 1.4, sc * 0.6)).clone());
      obstacles.push({ x, z, r: 0.4 * sc, top: Infinity });
    }
  }

  // 돌기둥 계단: 한 번 점프로 오를 수 있는 간격으로 나선을 이루고, 꼭대기에 별가루
  const pillarGeo = new THREE.CylinderGeometry(1, 1.12, 1, 7);
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#8c82b8', flatShading: true });
  const capMat = new THREE.MeshLambertMaterial({ color: '#c9c0f0', flatShading: true });
  const dust: Dust[] = [];
  const dustGeo = new THREE.OctahedronGeometry(0.34, 0);
  let id = 0;
  for (let k = 0, tries = 0; k < 26 && tries < 400; tries++) {
    const a = rnd() * Math.PI * 2, d = 30 + Math.sqrt(rnd()) * (WORLD_R - 80);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    if (!free(cx, cz, 32) || slopeAt(cx, cz) > 1.2) continue;
    k++;
    const steps = 3 + Math.floor(rnd() * 4), dir = rnd() * Math.PI * 2, turn = rnd() < 0.5 ? 1 : -1;
    let px = cx, pz = cz;
    for (let i = 0; i < steps; i++) {
      if (i > 0) { const aa = dir + turn * i * 0.55; px += Math.cos(aa) * 3.4; pz += Math.sin(aa) * 3.4; }
      const ground = world.height(px, pz);
      const top = world.height(cx, cz) + 1.5 * (i + 1);
      const r = 1.15 - i * 0.05;
      const pl = new THREE.Mesh(pillarGeo, pillarMat);
      const bottom = Math.min(ground, top - 0.5) - 1;
      pl.scale.set(r, top - bottom, r);
      pl.position.set(px, (top + bottom) / 2, pz);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.12, 7), capMat);
      cap.position.set(px, top - 0.06, pz);
      group.add(pl, cap);
      obstacles.push({ x: px, z: pz, r: r, top });
      if (i === steps - 1) {
        const mesh = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: '#ffe27a' }));
        mesh.position.set(px, top + 1.1, pz);
        group.add(mesh);
        dust.push({ id: id++, x: px, y: top + 1.1, z: pz, mesh });
      }
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
  add(treeGeo, new THREE.MeshLambertMaterial({ color: '#2f7f7a', flatShading: true }), trees);
  add(t2, new THREE.MeshLambertMaterial({ color: '#3b9a8c', flatShading: true }), trees);
  add(trunk, new THREE.MeshLambertMaterial({ color: '#5a3c4a', flatShading: true }), trees);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0); rockGeo.translate(0, 0.35, 0);
  add(rockGeo, new THREE.MeshLambertMaterial({ color: '#6a6290', flatShading: true }), rocks);
  const cGeo = new THREE.OctahedronGeometry(0.7, 0); cGeo.translate(0, 0.7, 0);
  const crystals = add(cGeo, new THREE.MeshLambertMaterial({ color: '#7ff0ff', emissive: '#38c8ff', emissiveIntensity: 0.6, flatShading: true }), crys);
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
        void main(){ float y = vP.y; vec3 c = y > 0. ? mix(hor, top, pow(y, .55)) : mix(hor, low, pow(-y, .4));
        gl_FragColor = vec4(c, 1.); }`,
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
    lerp('#4b3f9e', '#0d0b26', this.uTop.value);
    lerp('#ff9a7a', '#4a2c6e', this.uHor.value);
    lerp('#6b4a9a', '#1a1238', this.uLow.value);
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
  const deco = decorate(world);
  scene.add(deco.group);
  return deco;
}
