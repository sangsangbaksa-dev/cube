import type { Achievements, AchievementDef } from '../game/achievements';

// 업적 UI: 달성 토스트, 열기 버튼(칩), 업적 목록 다이얼로그. DOM은 이 파일이 직접 만든다.
export interface AchievementsUIOpts {
  /** 지금 열어도 되는지(시작 전, 원정 메뉴 열림 등에서는 false) */
  canOpen(): boolean;
  onOpen(): void;
  onClose(): void;
}

export interface AchievementsUI {
  /** 업적 달성 토스트를 띄운다. 여러 개면 쌓인다 */
  toast(def: AchievementDef): void;
  /** 칩 숫자와 다이얼로그 내용을 최신 상태로 맞춘다 */
  refresh(): void;
  dialog: HTMLDialogElement;
  button: HTMLButtonElement;
}

const STYLE_ID = 'ach-style';
const CSS = `
  .ach-chip { position: fixed; left: var(--left); bottom: calc(var(--bottom) + 44px); z-index: 5;
    padding: 7px 12px; color: #f4dec5; font: 600 13px/1 var(--body), sans-serif; letter-spacing: .02em;
    background: #252333d9; border: 1px solid #595166; border-radius: 999px; cursor: pointer; }
  .ach-chip:hover { border-color: #e5bd91; }
  .touch .ach-chip { bottom: calc(var(--bottom) + 190px); }
  body:not(.started) .ach-chip { visibility: hidden; }

  .ach-toasts { position: fixed; right: var(--right); bottom: var(--bottom); z-index: 6; pointer-events: none;
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .touch .ach-toasts { top: var(--top); bottom: auto; }
  .ach-toast { max-width: min(320px, calc(100vw - 28px)); box-sizing: border-box; padding: 9px 13px;
    color: #f5e9db; font: 500 14px/1.35 var(--body), sans-serif; background: #252333f0;
    border: 1px solid #e5bd91; border-radius: 8px; box-shadow: 0 10px 30px #100d2070;
    animation: ach-in .25s ease-out both; transition: opacity .3s, transform .3s; }
  .ach-toast b { color: #ffd36b; font-family: var(--display), serif; font-weight: 400; }
  .ach-toast.out { opacity: 0; transform: translateY(6px); }
  @keyframes ach-in { from { opacity: 0; transform: translateY(8px); } }

  .ach-dialog { box-sizing: border-box; width: min(590px, calc(100vw - 28px)); max-height: min(90dvh, 740px);
    padding: 0; color: #f5e9db; background: #252333; border: 1px solid #595166; border-radius: 10px;
    box-shadow: 0 26px 100px #100d20a8; user-select: none; }
  .ach-dialog[open] { display: flex; flex-direction: column; }
  .ach-dialog::backdrop { background: #15131fc2; }
  .ach-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 24px; }
  .ach-kicker { margin: 0; color: #e5bd91; font-size: 12px; letter-spacing: .12em; }
  .ach-head h2 { margin: 4px 0 0; font: 400 36px/1 var(--display), serif; }
  .ach-close { padding: 9px 14px; color: #f5e9db; background: #332f42; border: 1px solid #595166; border-radius: 6px; cursor: pointer; font: inherit; }
  .ach-stats { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 0 24px 16px; font-size: 14px; color: #d8cbbb; }
  .ach-stats b { color: #ffd36b; font-weight: 600; }
  .ach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;
    padding: 0 24px 24px; overflow: auto; }
  .ach-card { box-sizing: border-box; min-height: 92px; padding: 11px 12px; border: 1px solid #595166; border-radius: 8px;
    background: #1d1b28; display: flex; flex-direction: column; gap: 5px; }
  .ach-card.on { border-color: #e5bd91; background: #2b2636; }
  .ach-card.off { color: #9a8f9f; }
  .ach-card-name { font-family: var(--display), serif; font-size: 17px; line-height: 1.15; }
  .ach-card-desc { font-size: 12.5px; line-height: 1.4; color: #cbbfae; }
  .ach-card.off .ach-card-desc { color: #8a8091; }
  .ach-card-foot { margin-top: auto; display: flex; justify-content: space-between; font-size: 12px; color: #9a8f9f; }
  .ach-card.on .ach-card-foot { color: #ffd36b; }
  @media (max-width: 420px) { .ach-head h2 { font-size: 30px; } .ach-grid { padding: 0 16px 16px; } .ach-stats { padding: 0 16px 12px; } }
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분`;
  return `${m}분 ${Math.floor(sec % 60)}초`;
}

