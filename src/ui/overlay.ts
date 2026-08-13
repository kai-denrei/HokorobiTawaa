// overlay.ts — vanilla-TS DOM overlay on top of the Three.js canvas.
// Top bar (title + version badge), a tabbed Dev Log / Rules modal opened from
// the badge, a bottom HUD readout, and a Regenerate control.

import devlogRaw from '../../DEVLOG.md?raw';
import rulesRaw from '../../RULES.md?raw';
import { renderMarkdown } from './markdown';
import { BUILD } from '../version';

export type PaletteItem = { key: string; label: string; role: string; cost?: number; affordable?: boolean };

export type HudData = {
  lives: number;
  gold: number;
  mult: number;
  wave: number;
  totalWaves: number;
  message: string;
  status: string;
};

export type TowerMenuInfo = {
  label: string;
  tier: number;
  nextCost: number | null;
  sellValue: number;
  canAffordUpgrade: boolean;
};

export type Overlay = {
  setCellInfo: (text: string) => void;
  setSeedInfo: (text: string) => void;
  openPalette: (title: string, items: PaletteItem[], onPick: (key: string) => void) => void;
  openTowerMenu: (info: TowerMenuInfo, on: { onUpgrade: () => void; onSell: () => void }) => void;
  closePalette: () => void;
  setHud: (data: HudData) => void;
  showResult: (won: boolean) => void;
  hideResult: () => void;
  showTitle: () => void;
  hideTitle: () => void;
};

