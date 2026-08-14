// screens.ts — the game-state UI: the persistent HUD readout, the attract/title
// screen, and the win/lose result screen (with the kills-by-type histogram).

import { UNIT_BY_KEY, type UnitDef } from '../../units/roster';
import { el } from './dom';
import type { HudData, ResultStats, OverlayHandlers, Tab } from './types';

export type Hud = {
  el: HTMLElement;
  set: (data: HudData) => void;
  clear: () => void;
};

/** Centered top readout: lives, the salient CREDIT (spendable gold), mult, wave,
 * loop, score, and a status message. */
export function createHud(): Hud {
  const hud = el('div', 'hk-hud');
  const set = (data: HudData): void => {
    const low = data.lives <= 3 ? ' hk-lives-low' : '';
    const loopTag = data.loop > 1 ? `<span class="hk-loop">L${data.loop}</span>` : '';
    // CREDIT (spendable gold) is the salient element — big + glowing.
    hud.innerHTML =
      `<span class="hk-lives${low}">♥ ${data.lives}</span>` +
      `<span class="hk-credit"><span class="hk-credit-label">CREDIT</span>◆ ${data.gold}</span>` +
      `<span class="hk-mult">×${data.mult.toFixed(1)}</span>` +
      `<span class="hk-wave">W ${data.wave}/${data.totalWaves}</span>` +
      loopTag +
      `<span class="hk-score">★ ${data.score}</span>` +
      `<span class="hk-msg">${data.message}</span>`;
  };
  const clear = (): void => { hud.innerHTML = ''; };
  return { el: hud, set, clear };
}

export type Screen = { el: HTMLElement; show: () => void; hide: () => void };

/** Attract/title screen shown over the autoplaying demo. */
export function createTitleScreen(handlers: OverlayHandlers): Screen {
  const titleScreen = el('div', 'hk-title');
  const titleInner = el('div', 'hk-title-inner');
  const titleName = el('div', 'hk-title-name');
  titleName.innerHTML = '<span class="hk-kanji">綻</span> Hokorobi <span class="hk-kanji">塔</span>';
  const titleTag = el('div', 'hk-title-tag', 'Procedural Stalberg Grid Tower Defense');
  const playBtn = el('button', 'hk-play', '▶ PLAY');
  playBtn.addEventListener('click', () => handlers.onPlay());
  const titleDemo = el('div', 'hk-title-demo', '· demo running ·');
  titleInner.append(titleName, titleTag, playBtn, titleDemo);
  titleScreen.append(titleInner);
  return {
    el: titleScreen,
    show: () => titleScreen.classList.add('is-open'),
    hide: () => titleScreen.classList.remove('is-open'),
  };
}

export type ResultScreen = {
  el: HTMLElement;
  show: (won: boolean, stats?: ResultStats) => void;
  hide: () => void;
};

/** Win/lose screen: VICTORY / GAME OVER, a score line, the kills-by-type
 * histogram, and Continue / Play again / Rules. */
export function createResultScreen(handlers: OverlayHandlers, openTo: (t: Tab) => void): ResultScreen {
  const result = el('div', 'hk-result');
  const resultInner = el('div', 'hk-result-inner');
  const resultTitle = el('div', 'hk-result-title');
  const resultSub = el('div', 'hk-result-sub');
  const resultHist = el('div', 'hk-hist'); // kills-by-type histogram
  const resultActions = el('div', 'hk-result-actions');
  const resultContinue = el('button', 'hk-btn', 'Continue →');
  resultContinue.addEventListener('click', () => handlers.onContinue?.());
  const resultBtn = el('button', 'hk-btn hk-btn-ghost', '↻ Play again');
  resultBtn.addEventListener('click', () => handlers.onRegenerate());
  const resultRules = el('button', 'hk-btn hk-btn-ghost', '☰ Rules');
  resultRules.addEventListener('click', () => openTo('rules'));
  resultActions.append(resultContinue, resultBtn, resultRules);
  resultInner.append(resultTitle, resultSub, resultHist, resultActions);
  result.append(resultInner);

  const buildHist = (stats: ResultStats): void => {
    resultHist.innerHTML = '';
    const rows = Object.entries(stats.killsByType)
      .map(([key, n]) => ({ def: UNIT_BY_KEY[key], n }))
      .filter((r): r is { def: UnitDef; n: number } => !!r.def)
      .sort((a, b) => b.n - a.n);
    if (!rows.length) return;
    const max = Math.max(...rows.map((r) => r.n));
    const head = el('div', 'hk-hist-head', `Enemies defeated · ${stats.kills}`);
    resultHist.append(head);
    for (const r of rows) {
      const row = el('div', 'hk-hist-row');
      const name = el('div', 'hk-hist-name', r.def.label);
      const track = el('div', 'hk-hist-track');
      const bar = el('div', 'hk-hist-bar');
      bar.style.width = Math.max(6, (r.n / max) * 100) + '%';
      bar.style.background = `#${(r.def.color >>> 0).toString(16).padStart(6, '0')}`;
      track.append(bar);
      const num = el('div', 'hk-hist-num', String(r.n));
      row.append(name, track, num);
      resultHist.append(row);
    }
  };

  return {
    el: result,
    show: (won, stats) => {
      resultTitle.textContent = won ? 'VICTORY' : 'GAME OVER';
      resultTitle.classList.toggle('is-won', won);
      const blurb = won ? 'All 12 waves cleared. Continue for a harder loop.' : 'The base was overrun.';
      resultSub.textContent = stats ? `${blurb}  ·  Score ${stats.score}` : blurb;
      if (stats) buildHist(stats); else resultHist.innerHTML = '';
      resultContinue.style.display = won ? '' : 'none';
      result.classList.add('is-open');
    },
    hide: () => result.classList.remove('is-open'),
  };
}
