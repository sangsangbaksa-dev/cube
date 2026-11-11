// 보물 상자 표시: 왼쪽 아래 미니 패널에 "보물 n/N"과 힌트 한 줄, 열었을 때 가운데에 잠깐 뜨는 알림.
// 클릭은 통과시킨다. 게임을 시작하기 전(body:not(.started))에는 숨긴다.

const P = 'ch';
const POPUP_MS = 1600;

const TIER_NAME: Record<string, string> = { bronze: '동', silver: '은', gold: '금' };

const CSS = `
.${P}-panel { position: fixed; left: var(--left, 14px); top: calc(var(--top, 0px) + 232px); z-index: 3;
  box-sizing: border-box; max-width: min(240px, calc(100vw - 28px)); padding: 7px 11px; pointer-events: none;
  color: #f5e9db; background: #252333d9; border: 1px solid #595166; border-radius: 8px;
  font-family: var(--body, system-ui); font-size: 13px; line-height: 1.35; }
.${P}-count { font-family: var(--display, system-ui); font-size: 16px; color: var(--gold, #ffd36b); font-variant-numeric: tabular-nums; }
.${P}-hint { margin-top: 2px; color: #e5bd91; min-height: 1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${P}-hint[hidden] { display: none; }
.${P}-popup { position: fixed; left: 50%; top: 38%; transform: translate(-50%, -50%); z-index: 6; pointer-events: none;
  padding: 9px 18px; color: #f5e9db; background: #252333e6; border: 1px solid #e5bd91; border-radius: 9px;
  font-family: var(--display, system-ui); font-size: 22px; white-space: nowrap; opacity: 0; transition: opacity .3s; }
.${P}-popup.on { opacity: 1; }
body:not(.started) .${P}-panel, body:not(.started) .${P}-popup { display: none; }
@media (max-width: 680px) {
  .${P}-panel { font-size: 11px; padding: 6px 9px; top: calc(var(--top, 0px) + 284px); z-index: 4; }
  .${P}-count { font-size: 14px; }
  .${P}-popup { font-size: 17px; padding: 7px 14px; }
}
@media (prefers-reduced-motion: reduce) { .${P}-popup { transition: none; } }`;

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
}

export function chestUI() {
  injectStyle();

  const panel = document.createElement('div');
  panel.className = `${P}-panel`;
  panel.setAttribute('aria-live', 'polite');
  const countEl = document.createElement('div');
  countEl.className = `${P}-count`;
  const hintEl = document.createElement('div');
  hintEl.className = `${P}-hint`;
  hintEl.hidden = true;
  panel.append(countEl, hintEl);

  const popupEl = document.createElement('div');
  popupEl.className = `${P}-popup`;
  popupEl.setAttribute('role', 'status');

  document.body.append(panel, popupEl);

  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    setHint(text: string | null) {
      hintEl.textContent = text ?? '';
      hintEl.hidden = !text;
    },
    popup(coins: number, tier: string) {
      popupEl.textContent = `보물 상자 · ${TIER_NAME[tier] ?? ''} 상자 +${coins}`;
      popupEl.classList.add('on');
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        popupEl.classList.remove('on');
        timer = undefined;
      }, POPUP_MS);
    },
    setCount(n: number, total: number) {
      countEl.textContent = `보물 ${n}/${total}`;
    },
  };
}
