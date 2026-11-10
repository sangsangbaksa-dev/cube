import * as THREE from 'three';
import { GameAudio } from './audio/audio';
import { Cube } from './cube/cube';
import { Particles } from './fx/particles';
import { hud } from './hud';
import { Input } from './input/input';
import { FixedStepper, FIXED_DT } from './physics/clock';
import { HALF, PhysicsWorld, type Obstacle, type PhysicsInput } from './physics/world';
import { surfaceNormal } from './physics/terrain';
import { ObstacleGrid } from './world/grid';
import { Tower } from './game/towers';
import { Guardian } from './game/guardian';
import { clearSave, loadSave, SHARD_GOAL, writeSave } from './game/progress';
import { FALL_Y, World } from './world/terrain';
import { buildWorld, Sky } from './world/render';
import { Minimap } from './minimap';

// ---------- 장면 ----------
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
let pixelRatio = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const fog = new THREE.Fog('#5a3a7a', 45, 210);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();


const world = new World();
const sky = new Sky(scene);
const deco = buildWorld(world, scene);
const grid = new ObstacleGrid();
for (const o of deco.obstacles) grid.add(o);

// ---------- 등대 (집) ----------
const home = world.home;
const homeY = home.y;
const beacon = new THREE.Group();
{
  const stone = new THREE.MeshLambertMaterial({ color: '#e8e4ff', flatShading: true });
  const band = new THREE.MeshLambertMaterial({ color: '#6a58c9', flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 11, 8), stone); body.position.y = 5.5;
  const ring1 = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.85, 0.8, 8), band); ring1.position.y = 4;
  const ring2 = ring1.clone(); ring2.position.y = 8; ring2.scale.setScalar(0.88);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.4, 8), band); deck.position.y = 11.2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.2, 8), band); roof.position.y = 14.4;
  beacon.add(body, ring1, ring2, deck, roof);
  beacon.position.set(home.x, homeY, home.z);
  scene.add(beacon);
}
const lampMat = new THREE.MeshBasicMaterial({ color: '#ffd36b' });
const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 1), lampMat);
lamp.position.set(home.x, homeY + 12.4, home.z);
const lampLight = new THREE.PointLight('#ffcf7a', 0, 60, 1.4);
lampLight.position.copy(lamp.position);
const lampBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 3, 200, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe3a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
lampBeam.position.set(home.x, homeY + 112, home.z);
scene.add(lamp, lampLight, lampBeam);
const sockets: THREE.Mesh[] = [];
for (let k = 0; k < SHARD_GOAL; k++) {
  const a = (k / SHARD_GOAL) * Math.PI * 2;
  const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshLambertMaterial({ color: '#4a3d6b', emissive: '#ffd36b', emissiveIntensity: 0, flatShading: true }));
  s.position.set(home.x + Math.cos(a) * 3.6, homeY + 0.9, home.z + Math.sin(a) * 3.6);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.6, 5), new THREE.MeshLambertMaterial({ color: '#6a58c9' }));
  post.position.set(s.position.x, homeY + 0.3, s.position.z);
  scene.add(s, post);
  sockets.push(s);
  grid.add({ x: s.position.x, z: s.position.z, r: 0.2, top: Infinity });
}
grid.add({ x: home.x, z: home.z, r: 2.2, top: Infinity });

// ---------- 별의 탑 ----------
const towers = world.towers.map((s) => new Tower(world, s));
for (const t of towers) scene.add(t.group);
const cave = towers[3];
const final = towers[towers.length - 1];
const guardian = new Guardian(final.course.platforms.at(-1)!);
scene.add(guardian.group);

const near: Obstacle[] = [];
const obstacleSource = {
  near(x: number, z: number) {
    near.length = 0;
    for (const o of grid.near(x, z)) near.push(o);
    for (const t of towers) {
      const reach = t.island.r + 5;
      if (Math.abs(x - t.island.x) < reach && Math.abs(z - t.island.z) < reach) for (const o of t.obstacles) near.push(o);
    }
    return near;
  },
};

