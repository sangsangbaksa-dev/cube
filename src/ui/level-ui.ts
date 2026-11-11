// 별빛 레벨 배지: 상태 패널 오른쪽에 레벨 숫자, 칭호, XP 바를 보인다. 레벨업 연출과 "+xp" 표시도 맡는다.
import type { Level, LevelUp } from '../game/level';

const P = 'lv';
const UP_MS = 1800;
const GAIN_MS = 500;

const CSS = `
.${P}-badge { position: fixed; left: calc(var(--left, 14px) + 200px); top: var(--top, 12px); z-index: 5;
  height: 40px; display: flex; align-items: center; gap: 8px; max-width: 170px; pointer-events: none;
  color: var(--ink, #f5e9db); font-family: var(--body, system-ui); text-shadow: 0 1px 6px rgba(10, 6, 30, .85); }
.${P}-ring { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
  border: 1.5px solid var(--gold, #ffd36b); background: rgba(37, 35, 51, .82); box-sizing: border-box; }
.${P}-num { font-family: var(--display, system-ui); font-size: 14px; line-height: 1; color: var(--gold, #ffd36b);
  font-variant-numeric: tabular-nums; }
.${P}-col { min-width: 0; flex: 1; display: grid; gap: 4px; }
.${P}-title { font-family: var(--display, system-ui); font-size: 12px; line-height: 1.1; color: #e5bd91;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${P}-bar { position: relative; height: 3px; border-radius: 2px; background: rgba(245, 233, 219, .22); overflow: visible; }
.${P}-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; border-radius: 2px; background: var(--cyan, #6fe3ff);
  transition: width .35s ease-out; }
.${P}-plus { position: absolute; right: -4px; top: -14px; font-family: var(--display, system-ui); font-size: 13px;
  color: var(--cyan, #6fe3ff); white-space: nowrap; animation: ${P}-plus .9s ease-out forwards; }
@keyframes ${P}-plus { 0% { opacity: 0; transform: translateY(4px); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }
body:not(.started) .${P}-badge { visibility: hidden; }
body.touch .${P}-title { display: none; }
body.touch .${P}-badge { left: calc(var(--left, 14px) + 180px); }
@media (max-width: 680px) {
  .${P}-badge, body.touch .${P}-badge { top: calc(var(--top, 12px) + 46px); left: var(--left, 14px); }
  .${P}-title { display: none; }
}
.${P}-up { position: fixed; left: 50%; top: 38%; transform: translate(-50%, -50%); z-index: 7; pointer-events: none;
  text-align: center; white-space: nowrap; font-family: var(--display, system-ui); color: var(--gold, #ffd36b);
  text-shadow: 0 3px 16px rgba(10, 6, 30, .9), 0 0 24px rgba(255, 211, 107, .45);
  animation: ${P}-up ${UP_MS}ms ease-out forwards; }
.${P}-up-main { font-size: 40px; line-height: 1.05; }
.${P}-up-title { margin-top: 6px; font-size: 20px; color: var(--cyan, #6fe3ff); }
@keyframes ${P}-up { 0% { opacity: 0; transform: translate(-50%, -40%) scale(.85); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1.04); }
  20% { transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -60%); } }
@media (max-width: 480px) { .${P}-up-main { font-size: 32px; } .${P}-up-title { font-size: 17px; } }
@media (prefers-reduced-motion: reduce) { .${P}-up, .${P}-plus { animation-duration: 1ms; } .${P}-fill { transition: none; } }`;

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
}

function fmtGain(v: number): string {
  return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

export function levelUI(l: Level): { refresh(): void; levelUp(info: LevelUp): void; gain(xp: number): void } {
  injectStyle();

  const badge = document.createElement('div');
  badge.className = `${P}-badge`;
  badge.setAttribute('role', 'status');
  badge.innerHTML = `<div class="${P}-ring"><span class="${P}-num"></span></div>`
    + `<div class="${P}-col"><div class="${P}-title"></div><div class="${P}-bar"><i class="${P}-fill"></i></div></div>`;
  document.body.append(badge);
  const num = badge.querySelector<HTMLElement>(`.${P}-num`)!;
  const title = badge.querySelector<HTMLElement>(`.${P}-title`)!;
  const fill = badge.querySelector<HTMLElement>(`.${P}-fill`)!;

  let lastKey = '';
  function refresh() {
    const key = `${l.level}|${l.title}|${l.progress.toFixed(4)}|${l.xp}|${l.need}`;
    if (key === lastKey) return;
    lastKey = key;
    num.textContent = String(l.level);
    title.textContent = l.title;
    fill.style.width = `${Math.min(100, Math.max(0, l.progress * 100))}%`;
    badge.setAttribute('aria-label', `별빛 레벨 ${l.level}, ${l.title}, 경험치 ${l.xp} / ${l.need || '최대'}`);
  }

  let upEl: HTMLElement | null = null;
  let upTimer = 0;
  function levelUp(info: LevelUp) {
    refresh();
    upEl?.remove();
    window.clearTimeout(upTimer);
    const el = document.createElement('div');
    el.className = `${P}-up`;
    const main = document.createElement('div');
    main.className = `${P}-up-main`;
    main.textContent = `레벨 업! Lv.${info.level}`;
    el.append(main);
    if (info.titleChanged) {
      const t = document.createElement('div');
      t.className = `${P}-up-title`;
      t.textContent = `새 칭호 · ${info.title}`;
      el.append(t);
    }
    document.body.append(el);
    upEl = el;
    upTimer = window.setTimeout(() => { el.remove(); if (upEl === el) upEl = null; }, UP_MS);
  }

  let pending = 0;
  let gainTimer = 0;
  function gain(xp: number) {
    refresh();
    if (!(xp > 0)) return;
    pending += xp;
    if (gainTimer) return;
    gainTimer = window.setTimeout(() => {
      gainTimer = 0;
      const v = pending;
      pending = 0;
      if (v < 0.05) return;
      const s = document.createElement('div');
      s.className = `${P}-plus`;
      s.textContent = `+${fmtGain(v)}`;
      badge.append(s);
      window.setTimeout(() => s.remove(), 900);
    }, GAIN_MS);
  }

  refresh();
  return { refresh, levelUp, gain };
}
