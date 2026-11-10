// 화면 UI를 한곳에 모은다.
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touch) document.body.classList.add('touch');

const bannerQueue: [string, string, number][] = [];
let bannerBusy = false;
let bossStatus = '';

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
  setTrial(text: string) {
    const el = $('trial');
    if (el.textContent !== text) el.textContent = text;
    el.hidden = !text;
  },
  setBoss(active: boolean, hp: number, hearts: number) {
    const status = active ? `${hp}/${hearts}` : '';
    if (status === bossStatus) return;
    bossStatus = status;
    $('boss').hidden = !active;
    if (!active) return;
    const meter = $<HTMLProgressElement>('bossHealth');
    meter.value = hp;
    $('bossHearts').textContent = '◆'.repeat(hearts) + '◇'.repeat(3 - hearts);
    $('bossHearts').setAttribute('aria-label', `남은 체력 ${hearts}/3`);
  },
  setGems(n: number, total = 0) { $('gems').textContent = total ? `${n}/${total}` : String(n); },
  setShards(n: number, total: number) {
    const el = $('shards');
    if (el.children.length !== total) el.innerHTML = '<b></b>'.repeat(total);
    [...el.children].forEach((b, i) => b.classList.toggle('on', i < n));
    el.setAttribute('aria-label', `별조각 ${n}/${total}`);
  },
  banner(title: string, sub = '', ms = 3000) {
    bannerQueue.push([title, sub, ms]);
    if (!bannerBusy) nextBanner();
  },
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
