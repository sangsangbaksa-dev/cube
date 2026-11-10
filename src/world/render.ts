import * as THREE from 'three';
import type { Obstacle } from '../physics/world';
import { mulberry32 } from '../util/rand';
import { VOID, type Island, type World } from './islands';

// 저폴리·플랫 셰이딩 부유섬. 황혼과 밤 사이를 오가는 하늘, 발 아래 구름 바다.
const THEMES = [
  { top: '#5fd4b4', top2: '#3fa79a' }, // 집: 민트
  { top: '#8e7bf0', top2: '#6a58c9' }, // 보랏빛 이끼
  { top: '#f2b25c', top2: '#d48a45' }, // 호박색 들판
  { top: '#64c3f0', top2: '#3f8fd0' }, // 하늘색 풀
];
const ROCK = new THREE.Color('#3b3358');
const ROCK_DEEP = new THREE.Color('#1c1733');

function islandMesh(world: World, i: Island): THREE.Mesh {
  const rings = 22, seg = 56, R = i.r * 1.16;
  const pos: number[] = [], col: number[] = [];
  const th = THEMES[i.theme];
  const c1 = new THREE.Color(th.top), c2 = new THREE.Color(th.top2), c = new THREE.Color();
  const rnd = mulberry32(i.id * 99 + 1);
  const pts: THREE.Vector3[][] = [];
  for (let r = 0; r <= rings; r++) {
    const row: THREE.Vector3[] = [];
    for (let s = 0; s < (r === 0 ? 1 : seg); s++) {
      const a = (s / seg) * Math.PI * 2, rr = (r / rings) * R;
      const x = i.x + Math.cos(a) * rr, z = i.z + Math.sin(a) * rr;
      let y = world.height(x, z);
      if (y <= VOID + 1) y = i.y - 4; // 가장자리 밖은 절벽 위로 말아 넣는다
      row.push(new THREE.Vector3(x, y, z));
    }
    pts.push(row);
  }
  const push = (v: THREE.Vector3, col3: THREE.Color) => { pos.push(v.x, v.y, v.z); col.push(col3.r, col3.g, col3.b); };
  const shade = (v: THREE.Vector3) => {
    if (v.y < i.y - 1.6) return c.copy(ROCK);
    return c.copy(c1).lerp(c2, rnd() * 0.6);
  };
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3) => {
    const s = shade(a.y < b.y ? (a.y < d.y ? a : d) : (b.y < d.y ? b : d)).clone();
    push(a, s); push(b, s); push(d, s);
  };
  for (let s = 0; s < seg; s++) tri(pts[0][0], pts[1][(s + 1) % seg], pts[1][s]);
  for (let r = 1; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = pts[r][s], b = pts[r][(s + 1) % seg], d = pts[r + 1][s], e = pts[r + 1][(s + 1) % seg];
    tri(a, b, d); tri(b, e, d);
  }
  // 아랫면: 들쭉날쭉한 역원뿔 바위
  const outer = pts[rings];
  const depth = i.r * (1.1 + rnd() * 0.5);
  const mid: THREE.Vector3[] = outer.map((p) => {
    const k = 0.55 + rnd() * 0.15;
    return new THREE.Vector3(i.x + (p.x - i.x) * k, i.y - depth * (0.35 + rnd() * 0.15), i.z + (p.z - i.z) * k);
  });
  const tip = new THREE.Vector3(i.x + (rnd() - 0.5) * 4, i.y - depth, i.z + (rnd() - 0.5) * 4);
  for (let s = 0; s < seg; s++) {
    const n = (s + 1) % seg;
    const k = c.copy(ROCK).lerp(ROCK_DEEP, 0.3 + rnd() * 0.3).clone();
    push(outer[s], k); push(outer[n], k); push(mid[s], k);
    push(outer[n], k); push(mid[n], k); push(mid[s], k);
    const k2 = c.copy(ROCK_DEEP).clone();
    push(mid[s], k2); push(mid[n], k2); push(tip, k2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
}

function bridgeMesh(world: World): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  const plank = new THREE.BoxGeometry(1, 0.22, 1);
  const pos: number[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const mats: THREE.Matrix4[] = [];
  for (const b of world.bridges) {
    const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
    const yaw = Math.atan2(b.bx - b.ax, b.bz - b.az);
    const n = Math.ceil(len / 0.9);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = b.ax + (b.bx - b.ax) * t, z = b.az + (b.bz - b.az) * t;
      const y = world.height(x, z);
      if (y <= VOID + 1) continue;
      q.setFromEuler(new THREE.Euler(0, yaw + (k % 2 ? 0.03 : -0.03), 0));
      mats.push(m.compose(p.set(x, y - 0.11, z), q, s.set(b.w * 2, 1, 0.78)).clone());
    }
  }
  void geos; void pos;
  const mesh = new THREE.InstancedMesh(plank, new THREE.MeshLambertMaterial({ color: '#c58b5c', flatShading: true }), mats.length);
  mats.forEach((mm, k) => mesh.setMatrixAt(k, mm));
  return mesh;
}

export interface Deco { obstacles: Obstacle[]; group: THREE.Group; crystals: THREE.InstancedMesh }

/** 나무, 바위, 빛나는 크리스털. 광장(탑/균열/집 가운데)은 비워 둔다 */
function decorate(world: World): Deco {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  const trees: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [], crys: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const i of world.islands) {
    const rnd = mulberry32(i.id * 31 + 7);
    const n = Math.round(i.r * (i.role === 'wild' ? 0.9 : 0.55));
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * i.r * 0.85;
      const x = i.x + Math.cos(a) * d, z = i.z + Math.sin(a) * d;
      if (i.role !== 'wild' && d < 16) continue;
      if (world.bridges.some((b) => distSeg(x, z, b) < 4)) continue;
      const y = world.height(x, z);
      if (y < i.y - 1.5) continue;
      const roll = rnd(), sc = 0.8 + rnd() * 0.7;
      q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
      if (roll < 0.55) {
        trees.push(m.compose(p.set(x, y, z), q, s.set(sc, sc * (0.9 + rnd() * 0.6), sc)).clone());
        obstacles.push({ x, z, r: 0.45 * sc, top: Infinity });
      } else if (roll < 0.8) {
        rocks.push(m.compose(p.set(x, y, z), q, s.set(sc, sc * 0.7, sc)).clone());
        obstacles.push({ x, z, r: 0.85 * sc, top: y + 0.75 * sc });
      } else {
        crys.push(m.compose(p.set(x, y, z), q, s.set(sc * 0.6, sc * 1.4, sc * 0.6)).clone());
        obstacles.push({ x, z, r: 0.4 * sc, top: Infinity });
      }
    }
  }
  // 나무: 원뿔 두 단 + 줄기
  const treeGeo = new THREE.ConeGeometry(1.1, 2.6, 6);
  treeGeo.translate(0, 2.4, 0);
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
  return { obstacles, group, crystals };
}

function distSeg(x: number, z: number, b: { ax: number; az: number; bx: number; bz: number }) {
  const vx = b.bx - b.ax, vz = b.bz - b.az;
  const t = Math.max(0, Math.min(1, ((x - b.ax) * vx + (z - b.az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - b.ax - vx * t, z - b.az - vz * t);
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
    this.sea.position.y = -45;
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
  for (const i of world.islands) scene.add(islandMesh(world, i));
  scene.add(bridgeMesh(world));
  const deco = decorate(world);
  scene.add(deco.group);
  return deco;
}
