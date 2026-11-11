// 큐브 옷장 UI: 왼쪽 아래 칩 버튼 + <dialog>. DOM을 스스로 만들어 body에 붙인다.
import { SKINS, type SkinDef, type Wardrobe } from '../game/wardrobe';

const STYLE_ID = 'wr-style';
const CSS = `
  .wr-chip { position: fixed; left: var(--left); bottom: calc(var(--bottom) + 88px); z-index: 5;
    display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; color: #f4dec5;
    font: 650 12px/1 var(--body); background: #252333d0; border: 1px solid #595166; border-radius: 999px;
    cursor: pointer; touch-action: manipulation; }
  .touch .wr-chip { bottom: calc(var(--bottom) + 233px); }
  body:not(.started) .wr-chip { visibility: hidden; }
  .wr-sep { color: #7d7389; }
  .wr-coins { color: var(--gold); font: 400 14px/1 var(--display); display: inline-block; font-variant-numeric: tabular-nums; }
  .wr-coins.wr-pop { animation: wr-pop .45s ease-out; }
  @keyframes wr-pop { 0% { transform: scale(1); } 35% { transform: scale(1.5); color: #fff3b0; } 100% { transform: scale(1); } }

  .wr-dialog { box-sizing: border-box; width: min(560px, calc(100vw - 28px)); max-height: min(90dvh, 720px); padding: 0;
    color: #f5e9db; background: #252333; border: 1px solid #595166; border-radius: 10px;
    box-shadow: 0 26px 100px #100d20a8; touch-action: pan-y; user-select: none; }
  .wr-dialog::backdrop { background: #15131fc2; }
  .wr-dialog[open] { display: flex; flex-direction: column; }
  .wr-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px 10px; }
  .wr-head h2 { margin: 2px 0 0; font: 400 30px/1.1 var(--display); }
  .wr-kicker { margin: 0; font-size: 11px; color: #e5bd91; font-weight: 700; letter-spacing: .13em; }
  .wr-balance { margin-left: auto; font: 400 20px/1 var(--display); color: var(--gold); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .wr-close { color: #c9bfce; background: none; border: 1px solid #60576a; border-radius: 5px; padding: 6px 10px; font: inherit; cursor: pointer; }
  .wr-msg { min-height: 1.4em; margin: 0 20px 8px; font-size: 13px; color: #e5bd91; }
  .wr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px;
    padding: 2px 20px 20px; overflow: auto; }
  .wr-card { display: grid; gap: 7px; justify-items: center; padding: 14px 10px 12px; text-align: center; min-width: 0;
    background: #302d40; border: 1px solid #4a4355; border-radius: 9px; }
  .wr-card.is-on { border-color: var(--cyan); box-shadow: inset 0 0 0 1px #6fe3ff66; }
  .wr-swatch { position: relative; width: 56px; height: 56px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ffffff99 0 8%, transparent 10%), var(--wr-body);
    box-shadow: 0 0 18px var(--wr-glow), inset -6px -8px 14px #0003; }
  .wr-trail { position: absolute; right: -8px; bottom: -2px; width: 16px; height: 16px; border-radius: 4px;
    background: var(--wr-trail); border: 2px solid #302d40; }
  .wr-name { font: 400 16px/1.2 var(--display); }
  .wr-meta { font-size: 12px; color: #b9aec4; min-height: 1.2em; }
  .wr-action { width: 100%; padding: 8px 6px; font: 700 13px/1 var(--body); color: #10102a;
    background: linear-gradient(180deg, #9ff0ff, var(--cyan)); border: 0; border-radius: 8px; cursor: pointer; }
  .wr-action:disabled { background: #4a4355; color: #8f8699; cursor: default; }
  @media (max-width: 380px) { .wr-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 2px 14px 16px; gap: 8px; } }
`;

const ACCESSORY_NAME: Record<string, string> = { none: '', crown: '왕관', leaf: '잎', halo: '후광', horns: '뿔', bow: '리본' };

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export interface WardrobeUIOptions {
  canOpen(): boolean;
  onOpen(): void;
  onClose(): void;
  onEquip(skin: SkinDef): void;
}

