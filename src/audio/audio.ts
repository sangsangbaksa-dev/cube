// 단조 5음계 아르페지오: 황혼의 부유섬 분위기
const SCALE = [0, 3, 5, 7, 10, 12, 15];
const noteFreq = (root: number, deg: number) => root * Math.pow(2, SCALE[Math.max(0, Math.min(SCALE.length - 1, deg))] / 12);
const nextDegree = (d: number, r: () => number) => Math.max(0, Math.min(SCALE.length - 1, d + Math.round((r() - 0.5) * 4)));

// 파일 없이 WebAudio로 합성하는 소리: 효과음 + 바람/새/귀뚜라미 + 잔잔한 오르골 멜로디.
// 브라우저 정책상 첫 클릭/키 입력 뒤에 unlock()을 불러야 소리가 난다.
const MUTE_KEY = 'cubesky.muted';
const MUSIC_GAIN = 0.55;
// 전투 베이스 패턴: 8분음표 8칸, 기준음에서 반음 수 (-1 = 쉼). A단조 느낌.
const BATTLE_BASS = [0, -1, -1, 0, 3, -1, 5, -1];
const BOSS_BASS = [0, -1, 0, -1, 3, -1, 0, -1];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface AmbientEnv {
  /** 해 높이 -1~1 */
  elevation: number;
  speed: number;
  grounded: boolean;
}

