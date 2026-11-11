// 빛구슬 질주 HUD: 실행 중 남은 시간, 점수, 콤보, 수집 떠오름, 이탈 경고, 결과 카드.
// 클릭은 모두 통과시킨다. 스타일은 한 번만 주입하고 클래스 접두사 or-로 충돌을 막는다.
import { comboMultiplier, type OrbRush, type RushEvent } from '../game/orbrush';

const P = 'or';
const STYLE_ID = 'or-style';
const RESULT_MS = 3500;
const WARN_MS = 1600;
const POP_MS = 950;

const CSS = `
.${P}-hud { position: fixed; top: calc(var(--top, 0px) + 78px); left: 50%; transform: translateX(-50%); z-index: 4;
  pointer-events: none; text-align: center; color: var(--ink, #f5e9db); font-family: var(--body, system-ui);
  text-shadow: 0 2px 10px rgba(10, 6, 30, .85); white-space: nowrap; }
.${P}-hud[data-on="0"] { display: none; }
.${P}-time { font-family: var(--display, system-ui); font-size: 46px; line-height: 1; color: var(--cyan, #6fe3ff);
  font-variant-numeric: tabular-nums; }
.${P}-time small { font-size: 18px; margin-left: 4px; color: var(--dim, #bdb4c9); }
.${P}-hud[data-low="1"] .${P}-time { color: #ff9bd0; animation: ${P}-blink .5s steps(2, jump-none) infinite; }
.${P}-meta { margin-top: 4px; display: flex; gap: 12px; justify-content: center; font-size: 16px; font-variant-numeric: tabular-nums; }
.${P}-score { color: var(--gold, #ffd36b); font-weight: 700; }
.${P}-combo { color: var(--dim, #bdb4c9); }
.${P}-combo.on { color: var(--gold, #ffd36b); }
@keyframes ${P}-blink { 50% { opacity: .35; } }

.${P}-pops { position: fixed; inset: 0; pointer-events: none; z-index: 5; }
.${P}-pop { position: absolute; top: 44%; left: 50%; transform: translate(-50%, 0); white-space: nowrap;
  font-family: var(--display, system-ui); font-size: 26px; color: var(--cyan, #6fe3ff);
  text-shadow: 0 2px 8px rgba(10, 6, 30, .9); animation: ${P}-rise ${POP_MS}ms ease-out forwards; }
.${P}-pop.gold { color: var(--gold, #ffd36b); font-size: 32px; }
.${P}-pop.time { color: #ff9bd0; }
@keyframes ${P}-rise { 0% { opacity: 0; transform: translate(-50%, 10px) scale(.8); }
  15% { opacity: 1; transform: translate(-50%, 0) scale(1.1); } 100% { opacity: 0; transform: translate(-50%, -46px) scale(1); } }

.${P}-warn { position: fixed; top: 30%; left: 50%; transform: translateX(-50%); z-index: 6; pointer-events: none;
  padding: 8px 16px; border: 1px solid #ff9bd0; border-radius: 8px; background: rgba(37, 35, 51, .92);
  color: #ffd6ea; font-family: var(--display, system-ui); font-size: 22px; white-space: nowrap; }
.${P}-warn[data-on="0"] { display: none; }

.${P}-result { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 6; pointer-events: none;
  width: min(300px, calc(100vw - 32px)); box-sizing: border-box; padding: 18px 20px; border-radius: 10px;
  background: #252333; border: 1px solid #595166; color: #f5e9db; font-family: var(--body, system-ui);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .45); text-align: center; }
.${P}-result[data-on="0"] { display: none; }
.${P}-result-kicker { font-size: 12px; color: #e5bd91; letter-spacing: .08em; }
.${P}-result-title { margin-top: 4px; font-family: var(--display, system-ui); font-size: 24px; }
.${P}-result-score { margin-top: 10px; font-family: var(--display, system-ui); font-size: 40px; color: var(--gold, #ffd36b);
  font-variant-numeric: tabular-nums; }
.${P}-result-rows { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 14px; }
.${P}-result-rows span { padding: 6px 4px; border-radius: 6px; background: rgba(255, 255, 255, .05); }
.${P}-result-rows b { color: #e5bd91; font-variant-numeric: tabular-nums; }
.${P}-result-note { margin-top: 10px; min-height: 1.2em; font-size: 14px; color: #e5bd91; }

@media (max-width: 480px) {
  .${P}-hud { top: calc(var(--top, 0px) + 68px); }
  .${P}-time { font-size: 38px; }
  .${P}-meta { font-size: 14px; }
  .${P}-pop { font-size: 22px; }
  .${P}-pop.gold { font-size: 27px; }
  .${P}-warn { font-size: 18px; }
  .${P}-result { padding: 14px 16px; }
  .${P}-result-score { font-size: 34px; }
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

/** 배율 표시: 1.5 → "x1.5", 1.25 → "x1.25" */
const fmtMult = (m: number) => `x${Number(m.toFixed(2))}`;

export interface OrbRushUI {
  /** 매 프레임 호출해도 된다. 값이 바뀔 때만 DOM을 고친다 */
  show(rush: OrbRush): void;
  announce(ev: RushEvent): void;
}

export function orbRushUI(): OrbRushUI {
  injectStyle();

  const hud = document.createElement('div');
  hud.className = `${P}-hud`;
  hud.dataset.on = '0';
  hud.innerHTML = `
    <div class="${P}-time"><span class="${P}-time-v">0.0</span><small>초</small></div>
    <div class="${P}-meta"><span class="${P}-score"></span><span class="${P}-combo"></span></div>`;
  const timeEl = hud.querySelector<HTMLElement>(`.${P}-time-v`)!;
  const scoreEl = hud.querySelector<HTMLElement>(`.${P}-score`)!;
  const comboEl = hud.querySelector<HTMLElement>(`.${P}-combo`)!;

  const pops = document.createElement('div');
  pops.className = `${P}-pops`;

  const warn = document.createElement('div');
  warn.className = `${P}-warn`;
  warn.dataset.on = '0';
  warn.textContent = '구역으로 돌아가세요!';

  const result = document.createElement('div');
  result.className = `${P}-result`;
  result.dataset.on = '0';
  result.setAttribute('role', 'status');
  result.innerHTML = `
    <div class="${P}-result-kicker">빛구슬 질주</div>
    <div class="${P}-result-title"></div>
    <div class="${P}-result-score"></div>
    <div class="${P}-result-rows"></div>
    <div class="${P}-result-note"></div>`;
  const resTitle = result.querySelector<HTMLElement>(`.${P}-result-title`)!;
  const resScore = result.querySelector<HTMLElement>(`.${P}-result-score`)!;
  const resRows = result.querySelector<HTMLElement>(`.${P}-result-rows`)!;
  const resNote = result.querySelector<HTMLElement>(`.${P}-result-note`)!;

  document.body.append(hud, pops, warn, result);

  let lastKey = '';
  let warnTimer = 0;
  let resultTimer = 0;

  const show = (rush: OrbRush) => {
    const running = rush.state === 'running';
    hud.dataset.on = running ? '1' : '0';
    if (!running) { lastKey = ''; return; }

    const t = Math.max(0, rush.timeLeft);
    const low = t <= 10 ? '1' : '0';
    const key = `${t.toFixed(1)}|${rush.score}|${rush.combo}|${low}`;
    if (key === lastKey) return;
    lastKey = key;

    timeEl.textContent = t.toFixed(1);
    hud.dataset.low = low;
    scoreEl.textContent = `${rush.score}점`;
    comboEl.textContent = rush.combo > 0
      ? `콤보 ${rush.combo} · ${fmtMult(comboMultiplier(rush.combo))}`
      : '콤보 없음';
    comboEl.classList.toggle('on', rush.combo > 0);
  };

  const pop = (text: string, cls: string) => {
    const e = document.createElement('div');
    e.className = `${P}-pop ${cls}`;
    e.textContent = text;
    // 가운데를 중심으로 조금씩 흩어 겹침을 줄인다
    e.style.marginLeft = `${Math.round((Math.random() - 0.5) * 60)}px`;
    pops.append(e);
    setTimeout(() => e.remove(), POP_MS);
  };

  const announce = (ev: RushEvent) => {
    switch (ev.kind) {
      case 'start':
        return;
      case 'collect':
        pop(`+${ev.points} ${fmtMult(comboMultiplier(ev.combo))}`, ev.orb.kind === 'gold' ? 'gold' : '');
        return;
      case 'time':
        pop(`+${ev.bonus}초`, 'time');
        return;
      case 'leaving':
        warn.dataset.on = '1';
        clearTimeout(warnTimer);
        warnTimer = window.setTimeout(() => { warn.dataset.on = '0'; }, WARN_MS);
        return;
      case 'end': {
        resTitle.textContent = ev.aborted ? '구역을 벗어났어요' : '빛구슬 질주 완료!';
        resScore.textContent = `${ev.score}점`;
        resRows.innerHTML = `
          <span>코인 <b>+${ev.coins}</b></span>
          <span>구슬 <b>${ev.collected}개</b></span>`;
        resNote.textContent = ev.aborted
          ? '포기한 판은 기록에 남지 않아요.'
          : ev.newBest ? '최고 기록 갱신!' : '';
        warn.dataset.on = '0';
        result.dataset.on = '1';
        clearTimeout(resultTimer);
        resultTimer = window.setTimeout(() => { result.dataset.on = '0'; }, RESULT_MS);
        return;
      }
    }
  };

  return { show, announce };
}
