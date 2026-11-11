// 원정 완주 결과 카드: 화면 가운데 아래에 잠깐 떠서 기록, 메달, 다음 메달까지 남은 시간을 보여 준다. 클릭은 통과시킨다.
import { formatRun } from '../game/expedition-menu';
import { MEDAL_INFO, type Medal, type ParTimes } from '../game/medals';

const P = 'rs';
const SHOW_MS = 4500;

export type ResultsData = {
  course: string;
  color: string;
  time: number;
  best?: number;
  improved: boolean;
  medal: Medal;
  newMedal: boolean;
  par: ParTimes;
  /** 고정 고스트 기록 대비 차이(초). 음수면 더 빠름 */
  ghostDelta?: number;
};

const CSS = `
.${P} { position: fixed; left: 50%; bottom: 18%; z-index: 5; pointer-events: none;
  transform: translateX(-50%); width: max-content; max-width: min(88vw, 320px); }
.${P}-card { box-sizing: border-box; width: 100%; padding: 14px 18px 13px; text-align: center;
  background: #252333; border: 1px solid #595166; border-radius: 14px; color: #f5e9db;
  font-family: var(--body, system-ui); box-shadow: 0 10px 28px rgba(8, 6, 20, .55);
  opacity: 0; visibility: hidden; transform: translateY(18px);
  transition: opacity .3s ease, transform .35s cubic-bezier(.2, .8, .3, 1), visibility 0s linear .35s; }
.${P}-card.${P}-show { opacity: 1; visibility: visible; transform: none;
  transition: opacity .3s ease, transform .35s cubic-bezier(.2, .8, .3, 1), visibility 0s; }
.${P}-course { font-family: var(--display, system-ui); font-size: 17px; line-height: 1.2; color: var(--course, #e5bd91);
  overflow-wrap: anywhere; }
.${P}-time { margin-top: 2px; font-family: var(--display, system-ui); font-size: clamp(40px, 13vw, 56px); line-height: 1.1;
  color: var(--gold, #ffd36b); font-variant-numeric: tabular-nums; text-shadow: 0 2px 12px rgba(255, 211, 107, .25); }
.${P}-badge { display: inline-block; margin-top: 2px; padding: 2px 10px; border-radius: 999px; background: var(--gold, #ffd36b);
  color: #252333; font-size: 13px; font-weight: 700; }
.${P}-badge[hidden] { display: none; }
.${P}-medal { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; min-height: 26px;
  font-size: 16px; font-weight: 700; color: var(--medal, #f5e9db); }
.${P}-medal[hidden] { display: none; }
.${P}-none { margin-top: 10px; font-size: 14px; color: #a79fb3; }
.${P}-star { flex: none; width: 24px; height: 24px; background: var(--medal, #ffd36b);
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
.${P}-gain { margin-top: 6px; font-size: 14px; color: var(--gold, #ffd36b); font-weight: 700; }
.${P}-gain[hidden] { display: none; }
.${P}-gain.${P}-pulse { animation: ${P}-pulse .6s ease-out; }
.${P}-next { margin-top: 6px; font-size: 14px; color: #cfc6d8; font-variant-numeric: tabular-nums; }
.${P}-next[hidden] { display: none; }
.${P}-ghost { margin-top: 6px; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.${P}-ghost[hidden] { display: none; }
.${P}-ghost.up { color: #7ff2c8; }
.${P}-ghost.down { color: #ff9fc4; }
.${P}-ghost.even { color: #cfc6d8; }
.${P}-best { margin-top: 4px; font-size: 12px; color: #a79fb3; font-variant-numeric: tabular-nums; }
.${P}-best[hidden] { display: none; }
@keyframes ${P}-pulse { 0% { transform: scale(1.35); } 60% { transform: scale(.95); } 100% { transform: scale(1); } }
@media (max-width: 360px) {
  .${P}-course { font-size: 15px; }
  .${P}-medal { font-size: 15px; }
}
@media (prefers-reduced-motion: reduce) {
  .${P}-card, .${P}-card.${P}-show { transition: none; transform: none; }
  .${P}-gain.${P}-pulse { animation: none; }
}`;