export function achievementsUI(a: Achievements, opts: AchievementsUIOpts): AchievementsUI {
  injectStyle();

  // 버튼
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ach-chip';
  button.setAttribute('aria-haspopup', 'dialog');

  // 토스트 줄
  const toasts = document.createElement('div');
  toasts.className = 'ach-toasts';
  toasts.setAttribute('aria-live', 'polite');

  // 다이얼로그
  const dialog = document.createElement('dialog');
  dialog.className = 'ach-dialog';
  dialog.setAttribute('aria-labelledby', 'achTitle');
  dialog.innerHTML = `
    <header class="ach-head">
      <div><p class="ach-kicker">별빛 큐브 · 기록</p><h2 id="achTitle">업적</h2></div>
      <button class="ach-close" type="button">닫기</button>
    </header>
    <section class="ach-stats"></section>
    <div class="ach-grid"></div>`;
  const statsEl = dialog.querySelector<HTMLElement>('.ach-stats')!;
  const gridEl = dialog.querySelector<HTMLElement>('.ach-grid')!;
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.ach-close')!;

  document.body.append(toasts, button, dialog);

  const refresh = () => {
    const list = a.list();
    const done = a.unlockedCount;
    button.textContent = `업적 ${done}/${list.length} (L)`;
    const s = a.stats;
    statsEl.innerHTML = `
      <span>이동 <b>${(s.distance / 1000).toFixed(2)} km</b></span>
      <span>점프 <b>${s.jumps.toLocaleString('ko-KR')}</b>회</span>
      <span>플레이 <b>${fmtTime(s.playTime)}</b></span>`;
    gridEl.innerHTML = list.map(({ def, unlocked, unlockedAt }) => {
      // 숨김 업적은 달성 전까지 이름과 설명을 가린다
      const hide = def.hidden && !unlocked;
      const name = hide ? '???' : def.name;
      const desc = hide ? '???' : def.desc;
      const foot = unlocked && unlockedAt !== undefined
        ? `<span>달성 ${new Date(unlockedAt).toLocaleDateString('ko-KR')}</span><span>+${def.reward} 반짝이</span>`
        : `<span>미달성</span><span>보상 ${def.reward}</span>`;
      return `<div class="ach-card ${unlocked ? 'on' : 'off'}">
        <div class="ach-card-name">${unlocked ? '✦ ' : ''}${name}</div>
        <div class="ach-card-desc">${desc}</div>
        <div class="ach-card-foot">${foot}</div>
      </div>`;
    }).join('');
  };

  const open = () => {
    if (dialog.open || !opts.canOpen()) return;
    refresh();
    dialog.showModal();
    opts.onOpen();
  };
  const close = () => { if (dialog.open) dialog.close(); };

  dialog.addEventListener('close', () => opts.onClose());
  closeBtn.addEventListener('click', close);
  button.addEventListener('click', () => (dialog.open ? close() : open()));
  // K 키는 열기/닫기. 길게 누른 반복 입력은 무시한다
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyL' || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    if (dialog.open) close(); else open();
  });

  const toast = (def: AchievementDef) => {
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.setAttribute('role', 'status');
    const tag = document.createElement('b');
    tag.textContent = '업적 달성';
    el.append(tag, document.createTextNode(` · ${def.name} · +${def.reward} 반짝이`));
    toasts.append(el);
    setTimeout(() => el.classList.add('out'), 2700);
    setTimeout(() => el.remove(), 3000);
  };

  refresh();
  return { toast, refresh, dialog, button };
}