type Wave = OscillatorType;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private amb!: GainNode;
  private battle!: GainNode;
  private windGain!: GainNode;
  private noise!: AudioBuffer;
  muted = false;
  private nextNote = 0;
  private degree = 2;
  private birdT = 2;
  private cricketT = 0;
  // 전투/체력 상태
  private threat = 0;
  private bossFight = false;
  private lowHealth = false;
  private battleNext = 0;
  private battleStep = 0;
  private eerieT = 10;
  private heartT = 0;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 저장소를 못 쓰면 기본값 */ }
  }

  get state(): string {
    return this.ctx ? this.ctx.state : 'locked';
  }

  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.amb = ctx.createGain(); this.amb.gain.value = 1; this.amb.connect(this.master);
      this.music = ctx.createGain(); this.music.gain.value = MUSIC_GAIN;
      this.music.connect(this.master);
      // 메아리: 오르골 소리가 공간감 있게 울린다
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.36;
      const fb = ctx.createGain(); fb.gain.value = 0.38;
      const wet = ctx.createGain(); wet.gain.value = 0.5;
      this.music.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(wet).connect(this.master);

      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // 바람: 낮은 대역만 통과시킨 노이즈를 계속 깔아둔다
      const wind = ctx.createBufferSource();
      wind.buffer = this.noise; wind.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0.02;
      wind.connect(lp).connect(this.windGain).connect(this.amb);
      wind.start();

      // 전투 음악 층: 적이 가까우면 서서히 올라온다 (오르골 멜로디는 그동안 낮아진다)
      this.battle = ctx.createGain(); this.battle.gain.value = 0;
      this.battle.connect(this.master);
    } catch {
      this.ctx = null;
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* 무시 */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // ---- 소리 재료 ----
  private tone(freq: number, dur: number, type: Wave, vol: number, slideTo?: number, delay = 0, dest?: AudioNode) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private burst(dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, dest?: AudioNode, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  /** 매번 살짝 다른 음높이: 같은 소리가 반복돼도 단조롭지 않게 */
  private vary(amount = 0.05): number {
    return 1 + (Math.random() * 2 - 1) * amount;
  }

  // ---- 효과음 ----
  jump() { this.tone(360, 0.14, 'sine', 0.22, 760); }
  land(impact: number) {
    const v = Math.min(0.3, 0.06 + impact * 0.01);
    this.tone(150, 0.14, 'sine', v, 60);
    this.burst(0.08, v * 0.5, 'lowpass', 900, 300);
  }
  launch() {
    this.tone(180, 0.55, 'sawtooth', 0.07, 1400);
    this.tone(360, 0.6, 'sine', 0.12, 1800);
    [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.08, undefined, 0.15 + i * 0.08));
  }
  step() { this.burst(0.035, 0.035, 'bandpass', 1100, 700); }
  splash() {
    this.burst(0.4, 0.22, 'lowpass', 3200, 500);
    this.tone(520, 0.12, 'sine', 0.06, 900, 0.04);
  }
  collect(value: number) {
    if (value >= 5) {
      [660, 880, 1320, 1760].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.16, undefined, i * 0.07));
    } else {
      this.tone(880, 0.22, 'triangle', 0.17);
      this.tone(1320, 0.3, 'triangle', 0.15, undefined, 0.08);
    }
  }
  milestone() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.18, undefined, i * 0.11));
  }

  // ---- 전투 효과음 ----
  /** 공격 휘두르기. combo 1~3: 콤보가 오를수록 휙 소리가 높아지고, 3단은 반짝임이 붙는다 */
  swing(combo: number) {
    const c = clamp(Math.round(combo), 1, 3);
    const r = this.vary(0.05);
    this.burst(0.12 + c * 0.03, 0.1 + c * 0.02, 'bandpass', (450 + c * 220) * r, (1500 + c * 450) * r);
    if (c === 3) {
      this.tone(1568 * r, 0.18, 'triangle', 0.08, undefined, 0.06);
      this.tone(2349 * r, 0.22, 'sine', 0.05, undefined, 0.11);
    }
  }
  /** 공격이 맞음: 톡 터지는 소리 + 짧은 묵직한 쿵 */
  hit() {
    const r = this.vary();
    this.tone(640 * r, 0.07, 'triangle', 0.14, 180 * r);
    this.burst(0.06, 0.12, 'bandpass', 2600 * r, 1100 * r);
    this.tone(120 * r, 0.16, 'sine', 0.2, 48);
  }
  /** 적이 맞음: 삑 하는 귀여운 비명 */
  enemyHurt() {
    const r = this.vary(0.08);
    this.tone(240 * r, 0.12, 'sine', 0.17, 620 * r);
    this.tone(620 * r, 0.2, 'sine', 0.1, 300 * r, 0.12);
  }
  /** 적 소멸. big=true(보스)는 길고 신나는 쿵 + 아르페지오 */
  enemyDie(big: boolean) {
    const r = this.vary();
    if (big) {
      this.tone(90 * r, 0.9, 'sine', 0.25, 40);
      this.burst(0.7, 0.14, 'lowpass', 1400, 180);
      [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f * r, 0.5, 'triangle', 0.12, undefined, 0.35 + i * 0.1));
      return;
    }
    this.burst(0.22, 0.16, 'lowpass', 2200, 300);
    this.tone(200 * r, 0.2, 'sine', 0.1, 70);
    [1318, 988, 740].forEach((f, i) => this.tone(f * r, 0.25, 'triangle', 0.11, undefined, 0.08 + i * 0.09));
  }
  /** 플레이어가 맞음: 부드러운 oof 쿵 + 살짝 어긋난 내려가는 음 */
  hurt() {
    const r = this.vary();
    this.tone(170 * r, 0.2, 'sine', 0.22, 90);
    this.tone(330 * r, 0.32, 'triangle', 0.08, 200 * r);
    this.tone(330 * r * 1.06, 0.32, 'triangle', 0.08, 212 * r);
  }
  dash() {
    const r = this.vary();
    this.burst(0.24, 0.13, 'highpass', 700 * r, 3800 * r);
    this.tone(660 * r, 0.22, 'sine', 0.05, 1320 * r);
  }
  /** 공중 점프: 점프보다 높고 반짝이는 변형 */
  doubleJump() {
    const r = this.vary();
    this.tone(520 * r, 0.16, 'sine', 0.2, 1100 * r);
    [1568, 2093, 2637].forEach((f, i) => this.tone(f * r, 0.12, 'triangle', 0.08, undefined, 0.05 + i * 0.05));
  }
  /** 급강하 시작: 휘이익 하고 음이 떨어진다 */
  slamStart() {
    const r = this.vary();
    this.tone(1200 * r, 0.45, 'sine', 0.14, 180 * r);
  }
  /** 착지 충격. power 0~1 */
  slamImpact(power: number) {
    const p = clamp(power, 0, 1);
    const r = this.vary();
    this.tone((100 - p * 45) * r, 0.5, 'sine', 0.1 + p * 0.2, 36);
    this.burst(0.35, 0.08 + p * 0.1, 'lowpass', 900, 150);
    this.burst(0.6, 0.04 + p * 0.08, 'bandpass', 500, 180, undefined, 0.05);
  }
  /** 적 머리 밟기: 통통 튀는 boing */
  stomp() {
    const r = this.vary();
    this.tone(220 * r, 0.3, 'sine', 0.2, 660 * r);
    this.tone(1100 * r, 0.06, 'triangle', 0.06, undefined, 0);
  }
  /** 별 조각 획득: 펜타토닉 아르페지오 + 반짝임 */
  shard() {
    const r = this.vary(0.02);
    [523, 587, 659, 784, 880, 1047, 1319].forEach((f, i) => this.tone(f * r, 0.45, 'triangle', 0.1, undefined, i * 0.07));
    this.tone(2093 * r, 1.0, 'sine', 0.06, undefined, 0.5);
    this.burst(0.8, 0.07, 'highpass', 5000, 9000, undefined, 0.45);
  }
  /** 마법사 구슬 발사: 으스스한 wub */
  orbShoot() {
    const r = this.vary();
    this.tone(330 * r, 0.35, 'triangle', 0.15, 110 * r);
    this.tone(165 * r, 0.35, 'sine', 0.1, 70 * r, 0.03);
  }
  /** 구슬을 되받아침: 맑은 핑 */
  orbReflect() {
    const r = this.vary();
    this.tone(1760 * r, 0.25, 'sine', 0.16, 2640 * r);
    this.tone(3520 * r, 0.1, 'sine', 0.04);
  }
  /** 골렘 보스 으르렁 (~0.8초): 톱니파 + 로우패스 + 떨림 */
  roar() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const dur = 0.8;
    const r = this.vary(0.03);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(74 * r, t);
    o.frequency.linearRampToValueAtTime(52 * r, t + dur);
    // 떨림(vibrato): 낮은 LFO가 음높이를 살짝 흔든다
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 5;
    lfo.connect(lfoDepth).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.linearRampToValueAtTime(420, t + 0.25);
    lp.frequency.linearRampToValueAtTime(150, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.12);
    g.gain.setValueAtTime(0.2, t + dur - 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }
  /** 균열이 맥동할 때: 낮고 불길한 부풀음 */
  riftPulse() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const dur = 1.8;
    const r = this.vary(0.03);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(58 * r, t);
    o.frequency.linearRampToValueAtTime(42 * r, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
    this.burst(1.4, 0.05, 'lowpass', 260, 520);
  }
  /** 회복: 올라가는 두 음 */
  heal() {
    const r = this.vary(0.03);
    this.tone(660 * r, 0.28, 'sine', 0.14);
    this.tone(990 * r, 0.4, 'sine', 0.13, undefined, 0.14);
  }
  /** 쓰러짐: 슬픈 내려가는 작은 멜로디 */
  death() {
    const r = this.vary(0.02);
    [523, 466, 392, 311].forEach((f, i) => this.tone(f * r, i === 3 ? 0.9 : 0.4, 'triangle', 0.13, undefined, i * 0.3));
  }
  /** 부활: 따뜻한 화음 */
  respawn() {
    const r = this.vary(0.01);
    [262, 330, 392, 523].forEach((f, i) => this.tone(f * r, 1.2, 'sine', 0.07, undefined, i * 0.05));
  }
  /** 체크포인트: 아늑한 모닥불 종소리 */
  checkpoint() {
    const r = this.vary();
    this.tone(1046 * r, 0.5, 'triangle', 0.14);
    this.tone(1568 * r, 0.6, 'sine', 0.08, undefined, 0.12);
    this.burst(0.12, 0.05, 'bandpass', 2400, 1400, undefined, 0.02);
    this.burst(0.08, 0.04, 'bandpass', 2000, 1200, undefined, 0.22);
  }

  // ---- 업적·콤보·상점·퀘스트 효과음 ----
  /** 업적 달성: 밝은 삼각파 3음 상승 팡파르 + 반짝이는 고음 (약 0.6초) */
  achievement() {
    const r = this.vary(0.01);
    [659, 880, 1319].forEach((f, i) => this.tone(f * r, 0.3, 'triangle', 0.14, undefined, i * 0.1));
    this.tone(2637 * r, 0.35, 'sine', 0.05, undefined, 0.22);
    this.burst(0.25, 0.05, 'highpass', 6000, 10000, undefined, 0.24);
  }
  /** 콤보 틱: 체인이 오를수록 5음계를 따라 올라가는 짧은 '띵' (최대 2옥타브) */
  comboTick(chain: number) {
    const n = SCALE.length;
    const c = Number.isFinite(chain) ? Math.floor(chain) : 1;
    const step = clamp(c - 1, 0, n * 2 - 1);
    const oct = Math.floor(step / n);
    const f = 523.25 * 2 ** ((SCALE[step % n] + oct * 12) / 12) * this.vary(0.01);
    this.tone(f, 0.12, 'triangle', 0.12);
    this.tone(f * 2, 0.08, 'sine', 0.03);
  }
  /** 콤보 정산: 점수가 클수록 화음이 길고 밝아진다. 신기록이면 음 하나를 더 얹는다 */
  comboEnd(score: number, newBest: boolean) {
    const s = Number.isFinite(score) ? Math.max(0, score) : 0;
    const k = clamp(Math.log10(s + 10) / 4, 0.25, 1); // 0점 0.25 ~ 만점 1
    const dur = 0.35 + k * 0.5;
    const vol = 0.07 + k * 0.06;
    const root = 523.25;
    [1, 5 / 4, 3 / 2].forEach((ratio) => this.tone(root * ratio, dur, 'triangle', vol));
    if (k > 0.5) this.tone(root * 2 * 3 / 2, dur * 0.8, 'sine', vol * 0.5, undefined, 0.04);
    if (newBest) this.tone(root * 2, 0.7, 'triangle', 0.1, undefined, 0.2);
  }
  /** 콤보 끊김: 내려가는 둔탁한 소리 */
  comboBreak() {
    const r = this.vary(0.03);
    this.tone(330 * r, 0.32, 'triangle', 0.13, 110 * r);
    this.burst(0.18, 0.1, 'lowpass', 600, 120);
  }
  /** 동전: 높은 '칭' 두 음 (사각파 짧게 + 삼각파) */
  coin() {
    const r = this.vary(0.03);
    this.tone(988 * r, 0.09, 'square', 0.05);
    this.tone(1319 * r, 0.24, 'triangle', 0.13, undefined, 0.07);
  }
  /** 퀘스트 완료: 부드러운 종소리 두 음 */
  questDone() {
    const r = this.vary(0.01);
    this.tone(784 * r, 0.9, 'sine', 0.14);
    this.tone(1175 * r, 1.1, 'sine', 0.1, undefined, 0.18);
  }
  /** 유성 낙하: 멀리서 하강하는 쉭 소리 (노이즈 + 하강 필터 스윕, 1.5초) */
  meteorFall() {
    this.burst(1.5, 0.12, 'bandpass', 2200, 300);
    this.burst(1.5, 0.05, 'highpass', 4000, 1200);
  }
  /** 유성 충돌: 낮은 쿵 + 반짝임 */
  meteorImpact() {
    const r = this.vary();
    this.tone(110 * r, 0.6, 'sine', 0.26, 38);
    this.burst(0.4, 0.14, 'lowpass', 700, 120);
    this.tone(1568 * r, 0.25, 'triangle', 0.05, undefined, 0.06);
    this.burst(0.3, 0.05, 'highpass', 6000, 9000, undefined, 0.06);
  }
  /** 구매 완료: 짧은 상승 아르페지오 */
  purchase() {
    const r = this.vary(0.02);
    [659, 784, 988, 1319].forEach((f, i) => this.tone(f * r, 0.22, 'triangle', 0.1, undefined, i * 0.06));
  }
  /** 유령 등장: 신비로운 짧은 글리산도 (두 겹으로 위로 미끄러진다) */
  ghostStart() {
    const r = this.vary(0.02);
    this.tone(220 * r, 0.8, 'sine', 0.13, 880 * r);
    this.tone(330 * r, 0.8, 'triangle', 0.05, 1320 * r, 0.06);
    this.burst(0.6, 0.04, 'bandpass', 800, 2400);
  }

  /** 주변 적 위협도 0~1과 보스 여부. 전투 음악 층과 오르골 덕킹에 쓰인다 */
  setThreat(level: number, boss: boolean) {
    this.threat = clamp(level, 0, 1);
    this.bossFight = boss;
  }

  /** 체력이 적을 때 심장 박동 */
  setLowHealth(on: boolean) {
    this.lowHealth = on;
  }

  // ---- 환경음 + 배경 멜로디 ----
  update(dt: number, env: AmbientEnv) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    const move = Math.min(1, env.speed / 9);
    this.windGain.gain.setTargetAtTime(0.018 + 0.03 * move + (env.grounded ? 0 : 0.02), now, 0.25);
    if (this.muted) return;

    const day = env.elevation > 0.12;
    const night = env.elevation < -0.05;

    if (day) {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 3 + Math.random() * 7;
        const base = 2300 + Math.random() * 1300;
        this.tone(base, 0.09, 'sine', 0.04, base * 1.5, 0, this.amb);
        this.tone(base * 1.2, 0.1, 'sine', 0.035, base * 1.7, 0.12, this.amb);
        if (Math.random() < 0.5) this.tone(base * 1.1, 0.08, 'sine', 0.03, base * 1.6, 0.26, this.amb);
      }
    }
    if (night) {
      this.cricketT -= dt;
      if (this.cricketT <= 0) {
        this.cricketT = 0.7 + Math.random() * 0.5;
        for (let i = 0; i < 3; i++) this.tone(4300, 0.04, 'sine', 0.012, undefined, i * 0.07, this.amb);
      }
    }

    // 전투 중엔 오르골을 ~1/4 크기로 낮춰 긴장감을 준다
    const duck = clamp((this.threat - 0.15) / 0.35, 0, 1);
    this.music.gain.setTargetAtTime(MUSIC_GAIN * (1 - 0.75 * duck), now, 0.5);

    // 오르골 멜로디: 낮엔 경쾌하게, 밤엔 낮은 음으로 느리고 조용하게
    if (this.nextNote < now) this.nextNote = now + 0.2;
    while (this.nextNote < now + 0.25) {
      this.degree = nextDegree(this.degree, Math.random);
      const root = night ? 164.81 : 196;
      const f = noteFreq(root, this.degree);
      const vol = night ? 0.07 : 0.1;
      const t0 = this.nextNote - now;
      this.tone(f, 1.5, 'sine', vol, undefined, t0, this.music);
      this.tone(f * 2, 0.9, 'triangle', vol * 0.3, undefined, t0, this.music);
      this.nextNote += night ? 1.5 + Math.random() * 1.6 : 0.7 + Math.random() * 0.9;
    }

    this.scheduleBattle(now);

    // 밤이고 조용하면 가끔 멀리서 나는 으스스한 음
    if (night && this.threat < 0.05) {
      this.eerieT -= dt;
      if (this.eerieT <= 0) {
        this.eerieT = 8 + Math.random() * 7;
        const f = 196 * this.vary(0.04);
        this.tone(f, 2.4, 'sine', 0.025, f * 0.94, 0, this.amb);
        this.tone(f * 1.414, 2.2, 'sine', 0.012, f * 1.3, 0.7, this.amb);
      }
    }

    // 체력이 적으면 조용한 심장 박동 (0.9초마다 쿵쿵)
    if (this.lowHealth) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.9;
        this.tone(78, 0.12, 'sine', 0.1, 46);
        this.tone(72, 0.1, 'sine', 0.07, 40, 0.18);
      }
    } else {
      this.heartT = 0;
    }
  }

  /** 전투 음악 층: 8분음표 격자로 베이스/하이햇(보스는 톰 추가)을 미리 예약한다 */
  private scheduleBattle(now: number) {
    const level = this.threat;
    this.battle.gain.setTargetAtTime(clamp(level, 0, 1) * 0.5, now, 0.3);
    if (level <= 0.05) {
      this.battleNext = now;
      return;
    }
    if (this.battleNext < now) this.battleNext = now + 0.05;
    const boss = this.bossFight;
    const root = boss ? 55 : 110;
    const pattern = boss ? BOSS_BASS : BATTLE_BASS;
    while (this.battleNext < now + 0.3) {
      const s = this.battleStep % 8;
      const t0 = this.battleNext - now;
      const rel = pattern[s];
      if (rel >= 0) {
        this.tone(root * 2 ** (rel / 12) * this.vary(0.01), 0.2, 'triangle', 0.12, undefined, t0, this.battle);
      }
      if (boss && s % 4 === 0) {
        this.tone(140 * this.vary(), 0.35, 'sine', 0.2, 58, t0, this.battle);
      }
      this.burst(0.035, s % 2 ? 0.05 : 0.03, 'highpass', 7000, 9000, this.battle, t0);
      this.battleNext += 0.25;
      this.battleStep++;
    }
  }
}
