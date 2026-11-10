import * as THREE from 'three';
import { GameAudio } from './audio/audio';
import { Cube } from './cube/cube';
import { Particles } from './fx/particles';
import { hud } from './hud';
import { Input } from './input/input';
import { FixedStepper, FIXED_DT } from './physics/clock';
import { HALF, JUMP_SPEED, PhysicsWorld, type Obstacle, type PhysicsInput } from './physics/world';
import { surfaceNormal } from './physics/terrain';
import { FALL_Y, VOID, World, type Island } from './world/islands';
import { buildWorld, Sky } from './world/render';
import { ObstacleGrid } from './world/grid';
import { PlayerCombat } from './game/combat';
import { Monsters, type Hooks, type Monster } from './game/monsters';
import { Tower } from './game/towers';
import { Rift } from './game/rifts';
import { applyStats, clearSave, loadSave, SHARD_GOAL, statsFor, UNLOCKS, WEAPONS, writeSave } from './game/progress';
import { Minimap } from './minimap';
import type { MonsterKind } from './game/types';

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
const homeY = world.height(home.x, home.z);
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

// ---------- 탑과 균열 ----------
const monsters = new Monsters(world);
scene.add(monsters.group);
const towers = world.islands.filter((i) => i.role === 'tower').map((i) => new Tower(world, i));
const BOSSES: MonsterKind[] = ['golem', 'batking', 'eyelord'];
const rifts = world.islands.filter((i) => i.role === 'rift').map((i, k) => new Rift(world, i, monsters, BOSSES[k % 3]));
for (const t of towers) scene.add(t.group);
for (const r of rifts) scene.add(r.group);

const near: Obstacle[] = [];
const obstacleSource = {
  near(x: number, z: number) {
    near.length = 0;
    for (const o of grid.near(x, z)) near.push(o);
    for (const t of towers) {
      if (Math.abs(x - t.island.x) < 18 && Math.abs(z - t.island.z) < 18) for (const o of t.obstacles) near.push(o);
    }
    return near;
  },
};

// ---------- 진행 ----------
let save = loadSave();
const spawnPoint = () => ({ x: home.x + 4, y: homeY + 1, z: home.z + 7 });
const physics = new PhysicsWorld(world, spawnPoint().x, spawnPoint().z, obstacleSource);
let stats = statsFor(save.shards.length);
applyStats(physics.abilities, stats);
let hp = stats.maxHp;
function applyProgress() {
  for (const t of towers) t.setCollected(save.shards.includes(t.id));
  for (const r of rifts) if (save.shards.includes(r.id)) r.setCleansed();
  stats = statsFor(save.shards.length);
  applyStats(physics.abilities, stats);
  combat.power = stats.power;
  hud.setShards(save.shards.length, SHARD_GOAL);
  hud.setGems(save.gems);
  hud.setHearts(hp, stats.maxHp);
}
const combat = new PlayerCombat();
applyProgress();
if (save.checkpoint) physics.teleport(save.checkpoint.x, save.checkpoint.y, save.checkpoint.z);

const cube = new Cube();
scene.add(cube.group, cube.shadow);
const particles = new Particles();
scene.add(particles.mesh);
const swingRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: '#9ff0ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
swingRing.rotation.x = Math.PI / 2;
scene.add(swingRing);

const audio = new GameAudio();
hud.setMuted(audio.muted);
hud.onMute(() => hud.setMuted(audio.toggleMuted()));
let fast = false;
hud.onFast(() => { fast = !fast; hud.setFast(fast); });
hud.onReset(save.shards.length > 0 || save.gems > 0, () => {
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
  hud.banner('스카이 큐브', save.shards.length ? `별조각 ${save.shards.length}/${SHARD_GOAL} · 이어서 떠나요` : '금빛 기둥은 별의 탑, 보랏빛 기둥은 어둠의 균열이에요', 3800);
});
for (const ev of ['pointerdown', 'keydown'] as const) addEventListener(ev, () => { if (started) audio.unlock(); });

