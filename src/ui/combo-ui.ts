// 공중 콤보 표시: 화면 오른쪽 가운데에 체인 숫자, 등급, 점수를 띄운다. 클릭은 통과시킨다.
import type { ComboEvent } from '../game/combo';

const P = 'cq-combo';
const HOLD_END = 1.6, FADE_END = 0.5;
const HOLD_BROKEN = 0.7, FADE_BROKEN = 0.45;

type Mode = 'idle' | 'live' | 'end' | 'broken';

const CSS = `
.${P} { position: fixed; top: 42%; right: var(--right, 14px); transform: translateY(-50%); z-index: 20;
  pointer-events: none; text-align: right; color: var(--ink, #eef0ff); font-family: var(--body, system-ui);
  text-shadow: 0 2px 10px rgba(10, 6, 30, .85); }
.${P}[data-mode="idle"] { visibility: hidden; opacity: 0; }
.${P}-chain { display: inline-block; font-family: var(--display, system-ui); font-size: 64px; line-height: 1; color: var(--gold, #ffd36b);
  filter: drop-shadow(0 0 10px rgba(255, 211, 107, .45)); }
.${P}-tier { margin-top: 4px; font-family: var(--display, system-ui); font-size: 22px; color: var(--cyan, #6fe3ff); min-height: 1em; }
.${P}-score { margin-top: 2px; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.${P}-best { margin-top: 4px; min-height: 1em; font-family: var(--display, system-ui); font-size: 18px; color: var(--gold, #ffd36b); }
.${P}[data-mode="end"] .${P}-score { font-size: 28px; color: var(--gold, #ffd36b); }
.${P}[data-mode="broken"] { filter: grayscale(1); opacity: .8; animation: ${P}-shake .45s ease-in-out; }
.${P}.pop .${P}-chain { animation: ${P}-pop .35s ease-out; }
@keyframes ${P}-pop { 0% { transform: scale(1.55); } 60% { transform: scale(.93); } 100% { transform: scale(1); } }
@keyframes ${P}-shake {
  0%, 100% { translate: 0 0; } 20% { translate: -9px 0; } 40% { translate: 7px 0; }
  60% { translate: -5px 0; } 80% { translate: 3px 0; } }
@media (max-width: 480px) {
  .${P}-chain { font-size: 44px; }
  .${P}-tier { font-size: 17px; }
  .${P}-score { font-size: 16px; }
  .${P}[data-mode="end"] .${P}-score { font-size: 22px; }
  .${P}-best { font-size: 15px; }
}
@media (prefers-reduced-motion: reduce) {
  .${P}.pop .${P}-chain, .${P}[data-mode="broken"] { animation: none; }
}`;

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
}

function el(parent: HTMLElement, cls: string): HTMLElement {
  const e = document.createElement('div');
  e.className = `${P}-${cls}`;
  parent.append(e);
  return e;
}

export function comboUI() {
  injectStyle();
  const root = document.createElement('div');
  root.className = P;
  root.dataset.mode = 'idle';
  root.setAttribute('aria-live', 'polite');
  document.body.append(root);
  const chainEl = el(root, 'chain'), tierEl = el(root, 'tier'), scoreEl = el(root, 'score'), bestEl = el(root, 'best');

  let mode: Mode = 'idle';
  let t = 0;

  const setMode = (m: Mode) => { mode = m; t = 0; root.dataset.mode = m; };
  const pulse = () => {
    // 같은 애니메이션을 다시 돌리려면 클래스를 뗐다가 붙인다
    root.classList.remove('pop');
    void root.offsetWidth;
    root.classList.add('pop');
  };

  return {
    show(ev: ComboEvent) {
      if (ev.kind === 'grow') {
        setMode('live');
        chainEl.textContent = `x${ev.chain}`;
        tierEl.textContent = ev.tier ?? '';
        scoreEl.textContent = String(ev.score);
        bestEl.textContent = '';
        if (ev.tierUp) pulse();
        return;
      }
      if (ev.kind === 'end') {
        setMode('end');
        chainEl.textContent = `x${ev.chain}`;
        tierEl.textContent = ev.tier ?? '';
        scoreEl.textContent = `+${ev.score}`;
        bestEl.textContent = ev.newBest ? '최고 기록!' : '';
        return;
      }
      setMode('broken');
      chainEl.textContent = `x${ev.chain}`;
      tierEl.textContent = '';
      scoreEl.textContent = '';
      bestEl.textContent = '';
    },

    update(dt: number) {
      if (mode === 'idle') return;
      t += dt;
      if (mode === 'live') { root.style.opacity = ''; return; }
      const hold = mode === 'end' ? HOLD_END : HOLD_BROKEN;
      const fade = mode === 'end' ? FADE_END : FADE_BROKEN;
      if (t < hold) { root.style.opacity = ''; return; }
      if (t < hold + fade) { root.style.opacity = String(1 - (t - hold) / fade); return; }
      setMode('idle');
      root.style.opacity = '';
      root.classList.remove('pop');
    },
  };
}
