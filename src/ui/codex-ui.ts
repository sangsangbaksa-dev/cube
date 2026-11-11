import { SPECIES, type Species, type Wisps, type Rarity, type Habitat } from '../game/wisps';

// 정령 도감: 왼쪽 아래 칩(G 키로도 열림)과 12칸 도감 다이얼로그, 새 발견 토스트.
// 클래스 접두사 cx-로 스타일 충돌을 막는다.
const STYLE_ID = 'cx-style';

const CSS = `
.cx-chip { position: fixed; left: var(--left, 14px); bottom: calc(var(--bottom, 16px) + 132px); z-index: 5;
  padding: 7px 12px; border-radius: 999px; background: rgba(37, 35, 51, .92); border: 1px solid #595166;
  color: #f4dec5; font: 700 12px var(--body, system-ui, sans-serif); cursor: pointer; box-shadow: 0 6px 18px #0004; }
.cx-chip:hover, .cx-chip:focus-visible { border-color: #e5bd91; }
.touch .cx-chip { bottom: calc(var(--bottom, 16px) + 277px); }
body:not(.started) .cx-chip { display: none; }
.cx-dialog { box-sizing: border-box; width: min(590px, calc(100vw - 28px)); max-height: min(90dvh, 740px);
  padding: 0; color: #f5e9db; background: #252333; border: 1px solid #595166; border-radius: 10px;
  box-shadow: 0 26px 100px #100d20a8; user-select: none; }
.cx-dialog::backdrop { background: #15131fc2; }
.cx-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 21px 25px 12px; }
.cx-kicker { margin: 0; font-size: 11px; color: #e5bd91; font-weight: 700; letter-spacing: .13em; }
.cx-head h2 { margin: 4px 0 0; font-family: var(--display, system-ui, sans-serif); font-size: 36px; font-weight: 400; }
.cx-close { background: none; color: #c9bfce; border: 1px solid #60576a; border-radius: 5px; padding: 6px 10px; font: inherit; cursor: pointer; }
.cx-count { margin: 0; font-size: 12px; color: #c9bfce; }
.cx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px;
  padding: 4px 25px 24px; overflow-y: auto; touch-action: pan-y; }
.cx-card { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 2px 10px; align-items: center;
  padding: 10px 12px; border: 1px solid #4a4355; border-radius: 8px; background: #2d2a3c; }
.cx-card.locked { background: #201e2c; border-style: dashed; color: #8f8799; }
.cx-orb { grid-row: span 3; width: 28px; height: 28px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff 0, var(--c) 38%, transparent 74%); box-shadow: 0 0 12px var(--c); }
.cx-card.locked .cx-orb { background: #3a3347; box-shadow: none; }
.cx-name { font-weight: 700; font-size: 15px; overflow-wrap: anywhere; }
.cx-meta { font-size: 11px; color: #c9bfce; }
.cx-meta .common { color: #c9bfce; }
.cx-meta .rare { color: #6fe3ff; }
.cx-meta .epic { color: #ffd36b; }
.cx-blurb { grid-column: 2; font-size: 12px; line-height: 1.45; color: #e8dccb; }
.cx-card.locked .cx-blurb { color: #8f8799; }
.cx-toast { position: fixed; left: 50%; bottom: calc(var(--bottom, 16px) + 84px); z-index: 7; max-width: calc(100vw - 32px);
  box-sizing: border-box; padding: 9px 16px; border-radius: 999px; background: rgba(37, 35, 51, .94); border: 1px solid #ffd36b88;
  color: #ffe9b8; font: 700 14px var(--display, system-ui, sans-serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  pointer-events: none; opacity: 0; transform: translate(-50%, 8px); transition: opacity .25s ease, transform .25s ease; }
.cx-toast.show { opacity: 1; transform: translate(-50%, 0); }
.touch .cx-toast { bottom: calc(var(--bottom, 16px) + 200px); }
@media (max-width: 500px) {
  .cx-head h2 { font-size: 30px; }
  .cx-head { padding: 16px 18px 10px; }
  .cx-grid { padding: 4px 18px 20px; }
}
`;

const RARITY_LABEL: Record<Rarity, string> = { common: '흔함', rare: '희귀', epic: '전설' };
const HABITAT_HINT: Record<Habitat, string> = { day: '낮에 사는 정령', night: '밤에 사는 정령', any: '낮과 밤 모두' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function codexUI(
  w: Wisps,
  opts: { canOpen(): boolean; onOpen(): void; onClose(): void },
): { refresh(): void; toast(species: Species, firstTime: boolean): void; dialog: HTMLDialogElement; button: HTMLButtonElement } {
  if (!document.getElementById(STYLE_ID)) {
    const style = el('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // 칩 버튼
  const button = el('button', 'cx-chip');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');

  // 도감 다이얼로그
  const dialog = el('dialog', 'cx-dialog');
  dialog.setAttribute('aria-labelledby', 'cx-title');
  const head = el('header', 'cx-head');
  const titleBox = el('div');
  titleBox.append(el('p', 'cx-kicker', '별빛 큐브 · 정령 도감'));
  const title = el('h2', '', '정령 도감');
  title.id = 'cx-title';
  titleBox.append(title);
  const count = el('p', 'cx-count');
  titleBox.append(count);
  const closeBtn = el('button', 'cx-close', '닫기');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', () => dialog.close());
  head.append(titleBox, closeBtn);
  const grid = el('div', 'cx-grid');
  dialog.append(head, grid);

  // 새 발견 토스트
  const toastEl = el('div', 'cx-toast');
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  let toastTimer = 0;

  document.body.append(button, dialog, toastEl);

  function refresh() {
    button.textContent = `도감 (G) ${w.discovered}/${w.total}`;
    count.textContent = `발견 ${w.discovered} / ${w.total}`;
    grid.replaceChildren(...SPECIES.map((s) => card(s)));
  }

  function card(s: Species): HTMLElement {
    const n = w.caught(s.id);
    const known = n > 0;
    const c = el('div', known ? 'cx-card' : 'cx-card locked');
    const orb = el('div', 'cx-orb');
    if (known) orb.style.setProperty('--c', s.color);
    c.append(orb);
    if (known) {
      const meta = el('div', 'cx-meta');
      meta.append(el('span', s.rarity, RARITY_LABEL[s.rarity]), ` · 잡은 ${n}번`);
      c.append(el('div', 'cx-name', s.name), meta, el('div', 'cx-blurb', s.blurb));
    } else {
      c.append(
        el('div', 'cx-name', '???'),
        el('div', 'cx-meta', HABITAT_HINT[s.habitat]),
        el('div', 'cx-blurb', '아직 만나지 못한 정령이다.')
      );
    }
    return c;
  }

  function open() {
    if (dialog.open || !opts.canOpen()) return;
    refresh();
    dialog.showModal();
    opts.onOpen();
  }

  button.addEventListener('click', () => (dialog.open ? dialog.close() : open()));
  dialog.addEventListener('close', () => opts.onClose());

  // G 키로 열고 닫기. 길게 누르면 생기는 반복 입력은 무시
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code !== 'KeyG' && e.key !== 'g' && e.key !== 'G') return;
    e.preventDefault();
    if (dialog.open) dialog.close();
    else open();
  });

  function toast(species: Species, firstTime: boolean) {
    if (!firstTime) return;
    toastEl.textContent = `새 정령 발견! · ${species.name}`;
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2000);
  }

  refresh();
  return { refresh, toast, dialog, button };
}