// ---------- 상태 ----------
const stepper = new FixedStepper();
const pos = new THREE.Vector3();
const normal = new THREE.Vector3();
const nTmp = { x: 0, y: 1, z: 0 };
const camTarget = new THREE.Vector3(physics.state.x, physics.state.y, physics.state.z);
let camYaw = 0.6, camPitch = 0.3, shakeAmt = 0;
let faceX = 0, faceZ = 1;
let last = performance.now();
let clock = 0.15; // 0~1 하루 (0.5가 한밤)
let iframes = 0, hitstop = 0, deathT = -1, stepDist = 0, placeT = 0, objT = 0, spawnT = 0, emaDt = 1 / 60, prTimer = -5;
let lastSafe = { x: physics.state.x, y: physics.state.y, z: physics.state.z };
let bossRef: Monster | null = null;
const DAY = 300;

function nightAmount() { return 0.5 - 0.5 * Math.cos(clock * Math.PI * 2); }

const hooks: Hooks = {
  hurtPlayer(dmg, fx, fz) {
    if (iframes > 0 || deathT >= 0) return false;
    hp = Math.max(0, hp - dmg);
    iframes = 1.1;
    const s = physics.state;
    const dx = s.x - fx, dz = s.z - fz, d = Math.hypot(dx, dz) || 1;
    physics.impulse((dx / d) * 9, 7, (dz / d) * 9, 0.3);
    combat.cancel();
    hud.setHearts(hp, stats.maxHp);
    hud.flashDamage();
    audio.hurt();
    cube.flash = 1;
    shakeAmt = Math.max(shakeAmt, 0.45);
    hitstop = 0.07;
    particles.emit(s.x, s.y, s.z, 10, { color: '#ff8fb8', speed: 3, up: 3, size: 0.12 });
    if (hp <= 0) die();
    return true;
  },
  bouncePlayer() { physics.bounce(JUMP_SPEED * 0.85); audio.stomp(); },
  onKill(m) {
    audio.enemyDie(m.kind === 'golem');
    particles.emit(m.x, m.cy, m.z, m.def.boss ? 40 : 14, { color: '#c58bff', speed: 4, up: 4, size: 0.16, life: 0.8 });
    if (m.def.boss) { shakeAmt = 0.8; hud.banner(`${m.def.boss}을(를) 쓰러뜨렸어요`, '보스의 핵 +1 · 균열의 핵을 부수면 정화돼요'); }
  },
  onHit(m, x, y, z, big) {
    audio.hit();
    hitstop = Math.max(hitstop, big ? 0.09 : 0.05);
    shakeAmt = Math.max(shakeAmt, big ? 0.35 : 0.18);
    particles.emit(x, y, z, big ? 12 : 7, { color: '#ffffff', speed: 4, up: 3, size: 0.1, life: 0.35 });
    void m;
  },
  onPickup(kind) {
    if (kind === 'gem') { save.gems++; hud.setGems(save.gems); audio.collect(1); }
    else if (kind === 'core') { save.cores++; writeSave(save); }
    else { hp = Math.min(stats.maxHp, hp + 1); hud.setHearts(hp, stats.maxHp); audio.heal(); }
  },
  shake(a) { shakeAmt = Math.max(shakeAmt, a); },
  sfx(name) {
    if (name === 'orbShoot') audio.orbShoot();
    else if (name === 'orbReflect') audio.orbReflect();
    else if (name === 'roar') audio.roar();
    else if (name === 'slam') audio.slamImpact(0.8);
    else if (name === 'enemyHurt') audio.enemyHurt();
    else audio.hurt();
  },
  playerSafe: false,
  playerHp01: 1,
};

function die() {
  deathT = 0;
  audio.death();
  hud.showDeath(true);
}

function respawn() {
  const p = save.checkpoint ?? spawnPoint();
  physics.teleport(p.x, p.y, p.z);
  camTarget.set(p.x, p.y, p.z);
  hp = stats.maxHp;
  hud.setHearts(hp, stats.maxHp);
  for (const r of rifts) r.reset();
  for (const m of [...monsters.list]) if (Math.hypot(m.x - p.x, m.z - p.z) < 30) monsters.remove(m);
  iframes = 2;
  deathT = -1;
  hud.showDeath(false);
  audio.respawn();
  lastSafe = { ...p };
}

function gainShard(id: string) {
  if (save.shards.includes(id)) return;
  save.shards.push(id);
  const n = save.shards.length;
  const before = stats.maxHp;
  applyProgress();
  hp = Math.min(stats.maxHp, hp + (stats.maxHp - before) + 1);
  hud.setHearts(hp, stats.maxHp);
  writeSave(save);
  audio.shard();
  hud.banner(`별조각 ${n}/${SHARD_GOAL}`, '등대의 받침대 하나가 빛나기 시작해요', 2600);
  const u = UNLOCKS[Math.min(n, UNLOCKS.length) - 1];
  if (u) hud.banner(u.title, u.sub, 3600);
  const s = physics.state;
  particles.emit(s.x, s.y + 0.5, s.z, 40, { color: '#ffd36b', speed: 5, up: 6, size: 0.14, life: 1.2 });
}

