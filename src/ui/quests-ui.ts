import type { Quests, QuestDef } from '../game/quests';

// 화면 왼쪽 위 "오늘의 의뢰" 접이식 패널. 클래스 접두사 qst-로 스타일 충돌을 막는다.
const UI_KEY = 'cubequest.quests.ui';
const STYLE_ID = 'qst-style';

const CSS = `
.qst-panel { position: fixed; left: var(--left, 14px); top: calc(var(--top, 12px) + 52px); width: 200px; z-index: 5;
  background: rgba(37, 35, 51, .92); border: 1px solid #595166; border-radius: 10px; color: #f5e9db;
  font-family: var(--body, system-ui, sans-serif); box-shadow: 0 6px 18px #0004; overflow: hidden; }
body:not(.started) .qst-panel { visibility: hidden; }
.qst-head { display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 8px;
  background: none; border: 0; padding: 7px 10px; color: #e5bd91; cursor: pointer; text-align: left;
  font: 700 12px var(--display, system-ui, sans-serif); letter-spacing: .04em; }
.qst-arrow { font-size: 10px; color: #c9bfce; }
.qst-body { display: grid; gap: 8px; padding: 0 10px 9px; }
.qst-panel.collapsed .qst-body { display: none; }
.qst-row { display: grid; gap: 4px; padding: 3px 4px; margin: 0 -4px; border-radius: 6px; }
.qst-top { display: flex; align-items: baseline; gap: 6px; font-size: 12px; line-height: 1.3; }
.qst-title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.qst-reward { color: #c8bfcd; font-size: 11px; white-space: nowrap; }
.qst-mark { min-width: 34px; text-align: right; color: #c9bfce; font-size: 11px; font-variant-numeric: tabular-nums; }
.qst-row.done .qst-mark { color: #ffd36b; font-size: 14px; font-weight: 700; }
.qst-row.done .qst-title { color: #ffe9b8; }
.qst-track { height: 5px; border-radius: 3px; background: #3a3347; overflow: hidden; }
.qst-fill { display: block; height: 100%; width: 0; background: #6fe3ff; transition: width .4s ease; }
.qst-row.done .qst-fill { background: #ffd36b; }
.qst-row.qst-flash { animation: qst-flash .9s ease 2; }
@keyframes qst-flash {
  0% { background: transparent; }
  40% { background: #ffd36b33; box-shadow: inset 0 0 0 1px #ffd36b; }
  100% { background: transparent; }
}
@media (max-width: 500px) {
  .qst-panel { width: 180px; font-size: 11px; }
  .qst-head { font-size: 11px; }
  .qst-top { font-size: 11px; }
  .qst-reward { font-size: 10px; }
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

// 접힘 상태는 저장소가 막혀도 동작해야 한다
function readOpen(): boolean {
  try { return localStorage.getItem(UI_KEY) !== '0'; } catch { return true; }
}
function writeOpen(open: boolean) {
  try { localStorage.setItem(UI_KEY, open ? '1' : '0'); } catch { /* 이번 판만 */ }
}

interface RowEls { row: HTMLElement; mark: HTMLElement; fill: HTMLElement }

export function questsUI(q: Quests): { refresh(): void; flash(def: QuestDef): void } {
  injectStyle();

  const panel = document.createElement('section');
  panel.className = 'qst-panel';
  panel.setAttribute('aria-label', '오늘의 의뢰');

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'qst-head';
  const headTitle = document.createElement('span');
  headTitle.textContent = '오늘의 의뢰';
  const arrow = document.createElement('span');
  arrow.className = 'qst-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  head.append(headTitle, arrow);

  const body = document.createElement('div');
  body.className = 'qst-body';
  panel.append(head, body);
  document.body.append(panel);

  let open = readOpen();
  const applyOpen = () => {
    panel.classList.toggle('collapsed', !open);
    head.setAttribute('aria-expanded', String(open));
    arrow.textContent = open ? '▾' : '▸';
  };
  head.addEventListener('click', () => {
    open = !open;
    writeOpen(open);
    applyOpen();
  });
  applyOpen();

  const rows = new Map<string, RowEls>();
  let shownKey = '';

  // 의뢰가 바뀌었을 때만 줄을 새로 만든다
  const build = (list: QuestDef[]) => {
    body.replaceChildren();
    rows.clear();
    for (const d of list) {
      const row = document.createElement('div');
      row.className = 'qst-row';
      const top = document.createElement('div');
      top.className = 'qst-top';
      const title = document.createElement('span');
      title.className = 'qst-title';
      title.textContent = d.title;
      const reward = document.createElement('span');
      reward.className = 'qst-reward';
      reward.textContent = `+${d.reward}`;
      const mark = document.createElement('span');
      mark.className = 'qst-mark';
      top.append(title, reward, mark);
      const track = document.createElement('div');
      track.className = 'qst-track';
      const fill = document.createElement('i');
      fill.className = 'qst-fill';
      track.append(fill);
      row.append(top, track);
      body.append(row);
      rows.set(d.id, { row, mark, fill });
    }
  };

  const paint = (list: QuestDef[]) => {
    for (const d of list) {
      const r = rows.get(d.id);
      if (!r) continue;
      const cur = Math.min(d.goal, Math.floor(d.progress));
      r.row.classList.toggle('done', d.done);
      r.mark.textContent = d.done ? '✓' : `${cur}/${d.goal}`;
      r.fill.style.width = `${Math.min(100, (d.progress / d.goal) * 100)}%`;
    }
  };

  const refresh = () => {
    const list = q.list();
    const key = list.map((d) => d.id + '|' + d.title).join(',');
    if (key !== shownKey) {
      shownKey = key;
      build(list);
    }
    paint(list);
  };

  /** 완료 순간 해당 줄을 반짝인다 */
  const flash = (d: QuestDef) => {
    refresh();
    const r = rows.get(d.id);
    if (!r) return;
    r.row.classList.remove('qst-flash');
    void r.row.offsetWidth; // 애니메이션 재시작
    r.row.classList.add('qst-flash');
    r.row.addEventListener('animationend', () => r.row.classList.remove('qst-flash'), { once: true });
  };

  // 누적 진행 중 페이지를 닫아도 잃지 않도록 저장
  window.addEventListener('pagehide', () => q.flush());

  refresh();
  return { refresh, flash };
}
