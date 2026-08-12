// overlay.ts — vanilla-TS DOM overlay on top of the Three.js canvas.
// Top bar (title + version badge), a tabbed Dev Log / Rules modal opened from
// the badge, a bottom HUD readout, and a Regenerate control.

import devlogRaw from '../../DEVLOG.md?raw';
import rulesRaw from '../../RULES.md?raw';
import { renderMarkdown } from './markdown';
import { BUILD } from '../version';

export type PaletteItem = { key: string; label: string; role: string };

export type Overlay = {
  setCellInfo: (text: string) => void;
  setSeedInfo: (text: string) => void;
  openPalette: (title: string, items: PaletteItem[], onPick: (key: string) => void) => void;
  closePalette: () => void;
};

export type OverlayHandlers = {
  onRegenerate: () => void;
  onToggleMountains: (style: 'wire' | 'solid') => void;
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
  title.innerHTML = '<span class="hk-kanji">繕</span> HokorobiTawaa';
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
      b.innerHTML = `<span class="hk-unit-label">${it.label}</span><span class="hk-unit-role">${it.role}</span>`;
      b.addEventListener('click', () => {
        onPick(it.key);
        closePalette();
      });
      sheetGrid.append(b);
    }
    sheet.classList.add('is-open');
  };

  root.append(top, scrim, bottom, sheet);

  return {
    setCellInfo: (text) => {
      info.textContent = text;
    },
    setSeedInfo: (text) => {
      seedInfo.textContent = text;
    },
    openPalette,
    closePalette,
  };
}