function islandName(i: Island | null, s: { x: number; z: number }): string {
  if (!i) return world.height(s.x, s.z) > VOID + 1 ? '구름 다리' : '허공';
  if (i.role === 'home') return '등대섬';
  if (i.role === 'tower') return save.shards.includes(`tower${i.id}`) ? '별의 탑 (완료)' : '별의 탑';
  if (i.role === 'rift') return save.shards.includes(`rift${i.id}`) ? '정화된 섬' : '어둠의 균열';
  return ['', '보랏빛 이끼섬', '호박빛 들섬', '하늘빛 풀섬'][i.theme];
}

const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
function updateObjective() {
  const s = physics.state;
  if (save.shards.length >= SHARD_GOAL) {
    if (save.won) { hud.setObjective(''); return; }
    const d = Math.hypot(home.x - s.x, home.z - s.z);
    hud.setObjective(d < 12 ? '등대 앞에 서서 불을 밝혀요' : `등대로 돌아가기 · ${DIRS[dirIndex(home.x - s.x, home.z - s.z)]}쪽 ${Math.round(d)}m`);
    return;
  }
  type T = { x: number; z: number; name: string; d: number };
  const left: T[] = [
    ...towers.filter((t) => !t.collected).map((t) => ({ x: t.island.x, z: t.island.z, name: '별의 탑 꼭대기에 오르기', d: 0 })),
    ...rifts.filter((r) => r.state !== 'cleansed').map((r) => ({ x: r.island.x, z: r.island.z, name: '어둠의 균열 정화하기', d: 0 })),
  ];
  for (const t of left) t.d = Math.hypot(t.x - s.x, t.z - s.z);
  left.sort((a, b) => a.d - b.d);
  const t = left[0];
  if (!t) { hud.setObjective(''); return; }
  hud.setObjective(t.d < 20 ? t.name : `${t.name} · ${DIRS[dirIndex(t.x - s.x, t.z - s.z)]}쪽 ${Math.round(t.d)}m`);
}
function dirIndex(dx: number, dz: number) {
  const a = Math.atan2(dx, -dz); // 북쪽 = -Z
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}

/** 주변 섬에 몬스터를 채운다. 밤일수록 많고 박쥐가 나온다 */
function spawnAmbient(night: number) {
  const s = physics.state;
  for (const m of [...monsters.list]) if (!m.owner && Math.hypot(m.x - s.x, m.z - s.z) > 85) monsters.remove(m);
  const ambient = monsters.list.filter((m) => !m.owner).length;
  const want = Math.round(2 + night * 6 + save.shards.length * 0.4);
  if (ambient >= want) return;
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 30;
    const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
    const isl = world.islandAt(x, z);
    if (!isl || isl.role === 'home') continue;
    if (isl.role === 'rift' && Math.hypot(x - isl.x, z - isl.z) < 22) continue;
    const h = world.height(x, z);
    if (h < isl.y - 1.5) continue;
    const r = Math.random();
    const kind: MonsterKind = night > 0.45
      ? (r < 0.12 ? 'bigslime' : r < 0.3 ? 'slime' : r < 0.5 ? 'spiker' : r < 0.7 ? 'caster' : 'bat')
      : (r < 0.6 ? 'slime' : r < 0.85 ? 'spiker' : 'caster');
    monsters.spawn(kind, x, z);
    return;
  }
}