// ---------- 진행 ----------
let save = loadSave();
const spawnPoint = () => ({ x: home.x + 11, y: homeY + 1, z: home.z + 1.8 });
const physics = new PhysicsWorld(world, spawnPoint().x, spawnPoint().z, obstacleSource);
physics.abilities.airJumps = 0; // 더블점프 없음
physics.abilities.dash = true;
const dustTotal = deco.dust.length;
function applyProgress() {
  for (const t of towers) t.setCollected(save.shards.includes(t.id));
  for (const d of deco.dust) d.mesh.visible = !save.dust.includes(d.id);
  hud.setShards(save.shards.length, SHARD_GOAL);
  hud.setGems(save.dust.length, dustTotal);
}
applyProgress();
if (save.checkpoint) physics.teleport(save.checkpoint.x, save.checkpoint.y, save.checkpoint.z);

const cube = new Cube();
scene.add(cube.group, cube.shadow);
const particles = new Particles();
scene.add(particles.mesh);

const audio = new GameAudio();
hud.setMuted(audio.muted);
hud.onMute(() => hud.setMuted(audio.toggleMuted()));
let fast = false;
hud.onFast(() => { fast = !fast; hud.setFast(fast); });
hud.onReset(save.shards.length > 0 || save.dust.length > 0, () => {
  clearSave();
  location.reload();
});

const input = new Input(renderer.domElement, app);
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, world);
let started = false;
hud.onStart(() => {
  started = true;
  input.start();
  audio.unlock();
  window.focus();
  hud.banner('별빛 큐브', save.shards.length ? `별조각 ${save.shards.length}/${SHARD_GOAL} · 이어서 떠나요` : '등대 옆 돌길을 따라 초원 돌계단으로 떠나요', 3400);
});
for (const ev of ['pointerdown', 'keydown'] as const) addEventListener(ev, () => { if (started) audio.unlock(); });

// ---------- 상태 ----------
const stepper = new FixedStepper();
const pos = new THREE.Vector3();
const normal = new THREE.Vector3();
const nTmp = { x: 0, y: 1, z: 0 };
const camTarget = new THREE.Vector3(physics.state.x, physics.state.y, physics.state.z);
let camYaw = 0.72, camPitch = 0.24, shakeAmt = 0;
let faceX = 0, faceZ = 1;
let last = performance.now();
let clock = 0.09; // 0~1 하루 (0.5가 한밤)
let stepDist = 0, placeT = 0, objT = 0, emaDt = 1 / 60, prTimer = -5, retCd = 0;
let lastSafe = { x: physics.state.x, y: physics.state.y, z: physics.state.z };
const DAY = 300;

function nightAmount() { return 0.5 - 0.5 * Math.cos(clock * Math.PI * 2); }

function respawn(p: { x: number; y: number; z: number }) {
  physics.teleport(p.x, p.y, p.z);
  camTarget.set(p.x, p.y, p.z);
  lastSafe = { ...p };
  retCd = .6;
  audio.respawn();
  particles.emit(p.x, p.y, p.z, 14, { color: '#9ff0ff', speed: 3, up: 3, size: 0.12 });
}

function routeRespawn(t: Tower, preferStart = false) {
  const saved = save.checkpoint;
  if (saved && t.plats.some(({ spec }) => spec.kind === 'checkpoint' && Math.hypot(saved.x - spec.x, saved.z - spec.z) < .5)) {
    respawn(saved);
  } else {
    const p = preferStart ? t.course.platforms[0] : t.course.platforms.find((sp) => sp.kind === 'checkpoint') ?? t.course.platforms[0];
    respawn({ x: p.x, y: p.y + .57, z: p.z });
  }
}

/** R: 마지막 쉼터(없으면 등대)로 돌아간다 */
function returnToCheckpoint() {
  if (!started || retCd > 0) return;
  if (guardian.active) { guardian.reset(); routeRespawn(final); }
  else respawn(save.checkpoint ?? spawnPoint());
}
addEventListener('keydown', (e) => { if (e.code === 'KeyR' && !e.repeat) returnToCheckpoint(); });
document.getElementById('homeBtn')!.addEventListener('click', (e) => { e.stopPropagation(); returnToCheckpoint(); });

function gainShard(id: string) {
  if (save.shards.includes(id)) return;
  save.shards.push(id);
  save.checkpoint = null; // 다 올랐으니 R은 등대로
  const n = save.shards.length;
  applyProgress();
  writeSave(save);
  audio.shard();
  hud.banner(`별조각 ${n}/${SHARD_GOAL}`, n >= SHARD_GOAL ? '등대로 돌아가 불을 밝혀요' : '등대의 받침대 하나가 빛나기 시작해요', 3000);
  const s = physics.state;
  particles.emit(s.x, s.y + 0.5, s.z, 40, { color: '#ffd36b', speed: 5, up: 6, size: 0.14, life: 1.2 });
}