export type OverlayHandlers = {
  onRegenerate: () => void;
  onToggleMountains: (style: 'wire' | 'solid') => void;
  onPlay: () => void;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createOverlay(root: HTMLElement, handlers: OverlayHandlers): Overlay {
  // --- top bar -------------------------------------------------------------
  const top = el('div', 'hk-top');
  const title = el('div', 'hk-title');
  title.innerHTML = '<span class="hk-kanji">綻</span> HokorobiTawaa <span class="hk-kanji">塔</span>';
  const badge = el('button', 'hk-badge');
  badge.innerHTML = `<span class="hk-badge-dot"></span>v${BUILD.version}<span class="hk-badge-token">${BUILD.token}</span>`;
  badge.title = 'Build version — open Dev Log & Rules';
  top.append(title, badge);

  // --- panel (modal) -------------------------------------------------------
  const scrim = el('div', 'hk-scrim');
  const panel = el('div', 'hk-panel');
  const tabs = el('div', 'hk-tabs');
  const tabLog = el('button', 'hk-tab is-active', 'Dev Log');
  const tabRules = el('button', 'hk-tab', 'Rules');
  const closeBtn = el('button', 'hk-close', '×');
  tabs.append(tabLog, tabRules, closeBtn);
  const body = el('div', 'hk-panel-body');
  const meta = el('div', 'hk-panel-meta', `build ${BUILD.token} · ${BUILD.builtAt}`);
  panel.append(tabs, body, meta);
  scrim.append(panel);

  const logHtml = renderMarkdown(devlogRaw);
  const rulesHtml = renderMarkdown(rulesRaw);
  const showTab = (which: 'log' | 'rules'): void => {
    tabLog.classList.toggle('is-active', which === 'log');
    tabRules.classList.toggle('is-active', which === 'rules');
    body.innerHTML = which === 'log' ? logHtml : rulesHtml;
    body.scrollTop = 0;
  };
  const openPanel = (): void => {
    showTab('log');
    scrim.classList.add('is-open');
  };
  const closePanel = (): void => scrim.classList.remove('is-open');

  badge.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) closePanel();
  });
  tabLog.addEventListener('click', () => showTab('log'));
  tabRules.addEventListener('click', () => showTab('rules'));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  // --- bottom bar ----------------------------------------------------------
  const bottom = el('div', 'hk-bottom');
  const info = el('div', 'hk-info', 'Tap a cell to inspect it.');
  const seedInfo = el('div', 'hk-seed', '');
  const regen = el('button', 'hk-btn', '↻ Regenerate');
  regen.addEventListener('click', () => handlers.onRegenerate());

  let mountainSolid = true;
  const toggle = el('button', 'hk-btn hk-btn-ghost', '⛰ Solid');
  toggle.title = 'Toggle mountains: wireframe / solid';
  toggle.addEventListener('click', () => {
    mountainSolid = !mountainSolid;
    toggle.textContent = mountainSolid ? '⛰ Solid' : '⛰ Wire';
    handlers.onToggleMountains(mountainSolid ? 'solid' : 'wire');
  });

  const left = el('div', 'hk-bottom-left');
  left.append(info, seedInfo);
  const controls = el('div', 'hk-controls');
  controls.append(toggle, regen);
  bottom.append(left, controls);

  // --- spawn palette (bottom sheet) ---------------------------------------
  const sheet = el('div', 'hk-sheet');
  const sheetHead = el('div', 'hk-sheet-head');
  const sheetTitle = el('div', 'hk-sheet-title', '');
  const sheetClose = el('button', 'hk-close', '×');
  sheetHead.append(sheetTitle, sheetClose);
  const sheetGrid = el('div', 'hk-sheet-grid');
  sheet.append(sheetHead, sheetGrid);

  const closePalette = (): void => sheet.classList.remove('is-open');
  sheetClose.addEventListener('click', closePalette);

  const openPalette = (title: string, items: PaletteItem[], onPick: (key: string) => void): void => {
    sheetTitle.textContent = title;
    sheetGrid.innerHTML = '';
    for (const it of items) {
      const b = el('button', 'hk-unit');
      const locked = it.affordable === false;
      if (locked) b.classList.add('is-locked');
      const cost = it.cost != null ? ` <span class="hk-unit-cost">◆${it.cost}</span>` : '';
      b.innerHTML = `<span class="hk-unit-label">${it.label}${cost}</span><span class="hk-unit-role">${it.role}</span>`;
      b.addEventListener('click', () => {
        if (locked) return;
        onPick(it.key);
        closePalette();
      });
      sheetGrid.append(b);
    }
    sheet.classList.add('is-open');
  };

  const openTowerMenu = (info: TowerMenuInfo, on: { onUpgrade: () => void; onSell: () => void }): void => {
    sheetTitle.textContent = `${info.label} · Tier ${info.tier}`;
    sheetGrid.innerHTML = '';

    const up = el('button', 'hk-unit');
    if (info.nextCost == null) {
      up.classList.add('is-locked');
      up.innerHTML = '<span class="hk-unit-label">Max tier</span><span class="hk-unit-role">fully upgraded</span>';
    } else {
      const locked = !info.canAffordUpgrade;
      if (locked) up.classList.add('is-locked');
      up.innerHTML = `<span class="hk-unit-label">Upgrade <span class="hk-unit-cost">◆${info.nextCost}</span></span><span class="hk-unit-role">+damage · range · rate</span>`;
      up.addEventListener('click', () => {
        if (locked) return;
        on.onUpgrade();
      });
    }
    sheetGrid.append(up);

    const sell = el('button', 'hk-unit');
    sell.innerHTML = `<span class="hk-unit-label">Sell <span class="hk-unit-cost">+◆${info.sellValue}</span></span><span class="hk-unit-role">remove tower</span>`;
    sell.addEventListener('click', () => {
      on.onSell();
      closePalette();
    });
    sheetGrid.append(sell);

    sheet.classList.add('is-open');
  };

  // --- HUD (lives / wave / timer) -----------------------------------------
  const hud = el('div', 'hk-hud');

  // --- win / lose result screen -------------------------------------------
  const result = el('div', 'hk-result');
  const resultInner = el('div', 'hk-result-inner');
  const resultTitle = el('div', 'hk-result-title');
  const resultSub = el('div', 'hk-result-sub');
  const resultBtn = el('button', 'hk-btn', '↻ Play again');
  resultBtn.addEventListener('click', () => handlers.onRegenerate());
  resultInner.append(resultTitle, resultSub, resultBtn);
  result.append(resultInner);

  // --- attract / title screen (shown over the autoplaying demo) -----------
  const titleScreen = el('div', 'hk-title');
  const titleInner = el('div', 'hk-title-inner');
  const titleName = el('div', 'hk-title-name');
  titleName.innerHTML = '<span class="hk-kanji">綻</span> HokorobiTawaa <span class="hk-kanji">塔</span>';
  const titleTag = el('div', 'hk-title-tag', 'procedural wireframe tower defense');
  const playBtn = el('button', 'hk-play', '▶ PLAY');
  playBtn.addEventListener('click', () => handlers.onPlay());
  const titleDemo = el('div', 'hk-title-demo', '· demo running ·');
  titleInner.append(titleName, titleTag, playBtn, titleDemo);
  titleScreen.append(titleInner);

  root.append(top, hud, scrim, bottom, sheet, result, titleScreen);

  return {
    setCellInfo: (text) => {
      info.textContent = text;
    },
    setSeedInfo: (text) => {
      seedInfo.textContent = text;
    },
    openPalette,
    openTowerMenu,
    closePalette,
    setHud: (data) => {
      const low = data.lives <= 3 ? ' hk-lives-low' : '';
      hud.innerHTML =
        `<span class="hk-lives${low}">♥ ${data.lives}</span>` +
        `<span class="hk-gold">◆ ${data.gold}</span>` +
        `<span class="hk-mult">×${data.mult.toFixed(1)}</span>` +
        `<span class="hk-wave">W ${data.wave}/${data.totalWaves}</span>` +
        `<span class="hk-msg">${data.message}</span>`;
    },
    showResult: (won) => {
      resultTitle.textContent = won ? 'VICTORY' : 'GAME OVER';
      resultTitle.classList.toggle('is-won', won);
      resultSub.textContent = won ? 'All waves cleared.' : 'The base was overrun.';
      result.classList.add('is-open');
    },
    hideResult: () => result.classList.remove('is-open'),
    showTitle: () => {
      hud.innerHTML = '';
      titleScreen.classList.add('is-open');
    },
    hideTitle: () => titleScreen.classList.remove('is-open'),
  };
}