function frame(now: number) {
  requestAnimationFrame(frame);
  const rawDt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const time = now / 1000;
  emaDt += (rawDt - emaDt) * 0.05;
  prTimer += rawDt;
  if (prTimer > 3) {
    prTimer = 0;
    if (emaDt > 1 / 28 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
  }
  // 타격감: 맞힌 순간 아주 잠깐 멈춘다
  let dt = rawDt;
  if (hitstop > 0) { hitstop -= rawDt; dt = rawDt * 0.08; }

  const inp = input.read();
  let attack = input.consumeAttack(), dash = input.consumeDash();
  const alive = started && deathT < 0 && !forgeOpen;
  if (!alive) {
    input.consumeJump(); attack = dash = false;
    inp.moveX = inp.moveY = 0;
    if (!started) { inp.lookYaw = inp.lookPitch = 0; camYaw += rawDt * 0.1; }
  }
  camYaw -= inp.lookYaw;
  camPitch = THREE.MathUtils.clamp(camPitch + inp.lookPitch, 0.05, 1.25);
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  const moveX = fx * inp.moveY + rx * inp.moveX, moveZ = fz * inp.moveY + rz * inp.moveX;
  if (moveX * moveX + moveZ * moveZ > 0.01) { faceX = moveX; faceZ = moveZ; }

  const s = physics.state;
  // 공격: 공중에서 충분히 높으면 내려찍기, 아니면 회전
  let slamPressed = false;
  if (attack) {
    if (!s.grounded && !s.inWater && s.y - HALF - s.groundY > 1.3 && !s.slamming) { slamPressed = true; audio.slamStart(); }
    else {
      const c = combat.tryAttack();
      if (c) {
        audio.swing(c);
        if (WEAPONS[save.equipped].bolt) { const l = Math.hypot(faceX, faceZ) || 1; monsters.fireBolt(s.x, s.y + 0.2, s.z, faceX / l, faceZ / l); audio.orbReflect(); }
      }
    }
  }

  const { steps, alpha } = stepper.advance(dt);
  let jumped = false, airJumped = false, launched = false, dashed = false, landImpact = 0, slamLanded = false, slamPower = 0;
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
    pressed = false;
    jumped ||= s.jumped; airJumped ||= s.airJumped; launched ||= s.launched; dashed ||= s.dashed;
    landImpact = Math.max(landImpact, s.landImpact);
    if (s.slamLanded) { slamLanded = true; slamPower = THREE.MathUtils.clamp((s.slamFrom - s.y) / 14, 0, 1); }
  }
  // 입력이 스텝보다 먼저 들어온 경우: 다음 프레임으로 넘기지 않고 버린다 (중복 방지)

  const feetY = s.groundY + 0.1;
  if (jumped) { cube.kickJump(); audio.jump(); particles.emit(s.x, feetY, s.z, 5, { color: '#d8d0ff', speed: 1.6, up: 2, size: 0.1 }); }
  if (airJumped) { cube.kickJump(); audio.doubleJump(); particles.emit(s.x, s.y - 0.4, s.z, 10, { color: '#9ff0ff', speed: 2.5, up: -1, size: 0.1, gravity: 2 }); }
  if (launched) audio.launch();
  if (dashed) { audio.dash(); particles.emit(s.x, s.y, s.z, 8, { color: '#9ff0ff', speed: 2, up: 0.5, size: 0.12, gravity: 0 }); }
  if (landImpact > 2) { cube.kickLand(landImpact); audio.land(landImpact); particles.emit(s.x, feetY, s.z, Math.min(12, 4 + Math.round(landImpact * 0.4)), { color: '#d8d0ff', speed: 2.4, up: 1.6, size: 0.12 }); }
  if (slamLanded) {
    audio.slamImpact(slamPower);
    shakeAmt = Math.max(shakeAmt, 0.4 + slamPower * 0.5);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      particles.emit(s.x + Math.cos(a) * 1.2, feetY, s.z + Math.sin(a) * 1.2, 1, { color: '#c58bff', speed: 5, up: 3, size: 0.14 });
    }
    monsters.slamImpact(s.x, s.y, s.z, slamPower, hooks, WEAPONS[save.equipped].slam);
  }
  if (s.dashT > 0 && Math.random() < 0.6) particles.emit(s.x, s.y, s.z, 1, { color: '#6fe3ff', speed: 0.3, up: 0, size: 0.16, life: 0.3, gravity: 0 });
  const speed = Math.hypot(s.vx, s.vz);
  if (alive && s.grounded && speed > 2) {
    stepDist += speed * dt;
    if (stepDist > 1.6) { stepDist = 0; audio.step(); }
  }

  // 추락
  if (s.grounded && !s.standingOn && deathT < 0) {
    const ok = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].every(([ox, oz]) => world.height(s.x + ox, s.z + oz) > s.y - 3);
    if (ok) lastSafe = { x: s.x, y: s.y + 0.5, z: s.z };
  }
  if (s.y < FALL_Y && deathT < 0) {
    iframes = 0;
    hp = Math.max(0, hp - 1);
    hud.setHearts(hp, stats.maxHp);
    hud.flashDamage();
    audio.hurt();
    if (hp <= 0) die();
    else { physics.teleport(lastSafe.x, lastSafe.y, lastSafe.z); camTarget.set(lastSafe.x, lastSafe.y, lastSafe.z); iframes = 1.2; }
  }
  if (deathT >= 0) { deathT += rawDt; if (deathT > 1.8) respawn(); }

  // ---- 전투 ----
  combat.update(dt);
  iframes = Math.max(0, iframes - dt);
  const night = nightAmount();
  hooks.playerSafe = Math.hypot(s.x - home.x, s.z - home.z) < home.r && Math.abs(s.y - homeY) < 10;
  hooks.playerHp01 = hp / stats.maxHp;
  const hit = deathT < 0 ? combat.hit : null;
  if (started) monsters.update(dt, time, s, hit, night, hooks);
  spawnT -= dt;
  if (started && spawnT <= 0) { spawnT = 1.2; spawnAmbient(night); }

  for (const t of towers) {
    const ev = t.update(time, s);
    if (ev.checkpoint && (!save.checkpoint || Math.hypot(save.checkpoint.x - ev.checkpoint.x, save.checkpoint.y - ev.checkpoint.y, save.checkpoint.z - ev.checkpoint.z) > 0.5)) {
      save.checkpoint = ev.checkpoint; writeSave(save);
      audio.checkpoint();
      hud.banner('쉼터', '쓰러지면 여기서 다시 시작해요', 1800);
    }
    if (ev.shard) gainShard(ev.shard);
  }
  for (const r of rifts) {
    const ev = r.update(dt, time, s, hit, slamLanded ? Math.max(0.2, slamPower) : 0, night);
    if (ev.started) { hud.banner('어둠의 균열', '몰려오는 몬스터를 모두 물리쳐요', 2600); audio.riftPulse(); }
    if (ev.wave && ev.wave > 1) hud.banner(`${ev.wave}번째 물결`, ev.wave === 3 ? '균열의 보스가 깨어났어요!' : '', 2200);
    if (ev.boss) bossRef = ev.boss;
    if (ev.coreOpen) hud.banner('핵이 드러났어요', '균열의 핵을 공격해 부숴요', 2600);
    if (ev.coreHit) { audio.hit(); shakeAmt = Math.max(shakeAmt, 0.25); particles.emit(r.center.x, r.center.y + 1.8, r.center.z, 10, { color: '#c58bff', speed: 4, up: 3, size: 0.14 }); }
    if (ev.cleansed) { audio.milestone(); hud.banner('균열을 정화했어요', '떠오른 별조각을 잡아요', 2600); }
    if (ev.shard) gainShard(ev.shard);
    if (ev.reset) hud.banner('균열이 잠잠해졌어요', '다시 다가가면 처음부터 싸워요', 2000);
  }

  // 위협도: 음악과 화면 가장자리
  const threat = monsters.threat(s.x, s.z);
  audio.setThreat(started ? threat.level : 0, !!threat.boss);
  hud.setThreat(threat.level > 0.3);
  if (bossRef && (!bossRef.alive || !monsters.list.includes(bossRef))) bossRef = null;
  const boss = bossRef ?? threat.boss;
  hud.bossBar(boss && boss.alive ? boss.def.boss ?? null : null, boss ? boss.hp / boss.def.hp : 0);
  const low = hp <= 1 && deathT < 0 && started;
  hud.setLowHealth(low);
  audio.setLowHealth(low);

  // 승리: 별조각을 다 모아 등대 앞에 서면
  if (save.shards.length >= SHARD_GOAL && !save.won && Math.hypot(s.x - home.x, s.z - home.z) < 9) {
    save.won = true; writeSave(save);
    audio.milestone();
    for (let k = 0; k < 6; k++) setTimeout(() => particles.emit(home.x + (Math.random() - 0.5) * 10, homeY + 14 + Math.random() * 6, home.z + (Math.random() - 0.5) * 10, 30, { color: ['#ffd36b', '#6fe3ff', '#ff6f9a'][k % 3], speed: 7, up: 4, size: 0.18, life: 1.6, gravity: 4 }), k * 350);
    document.exitPointerLock?.();
    hud.showVictory(() => input.start());
  }

  placeT -= rawDt;
  if (placeT <= 0) { placeT = 0.4; hud.setPlace(islandName(world.islandAt(s.x, s.z), s)); }
  objT -= rawDt;
  if (objT <= 0) { objT = 0.5; updateObjective(); }

  // ---- 렌더 ----
  pos.set(s.px + (s.x - s.px) * alpha, s.py + (s.y - s.py) * alpha, s.pz + (s.z - s.pz) * alpha);
  const terrH = world.height(pos.x, pos.z);
  if (s.groundY > terrH + 0.05 || s.groundY < VOID + 1) normal.set(0, 1, 0);
  else { surfaceNormal(world, pos.x, pos.z, nTmp); normal.set(nTmp.x, nTmp.y, nTmp.z); }
  cube.spin = combat.spin + (s.slamming ? 0 : 0);
  cube.flash = Math.max(0, cube.flash - rawDt * 4);
  cube.blink = iframes > 0 && deathT < 0;
  cube.update(rawDt, pos, s.vy, s.grounded, s.groundY < VOID + 1 ? pos.y - 60 : s.groundY, faceX, faceZ, normal);
  cube.shadow.visible = s.groundY > VOID + 1;
  const sw = swingRing.material as THREE.MeshBasicMaterial;
  if (combat.t >= 0) {
    const k = combat.t / 0.26;
    const h = combat.hit;
    swingRing.position.set(pos.x, pos.y - 0.1, pos.z);
    swingRing.scale.setScalar((h ? h.radius : 1.8) * (0.6 + 0.5 * k));
    sw.opacity = 0.9 * (1 - k);
    sw.color.set(combat.combo === 3 ? '#ffd36b' : '#9ff0ff');
  } else sw.opacity = 0;
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
  const dist = 8;
  const cp = Math.cos(camPitch);
  camera.position.set(camTarget.x + Math.sin(camYaw) * cp * dist, camTarget.y + 1.2 + Math.sin(camPitch) * dist, camTarget.z + Math.cos(camYaw) * cp * dist);
  const floor = world.height(camera.position.x, camera.position.z);
  if (floor > VOID + 1 && camera.position.y < floor + 0.8) camera.position.y = floor + 0.8;
  if (shakeAmt > 0) {
    camera.position.x += (Math.random() - 0.5) * shakeAmt;
    camera.position.y += (Math.random() - 0.5) * shakeAmt;
    shakeAmt = Math.max(0, shakeAmt - rawDt * 2.5);
  }
  camera.lookAt(camTarget.x, camTarget.y + 1, camTarget.z);
  fog.near = 45 - night * 15; fog.far = 210 - night * 60;
  sky.update(camera, time, night, fog);
  minimap.update(s.x, s.z, faceX, faceZ, rawDt, towers, rifts, save.shards);
  if (started) audio.update(rawDt, { elevation: 0.3 - night * 0.6, speed, grounded: s.grounded });
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ---------- 무기와 작업대 ----------
const weaponHolder = new THREE.Group();
weaponHolder.position.set(0.62, 0.05, 0.1);
cube.group.add(weaponHolder);
function weaponMesh(id: string): THREE.Object3D | null {
  const g = new THREE.Group();
  const lam = (c: string, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: e, flatShading: true });
  if (id === 'sword') {
    const blade = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), lam('#7ff0ff', 0.6)); blade.scale.set(0.6, 4.2, 1); blade.position.y = 0.55;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.1), lam('#6a58c9'));
    g.add(blade, guard);
  } else if (id === 'hammer') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), lam('#5a3c4a')); handle.position.y = 0.3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.26), lam('#ffd36b', 0.35)); head.position.y = 0.75;
    g.add(handle, head);
  } else if (id === 'staff') {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 5), lam('#e8e4ff')); rod.position.y = 0.4;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), lam('#ff9ad0', 0.9)); star.position.y = 1.05;
    g.add(rod, star);
  } else return null;
  g.rotation.z = -0.35;
  return g;
}
function equip(id: string) {
  if (!save.weapons.includes(id)) return;
  save.equipped = id;
  const w = WEAPONS[id];
  combat.weapon = { radius: w.radius, damage: w.damage, knock: w.knock };
  weaponHolder.clear();
  const m = weaponMesh(id);
  if (m) weaponHolder.add(m);
  writeSave(save);
}
equip(save.equipped);
const forgeEl = document.getElementById('forge')!;
const forgeBtn = document.getElementById('forgeBtn') as HTMLButtonElement;
function renderForge() {
  document.getElementById('forgeGems')!.textContent = String(save.gems);
  document.getElementById('forgeCores')!.textContent = String(save.cores);
  const list = document.getElementById('forgeList')!;
  list.innerHTML = '';
  Object.entries(WEAPONS).forEach(([id, w], k) => {
    const li = document.createElement('li');
    const owned = save.weapons.includes(id);
    const cost = w.gems || w.cores ? `별가루 ${w.gems}${w.cores ? ` · 핵 ${w.cores}` : ''}` : '기본';
    li.innerHTML = `<span style="text-align:left"><b>${k + 1}. ${w.name}</b><small>${w.desc} · ${cost}</small></span>`;
    const b = document.createElement('button');
    b.type = 'button';
    if (save.equipped === id) { b.textContent = '장착 중'; b.className = 'eq'; b.disabled = true; }
    else if (owned) { b.textContent = '장착'; b.onclick = () => { equip(id); renderForge(); }; }
    else {
      b.textContent = '제작';
      b.disabled = save.gems < w.gems || save.cores < w.cores;
      b.onclick = () => {
        if (save.gems < w.gems || save.cores < w.cores) return;
        save.gems -= w.gems; save.cores -= w.cores;
        save.weapons.push(id);
        hud.setGems(save.gems);
        equip(id);
        audio.milestone();
        hud.banner(`${w.name} 완성!`, w.desc, 2400);
        renderForge();
      };
    }
    li.appendChild(b);
    list.appendChild(li);
  });
}
let forgeOpen = false;
function setForge(open: boolean) {
  if (open && (!started || !atForge())) return;
  forgeOpen = open;
  forgeEl.classList.toggle('hidden', !open);
  if (open) { renderForge(); document.exitPointerLock?.(); }
  else input.start();
}
function atForge() { return Math.hypot(physics.state.x - home.x, physics.state.z - home.z) < home.r && deathT < 0; }
forgeBtn.onclick = () => setForge(true);
document.getElementById('forgeClose')!.onclick = () => setForge(false);
addEventListener('keydown', (e) => {
  if (e.repeat || !started) return;
  if (e.code === 'KeyB') setForge(!forgeOpen);
  if (e.code === 'Escape' && forgeOpen) setForge(false);
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0) {
    const id = Object.keys(WEAPONS)[n];
    if (save.weapons.includes(id)) { equip(id); hud.banner(WEAPONS[id].name, '', 1000); }
  }
});
setInterval(() => {
  const near = started && atForge();
  forgeBtn.hidden = !near || forgeOpen;
  if (forgeOpen && !near) setForge(false);
}, 300);