function placeName(s: { x: number; z: number }): string {
  const site = world.siteAt(s.x, s.z, 14);
  if (site?.role === 'home') return '등대 언덕';
  if (site) {
    const t = towers[site.id - 1];
    return `${t.info.name} · ${t.collected ? '완료' : `난도 ${site.id}/7`}`;
  }
  const h = world.height(s.x, s.z);
  const t = Math.sin(s.x * 0.011) + Math.sin(s.z * 0.013 + 1.7) + Math.sin((s.x + s.z) * 0.007);
  if (h > 26) return '눈 덮인 능선';
  if (h > 12) return '바람 부는 언덕';
  if (h < -10) return '안개 골짜기';
  return t < -0.7 ? '호박빛 들판' : t > 0.7 ? '보랏빛 이끼 들판' : '민트빛 초원';
}

const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
function dirIndex(dx: number, dz: number) {
  const a = Math.atan2(dx, -dz); // 북쪽 = -Z
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}
function updateObjective() {
  const s = physics.state;
  if (guardian.active) {
    hud.setObjective(guardian.phase === 'exposed' ? '지금! 핵 위에서 뛰어 내려찍으세요.' :
      guardian.phase === 'warn' || guardian.phase === 'pulse' ? '충격파가 오면 점프하세요.' : '파동을 피하고 핵이 드러날 때를 기다리세요.');
    return;
  }
  if (save.shards.length >= SHARD_GOAL) {
    if (save.won) { hud.setObjective(''); return; }
    const d = Math.hypot(home.x - s.x, home.z - s.z);
    hud.setObjective(d < 12 ? '등대 앞에 서서 불을 밝혀요' : `등대로 돌아가기 · ${DIRS[dirIndex(home.x - s.x, home.z - s.z)]}쪽 ${Math.round(d)}m`);
    return;
  }
  const site = world.siteAt(s.x, s.z, 4);
  const nearby = site?.id ? towers[site.id - 1] : undefined;
  const t = nearby && !nearby.collected ? nearby : towers.find((route) => !route.collected);
  if (!t) { hud.setObjective(''); return; }
  const p = t.course.platforms[0], dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
  const local = t === nearby || d < 12;
  const lowCeiling = t === cave && s.z - cave.island.z > -18 && s.z - cave.island.z < -5.7 && Math.abs(s.x - cave.island.x) < 4.5;
  let hint: string = t.info.hint;
  if (lowCeiling) hint = '낮은 천장 아래에서는 점프를 짧게 눌러요.';
  if (t.island.id === 5 && s.y < t.island.y + 5) hint = '빛나는 벽 끝을 돌아 공중에서 방향을 틀어요.';
  if (t.island.id === 6 && s.y > t.island.y + 8 && s.y < t.island.y + 11) hint = '벽 바깥쪽으로 뛰어 착지 직전에 방향을 틀어요.';
  if (t === final && save.shards.length >= SHARD_GOAL - 1) hint = guardian.defeated ? '수호자가 남긴 별조각을 주우세요.' : '봉인이 풀렸어요. 투기장으로 올라가세요.';
  hud.setObjective(local ? hint : `${t.info.name} · ${DIRS[dirIndex(dx, dz)]}쪽 ${Math.round(d)}m`);
}

const camRayStart = new THREE.Vector3(), camRayDelta = new THREE.Vector3();
const camBox = new THREE.Box3(), camRay = new THREE.Ray(), camHit = new THREE.Vector3();
function cameraOcclusion() {
  camRayStart.set(camTarget.x, camTarget.y + .26, camTarget.z);
  camRayDelta.subVectors(camera.position, camRayStart);
  const length = camRayDelta.length();
  camRay.set(camRayStart, camRayDelta.normalize());
  let distance = length;
  for (const t of towers) {
    if (Math.hypot(t.island.x - camTarget.x, t.island.z - camTarget.z) > t.island.r + 10) continue;
    for (const b of t.cameraBlocks) {
      camBox.min.set(b.x - b.hx! - .12, b.collisionBottom! - .12, b.z - b.hz! - .12);
      camBox.max.set(b.x + b.hx! + .12, b.top + .12, b.z + b.hz! + .12);
      if (camBox.containsPoint(camRayStart)) continue;
      if (camRay.intersectBox(camBox, camHit)) distance = Math.min(distance, camRayStart.distanceTo(camHit) - .12);
    }
  }
  if (distance < length) camera.position.copy(camRayStart).addScaledVector(camRayDelta, Math.max(.52, distance));
}