/** 다음 등급. 동빛 기준 밖이면 null */
const NEXT: Record<'none' | 'bronze' | 'silver' | 'gold', Medal> = { none: 'bronze', bronze: 'silver', silver: 'gold', gold: null };

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
}

function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = `${P}-${cls}`;
  e.textContent = text;
  parent.append(e);
  return e;
}

/** 소수 첫째 자리 차이 문자열 */
const signed = (d: number) => `${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(1)}초`;

export function resultsUI() {
  injectStyle();
  const root = document.createElement('div');
  root.className = P;
  root.setAttribute('aria-live', 'polite');
  const card = el(root, 'div', 'card');
  const course = el(card, 'div', 'course');
  const time = el(card, 'div', 'time');
  const badge = el(card, 'span', 'badge', '새 기록!');
  badge.hidden = true;
  const medal = el(card, 'div', 'medal');
  medal.hidden = true;
  const star = el(medal, 'span', 'star');
  star.setAttribute('aria-hidden', 'true');
  const medalName = el(medal, 'span', 'medal-name');
  const none = el(card, 'div', 'none', '메달 없음');
  none.hidden = true;
  const gain = el(card, 'div', 'gain');
  gain.hidden = true;
  const next = el(card, 'div', 'next');
  next.hidden = true;
  const ghost = el(card, 'div', 'ghost');
  ghost.hidden = true;
  const best = el(card, 'div', 'best');
  best.hidden = true;
  document.body.append(root);

  let timer = 0;
  const hide = () => card.classList.remove(`${P}-show`);

  const show = (r: ResultsData) => {
    course.textContent = r.course;
    course.style.setProperty('--course', r.color);
    time.textContent = formatRun(r.time);
    badge.hidden = !r.improved;

    if (r.medal) {
      const info = MEDAL_INFO[r.medal];
      medal.hidden = false;
      medal.style.setProperty('--medal', info.color);
      medalName.textContent = info.name;
      none.hidden = true;
    } else {
      medal.hidden = true;
      none.hidden = false;
    }

    gain.hidden = !(r.newMedal && r.medal);
    if (!gain.hidden) {
      gain.textContent = `메달 획득 +${MEDAL_INFO[r.medal!].coins} 반짝이`;
      // 같은 애니메이션을 다시 돌리려면 클래스를 뺐다가 붙인다
      gain.classList.remove(`${P}-pulse`);
      void gain.offsetWidth;
      gain.classList.add(`${P}-pulse`);
    }

    // 다음 메달까지 남은 시간: 완주 시간이 다음 등급 기준보다 얼마나 더 긴지
    const target = NEXT[r.medal ?? 'none'];
    if (target) {
      const need = Math.max(0, r.time - r.par[target]);
      next.hidden = false;
      next.textContent = `${MEDAL_INFO[target].name.split(' ')[0]}까지 -${need.toFixed(1)}초`;
    } else {
      next.hidden = true;
    }

    if (r.ghostDelta !== undefined) {
      const d = Math.round(r.ghostDelta * 10) / 10;
      ghost.hidden = false;
      ghost.textContent = `고스트보다 ${signed(d)}`;
      ghost.className = `${P}-ghost ${d < 0 ? 'up' : d > 0 ? 'down' : 'even'}`;
    } else {
      ghost.hidden = true;
    }

    best.hidden = r.improved || r.best === undefined;
    if (!best.hidden) best.textContent = `최고 기록 ${formatRun(r.best!)}`;

    card.classList.add(`${P}-show`);
    clearTimeout(timer);
    timer = window.setTimeout(hide, SHOW_MS);
  };

  return { show };
}
