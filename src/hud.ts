// 화면 UI를 한곳에 모은다.
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touch) document.body.classList.add('touch');

const HEART = '<svg class="heart" viewBox="0 0 24 22" aria-hidden="true"><path d="M12 20.5 3.3 12A5.3 5.3 0 0 1 12 4.6 5.3 5.3 0 0 1 20.7 12Z"/></svg>';
let lastHp = -1;
const bannerQueue: [string, string, number][] = [];
let bannerBusy = false;
let hitTimer = 0;

function nextBanner() {
  const b = bannerQueue.shift();
  if (!b) { bannerBusy = false; return; }
  bannerBusy = true;
  $('bannerTitle').textContent = b[0];
  $('bannerSub').textContent = b[1];
  $('banner').classList.add('show');
  setTimeout(() => { $('banner').classList.remove('show'); setTimeout(nextBanner, 400); }, b[2]);
}

export const hud = {
  isTouch: touch,
  setPlace(name: string) { $('place').textContent = name; },
  setObjective(text: string) { const o = $('objective'); o.textContent = text; o.hidden = !text; },
  setHearts(hp: number, max: number) {
    const el = $('hearts');
    if (el.children.length !== max) el.innerHTML = HEART.repeat(max);
    [...el.children].forEach((h, i) => {
      h.classList.toggle('empty', i >= hp);
      if (lastHp >= 0 && ((i >= hp && i < lastHp) || (i < hp && i >= lastHp))) {
        h.classList.remove('pop'); void (h as HTMLElement).getBoundingClientRect(); h.classList.add('pop');
      }
    });
    el.setAttribute('aria-label', `체력 ${hp}/${max}`);
    lastHp = hp;
  },
  setGems(n: number) { $('gems').textContent = String(n); },
  setShards(n: number, total: number) {
    const el = $('shards');
    if (el.children.length !== total) el.innerHTML = '<b></b>'.repeat(total);
    [...el.children].forEach((b, i) => b.classList.toggle('on', i < n));
    el.setAttribute('aria-label', `별조각 ${n}/${total}`);
  },
  bossBar(name: string | null, hp01: number) {
    $('boss').hidden = !name;
    if (name) { $('bossName').textContent = name; $('bossFill').style.width = `${Math.max(0, hp01) * 100}%`; }
  },
  flashDamage() {
    const v = $('vignette');
    v.classList.add('hit');
    clearTimeout(hitTimer);
    hitTimer = window.setTimeout(() => v.classList.remove('hit'), 90);
  },
  setLowHealth(on: boolean) { document.body.classList.toggle('low', on); },
  setThreat(on: boolean) { document.body.classList.toggle('threat', on); },
  banner(title: string, sub = '', ms = 3000) {
    bannerQueue.push([title, sub, ms]);
    if (!bannerBusy) nextBanner();
  },
  showDeath(on: boolean) { $('death').classList.toggle('hidden', !on); },
  showVictory(onClose: () => void) {
    $('victory').classList.remove('hidden');
    $('victoryBtn').onclick = () => { $('victory').classList.add('hidden'); onClose(); };
  },
  setMuted(m: boolean) { $('muteBtn').textContent = m ? '소리 꺼짐 (M)' : '소리 켜짐 (M)'; $('muteBtn').classList.toggle('on', m); },
  setFast(f: boolean) { $('timeBtn').classList.toggle('on', f); },
  onMute(cb: () => void) {
    $('muteBtn').addEventListener('click', cb);
    addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) cb(); });
  },
  onFast(cb: () => void) {
    $('timeBtn').addEventListener('click', cb);
    addEventListener('keydown', (e) => { if (e.code === 'KeyT' && !e.repeat) cb(); });
  },
  onReset(show: boolean, cb: () => void) {
    $('resetBtn').hidden = !show;
    $('resetBtn').addEventListener('click', (e) => { e.stopPropagation(); cb(); });
  },
  onStart(cb: () => void) {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      $('start').classList.add('hidden');
      document.body.classList.add('started');
      cb();
    };
    $('startBtn').addEventListener('click', go);
    addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') go(); });
    $('startBtn').focus({ preventScroll: true });
  },
};