function frame(now: number) {
  requestAnimationFrame(frame);
  const rawDt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const time = now / 1000;
  emaDt += (rawDt - emaDt) * 0.05;
  prTimer += rawDt;
  retCd = Math.max(0, retCd - rawDt);
  if (prTimer > 3) {
    prTimer = 0;
    if (emaDt > 1 / 28 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
  }
  const dt = rawDt;
  const inp = input.read();
  const { steps, alpha } = stepper.advance(dt);
  let attack = steps > 0 && input.consumeAttack(), dash = steps > 0 && input.consumeDash();
  const alive = started;
  if (!alive) {
    input.consumeJump(); attack = dash = false;
    inp.moveX = inp.moveY = 0;
    inp.lookYaw = inp.lookPitch = 0; camYaw += rawDt * 0.1;
  }
  camYaw -= inp.lookYaw;
  camPitch = THREE.MathUtils.clamp(camPitch + inp.lookPitch, 0.05, 1.25);
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  const moveX = fx * inp.moveY + rx * inp.moveX, moveZ = fz * inp.moveY + rz * inp.moveX;
  if (moveX * moveX + moveZ * moveZ > 0.01) { faceX = moveX; faceZ = moveZ; }

  const s = physics.state;
  // 공중에서 충분히 높으면 내려찍기
  let slamPressed = false;
  if (attack && !s.grounded && !s.inWater && s.y - HALF - s.groundY > 1.3 && !s.slamming) { slamPressed = true; audio.slamStart(); }

  let jumped = false, launched = false, dashed = false, landImpact = 0, slamLanded = false, slamPower = 0;
  let pressed = steps > 0 && input.consumeJump();
  for (let k = 0; k < steps; k++) {
    for (const t of towers) t.step(FIXED_DT, s);
    const pi: PhysicsInput = {
      moveX, moveZ, jumpPressed: pressed, jumpHeld: alive && input.jumpHeld, diveHeld: false,
      dashPressed: dash && k === 0, slamPressed: slamPressed && k === 0, faceX, faceZ,
    };
    if (dash && k === 0) dash = false;
    if (slamPressed && k === 0) slamPressed = false;
    physics.step(pi);
    if (alive) {
      const event = guardian.step(FIXED_DT, s, save.shards.length >= SHARD_GOAL - 1, final.collected);
      if (event === 'retry') { routeRespawn(final); hud.banner('다시 도전', '충격파를 뛰어넘고, 핵이 드러나면 내려찍어요.', 1800); }
      if (event === 'hit') { audio.slamImpact(.55); shakeAmt = Math.max(shakeAmt, .48); cube.flash = .55; }
      if (event === 'strike' || event === 'defeated') {
        audio.collect(1);
        particles.emit(s.x, s.y + 1, s.z, 32, { color: '#e0b4ff', speed: 6, up: 4, size: .17 });
        if (event === 'defeated') {
          final.setRewardEnabled(true);
          hud.banner('폭풍 수호자를 쓰러뜨렸어요', '마지막 별조각을 가져가세요.', 2400);
        }
      }
    }
    pressed = false;
    jumped ||= s.jumped; launched ||= s.launched; dashed ||= s.dashed;
    landImpact = Math.max(landImpact, s.landImpact);
    if (s.slamLanded) { slamLanded = true; slamPower = THREE.MathUtils.clamp((s.slamFrom - s.y) / 14, 0, 1); }
  }

  const feetY = s.groundY + 0.1;
  if (jumped) { cube.kickJump(); audio.jump(); particles.emit(s.x, feetY, s.z, 5, { color: '#d8d0ff', speed: 1.6, up: 2, size: 0.1 }); }
  if (launched) audio.launch();
  if (dashed) { audio.dash(); particles.emit(s.x, s.y, s.z, 8, { color: '#9ff0ff', speed: 2, up: 0.5, size: 0.12, gravity: 0 }); }
  if (landImpact > 2) { cube.kickLand(landImpact); audio.land(landImpact); particles.emit(s.x, feetY, s.z, Math.min(12, 4 + Math.round(landImpact * 0.4)), { color: '#d8d0ff', speed: 2.4, up: 1.6, size: 0.12 }); }
  if (slamLanded) {
    audio.slamImpact(slamPower);
    shakeAmt = Math.max(shakeAmt, 0.4 + slamPower * 0.5);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      particles.emit(s.x + Math.cos(a) * 1.2, feetY, s.z + Math.sin(a) * 1.2, 1, { color: '#9ff0ff', speed: 5, up: 3, size: 0.14 });
    }
  }
  if (s.dashT > 0 && Math.random() < 0.6) particles.emit(s.x, s.y, s.z, 1, { color: '#6fe3ff', speed: 0.3, up: 0, size: 0.16, life: 0.3, gravity: 0 });
  const speed = Math.hypot(s.vx, s.vz);
  if (alive && s.grounded && speed > 2) {
    stepDist += speed * dt;
    if (stepDist > 1.6) { stepDist = 0; audio.step(); }
  }

  const basin = cave.course.recovery!;
  if (alive && s.y < basin.minY && Math.abs(s.x - basin.x) < basin.hx && Math.abs(s.z - basin.z) < basin.hz) routeRespawn(cave, true);

  // 지면에 서 있는 곳을 기억해 두고, 비정상 추락이면 되돌린다
  if (s.grounded && !s.standingOn) lastSafe = { x: s.x, y: s.y + 0.5, z: s.z };
  if (s.y < FALL_Y) { physics.teleport(lastSafe.x, lastSafe.y, lastSafe.z); camTarget.set(lastSafe.x, lastSafe.y, lastSafe.z); }

  const night = nightAmount();
  for (const t of towers) {
    const ev = t.update(time, s);
    if (ev.checkpoint && (!save.checkpoint || Math.hypot(save.checkpoint.x - ev.checkpoint.x, save.checkpoint.y - ev.checkpoint.y, save.checkpoint.z - ev.checkpoint.z) > 0.5)) {
      save.checkpoint = ev.checkpoint; writeSave(save);
      audio.checkpoint();
      hud.banner('쉼터', '떨어져도 R을 누르면 여기로 돌아와요', 2200);
    }
    if (ev.shard) gainShard(ev.shard);
  }
  guardian.update(time);
  hud.setBoss(guardian.active, guardian.health, guardian.hearts);
  // 별가루
  for (const d of deco.dust) {
    if (save.dust.includes(d.id)) continue;
    d.mesh.rotation.y = time * 2 + d.id;
    d.mesh.position.y = d.y + Math.sin(time * 2 + d.id) * 0.15;
    if (Math.hypot(s.x - d.x, s.y - d.y, s.z - d.z) < 1.6) {
      save.dust.push(d.id); writeSave(save);
      d.mesh.visible = false;
      hud.setGems(save.dust.length, dustTotal);
      audio.collect(1);
      particles.emit(d.x, d.y, d.z, 10, { color: '#ffe27a', speed: 3, up: 2, size: 0.12 });
    }
  }

  // 승리: 별조각을 다 모아 등대 앞에 서면
  if (save.shards.length >= SHARD_GOAL && !save.won && Math.hypot(s.x - home.x, s.z - home.z) < 9) {
    save.won = true; writeSave(save);
    audio.milestone();
    for (let k = 0; k < 6; k++) setTimeout(() => particles.emit(home.x + (Math.random() - 0.5) * 10, homeY + 14 + Math.random() * 6, home.z + (Math.random() - 0.5) * 10, 30, { color: ['#ffd36b', '#6fe3ff', '#ff6f9a'][k % 3], speed: 7, up: 4, size: 0.18, life: 1.6, gravity: 4 }), k * 350);
    document.exitPointerLock?.();
    hud.showVictory(() => input.start());
  }

  placeT -= rawDt;
  if (placeT <= 0) { placeT = 0.4; hud.setPlace(placeName(s)); }
  objT -= rawDt;
  if (objT <= 0) { objT = 0.5; updateObjective(); }

  // ---- 렌더 ----
  pos.set(s.px + (s.x - s.px) * alpha, s.py + (s.y - s.py) * alpha, s.pz + (s.z - s.pz) * alpha);
  const terrH = world.height(pos.x, pos.z);
  if (s.groundY > terrH + 0.05) normal.set(0, 1, 0);
  else { surfaceNormal(world, pos.x, pos.z, nTmp); normal.set(nTmp.x, nTmp.y, nTmp.z); }
  cube.spin = 0;
  cube.flash = Math.max(0, cube.flash - rawDt * 4);
  cube.blink = false;
  cube.update(rawDt, pos, s.vy, s.grounded, s.groundY, faceX, faceZ, normal);
  cube.shadow.visible = true;
  particles.update(rawDt);

  // 등대: 별조각만큼 받침대가 빛나고, 다 모으면 빛기둥
  const n = save.shards.length;
  sockets.forEach((so, k) => { (so.material as THREE.MeshLambertMaterial).emissiveIntensity = k < n ? 1.2 + 0.3 * Math.sin(time * 3 + k) : 0; so.rotation.y = time + k; });
  lampMat.color.set(n >= SHARD_GOAL ? '#fff2b8' : '#7a6a4a').lerp(new THREE.Color('#ffd36b'), n / SHARD_GOAL);
  lampLight.intensity = (n / SHARD_GOAL) * 40 + 3;
  (lampBeam.material as THREE.MeshBasicMaterial).opacity = save.won ? 0.22 + 0.05 * Math.sin(time * 2) : 0;
  lamp.rotation.y = time * 0.8;
  (deco.crystals.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.4 + night * 1.2;

  // 낮밤: 황혼 ↔ 밤
  clock = (clock + (rawDt / DAY) * (fast ? 14 : 1)) % 1;

  // 카메라
  const k = 1 - Math.exp(-rawDt * 10), ky = 1 - Math.exp(-rawDt * 4);
  camTarget.x += (pos.x - camTarget.x) * k;
  camTarget.z += (pos.z - camTarget.z) * k;
  camTarget.y += (pos.y - camTarget.y) * (s.y < camTarget.y - 6 ? k : ky);
  const inCave = Math.abs(s.x - cave.island.x) < 11 && s.z - cave.island.z > -18.8 && s.z - cave.island.z < 26;
  const dist = inCave ? 5.6 : 8;
  const cp = Math.cos(camPitch);
  camera.position.set(camTarget.x + Math.sin(camYaw) * cp * dist, camTarget.y + 1.2 + Math.sin(camPitch) * dist, camTarget.z + Math.cos(camYaw) * cp * dist);
  const floor = world.height(camera.position.x, camera.position.z);
  if (camera.position.y < floor + 0.8) camera.position.y = floor + 0.8;
  if (shakeAmt > 0) {
    camera.position.x += (Math.random() - 0.5) * shakeAmt;
    camera.position.y += (Math.random() - 0.5) * shakeAmt;
    shakeAmt = Math.max(0, shakeAmt - rawDt * 2.5);
  }
  cameraOcclusion();
  camera.lookAt(camTarget.x, camTarget.y + .8, camTarget.z);
  fog.near = 60 - night * 20; fog.far = 270 - night * 70;
  sky.update(camera, time, night, fog);
  minimap.update(s.x, s.z, faceX, faceZ, rawDt, towers, save.shards);
  if (started) audio.update(rawDt, { elevation: 0.3 - night * 0.6, speed, grounded: s.grounded });
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// 검증/디버깅용 훅
(window as unknown as Record<string, unknown>).__game = {
  state: () => ({ ...physics.state, standingOn: !!physics.state.standingOn, shards: [...save.shards], dust: save.dust.length, night: nightAmount() }),
  teleport: (x: number, z: number, y?: number) => { physics.teleport(x, y ?? world.height(x, z) + 2, z); camTarget.set(x, physics.state.y, z); },
  setClock: (c: number) => { clock = c; },
  sites: () => world.sites.map((i) => ({ id: i.id, role: i.role, x: Math.round(i.x), z: Math.round(i.z), y: Math.round(i.y) })),
  towers: () => towers.map((t) => ({ id: t.id, name: t.info.name, start: t.course.platforms[0], goal: t.course.goal, platforms: t.course.platforms, barriers: t.course.barriers })),
  guardian: () => ({ active: guardian.active, phase: guardian.phase, health: guardian.health, hearts: guardian.hearts }),
  dust: () => deco.dust.map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z })),
  give: (id: string) => { if (towers.some((t) => t.id === id)) gainShard(id); },
};