// 검증/디버깅용 훅
(window as unknown as Record<string, unknown>).__game = {
  state: () => ({ ...physics.state, standingOn: !!physics.state.standingOn, hp, maxHp: stats.maxHp, shards: [...save.shards], gems: save.gems, monsters: monsters.list.length, night: nightAmount() }),
  teleport: (x: number, z: number, y?: number) => { physics.teleport(x, y ?? world.height(x, z) + 2, z); camTarget.set(x, physics.state.y, z); },
  setClock: (c: number) => { clock = c; },
  islands: () => world.islands.map((i) => ({ id: i.id, role: i.role, x: Math.round(i.x), z: Math.round(i.z), y: i.y })),
  towers: () => towers.map((t) => ({ id: t.id, start: t.course.platforms[0], goal: t.course.goal })),
  rifts: () => rifts.map((r) => ({ id: r.id, state: r.state, ...r.center })),
  spawn: (kind: MonsterKind, dx = 5, dz = 0) => monsters.spawn(kind, physics.state.x + dx, physics.state.z + dz),
  hurt: (n: number) => hooks.hurtPlayer(n, physics.state.x + 1, physics.state.z),
  give: (id: string) => gainShard(id),
  rich: () => { save.gems += 200; save.cores += 5; hud.setGems(save.gems); },
  mons: () => monsters.list.map((m) => ({ k: m.kind, hp: m.hp, owner: m.owner, d: +Math.hypot(m.x - physics.state.x, m.z - physics.state.z).toFixed(2), dy: +(m.cy - physics.state.y).toFixed(2) })),
  combat: () => ({ t: combat.t, combo: combat.combo, hit: combat.hit }),
};
