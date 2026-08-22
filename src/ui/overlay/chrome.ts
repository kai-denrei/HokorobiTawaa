// chrome.ts — persistent top bar (title + version badge) and bottom bar
// (cell-inspect readout, seed info, Regenerate, mountains wire/solid toggle).
// The composer wires the badge click (it opens the panel).

import { BUILD } from '../../version';
import { versionGlyphsHTML, applyGlyphFavicon } from '../../version-glyph';
import { el } from './dom';
import type { OverlayHandlers } from './types';

export type Chrome = {
  top: HTMLElement;
  bottom: HTMLElement;
  /** The version badge — the composer wires its click to open the panel. */
  badge: HTMLButtonElement;
  setCellInfo: (text: string) => void;
  setSeedInfo: (text: string) => void;
  /** Highlight the active camera preset (0..2) in the segmented selector. */
  setActiveView: (index: number) => void;
  /** Set the mode label shown in the top bar (e.g. Attract / Campaign / Endless). */
  setMode: (text: string) => void;
};

export function createChrome(handlers: OverlayHandlers): Chrome {
  // --- top bar -----------------------------------------------------------
  const top = el('div', 'hk-top');
  const title = el('div', 'hk-title');
  title.innerHTML = '<span class="hk-kanji">綻</span> HokorobiTawaa <span class="hk-kanji">塔</span>';
  const mode = el('div', 'hk-mode', ''); // current mode label (Attract / Campaign / Endless)
  const badge = el('button', 'hk-badge');
  badge.innerHTML = `${versionGlyphsHTML(BUILD.token)}v${BUILD.version}<span class="hk-badge-token">${BUILD.token}</span>`;
  applyGlyphFavicon(BUILD.token); // tab icon = the build's glyph (cache-bust check)
  badge.title = 'Build version — open Dev Log & Rules';
  top.append(title, mode, badge);

  // --- bottom bar --------------------------------------------------------
  const bottom = el('div', 'hk-bottom');
  const info = el('div', 'hk-info', 'Tap a cell to inspect it.');
  const seedInfo = el('div', 'hk-seed', '');
  const regen = el('button', 'hk-btn', '↻ Regenerate');
  regen.addEventListener('click', () => handlers.onRegenerate());

  let mountainSolid = false; // default view is wireframe
  const toggle = el('button', 'hk-btn hk-btn-ghost', '⛰ Wire');
  toggle.title = 'Toggle mountains: wireframe / solid';
  toggle.addEventListener('click', () => {
    mountainSolid = !mountainSolid;
    toggle.textContent = mountainSolid ? '⛰ Solid' : '⛰ Wire';
    handlers.onToggleMountains(mountainSolid ? 'solid' : 'wire');
  });

  // camera view selector — three cinematic presets, a compact segmented control
  // grouped with the mountains toggle (both change how the board is viewed).
  const views = el('div', 'hk-views');
  views.setAttribute('role', 'group');
  views.setAttribute('aria-label', 'Camera view');
  const viewNames = ['Overhead', 'Trench', 'Tactical', 'Action', 'Cinematic'];
  const viewBtns = [0, 1, 2, 3, 4].map((i) => {
    const b = el('button', 'hk-view-btn', String(i + 1));
    b.title = `${viewNames[i]} camera view`;
    if (i === 0) b.classList.add('is-active'); // default view #1 (Overhead)
    // delegate only — the highlight is updated via setActiveView so keyboard and
    // swipe stay in sync through the same path (see the composer / main.ts).
    b.addEventListener('click', () => handlers.onSetView(i));
    return b;
  });
  for (const b of viewBtns) views.append(b);
  const setActiveView = (index: number): void => {
    for (const [j, x] of viewBtns.entries()) x.classList.toggle('is-active', j === index);
  };

  const left = el('div', 'hk-bottom-left');
  left.append(info, seedInfo);
  const controls = el('div', 'hk-controls');
  controls.append(views, toggle, regen);
  bottom.append(left, controls);

  return {
    top,
    bottom,
    badge,
    setCellInfo: (text) => { info.textContent = text; },
    setSeedInfo: (text) => { seedInfo.textContent = text; },
    setActiveView,
    setMode: (text) => { mode.textContent = text; },
  };
}