export function wardrobeUI(w: Wardrobe, opts: WardrobeUIOptions): {
  refresh(): void;
  dialog: HTMLDialogElement;
  pulseCoins(): void;
} {
  injectStyle();

  // 칩 버튼
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wr-chip';
  const label = document.createElement('span');
  const sep = document.createElement('span');
  sep.className = 'wr-sep';
  sep.textContent = '·';
  const chipCoins = document.createElement('span');
  chipCoins.className = 'wr-coins';
  button.append(label, sep, chipCoins);
  document.body.appendChild(button);

  // 다이얼로그
  const dialog = document.createElement('dialog');
  dialog.className = 'wr-dialog';
  dialog.setAttribute('aria-labelledby', 'wrTitle');
  dialog.innerHTML = `
    <div class="wr-head">
      <div>
        <p class="wr-kicker">반짝이 코인으로 구매</p>
        <h2 id="wrTitle">큐브 옷장</h2>
      </div>
      <span class="wr-balance" aria-label="코인 잔액">◆ <span data-wr="balance">0</span></span>
      <button type="button" class="wr-close">닫기</button>
    </div>
    <p class="wr-msg" role="status" aria-live="polite"></p>
    <div class="wr-grid"></div>`;
  document.body.appendChild(dialog);
  const balanceEl = dialog.querySelector<HTMLElement>('[data-wr="balance"]')!;
  const msgEl = dialog.querySelector<HTMLElement>('.wr-msg')!;
  const grid = dialog.querySelector<HTMLElement>('.wr-grid')!;
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.wr-close')!;

  const isTouch = () => document.body.classList.contains('touch');
  const shortcut = () => (isTouch() ? '' : ' (O)');

  function say(text: string) {
    msgEl.textContent = text;
  }

  function card(skin: SkinDef): HTMLElement {
    const owned = w.owned(skin.id);
    const on = w.equipped.id === skin.id;
    const el = document.createElement('article');
    el.className = 'wr-card' + (on ? ' is-on' : '');

    const swatch = document.createElement('div');
    swatch.className = 'wr-swatch';
    swatch.style.setProperty('--wr-body', skin.body);
    swatch.style.setProperty('--wr-glow', skin.emissive + '99');
    swatch.style.setProperty('--wr-trail', skin.trail);
    const trail = document.createElement('span');
    trail.className = 'wr-trail';
    swatch.appendChild(trail);

    const name = document.createElement('strong');
    name.className = 'wr-name';
    name.textContent = skin.name;

    const meta = document.createElement('small');
    meta.className = 'wr-meta';
    const acc = ACCESSORY_NAME[skin.accessory ?? 'none'];
    meta.textContent = [skin.price === 0 ? '기본' : `◆ ${skin.price}`, acc].filter(Boolean).join(' · ');

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'wr-action';
    if (on) {
      action.textContent = '착용 중';
      action.disabled = true;
    } else if (owned) {
      action.textContent = '착용';
      action.addEventListener('click', () => {
        if (w.equip(skin.id)) {
          opts.onEquip(skin);
          say(`${skin.name} 착용!`);
          refresh();
        }
      });
    } else {
      action.textContent = '구매';
      action.disabled = w.coins < skin.price;
      action.addEventListener('click', () => {
        const r = w.buy(skin.id);
        if (r === 'ok') {
          say(`${skin.name} 구매 완료! 착용해 볼까요?`);
          pulseCoins(); // 내부에서 refresh 한다
          return;
        }
        if (r === 'poor') say('반짝이 코인이 부족해요.');
        refresh();
      });
    }

    el.append(swatch, name, meta, action);
    return el;
  }

  function refresh() {
    const coins = w.coins;
    chipCoins.textContent = `◆ ${coins}`;
    label.textContent = `옷장${shortcut()}`;
    balanceEl.textContent = String(coins);
    grid.replaceChildren(...SKINS.map(card));
  }

  function open() {
    if (dialog.open || !opts.canOpen()) return;
    say('');
    refresh();
    dialog.showModal();
    opts.onOpen();
  }

  function pulseCoins() {
    chipCoins.classList.remove('wr-pop');
    void chipCoins.offsetWidth; // 애니메이션 재시작
    chipCoins.classList.add('wr-pop');
    refresh();
  }

  button.addEventListener('click', () => open());
  closeBtn.addEventListener('click', () => dialog.close());
  chipCoins.addEventListener('animationend', () => chipCoins.classList.remove('wr-pop'));
  dialog.addEventListener('close', () => opts.onClose());
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code !== 'KeyO') return;
    if (dialog.open) dialog.close();
    else open();
  });

  refresh();
  return { refresh, dialog, pulseCoins };
}
