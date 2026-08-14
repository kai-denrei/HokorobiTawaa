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
};

export function createChrome(handlers: OverlayHandlers): Chrome {
  // --- top bar -----------------------------------------------------------
  const top = el('div', 'hk-top');
  const title = el('div', 'hk-title');
  title.innerHTML = '<span class="hk-kanji">綻</span> HokorobiTawaa <span class="hk-kanji">塔</span>';
  const badge = el('button', 'hk-badge');
  badge.innerHTML = `${versionGlyphsHTML(BUILD.token)}v${BUILD.version}<span class="hk-badge-token">${BUILD.token}</span>`;
  applyGlyphFavicon(BUILD.token); // tab icon = the build's glyph (cache-bust check)
  badge.title = 'Build version — open Dev Log & Rules';
  top.append(title, badge);

  // --- bottom bar --------------------------------------------------------
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

  return {
    top,
    bottom,
    badge,
    setCellInfo: (text) => { info.textContent = text; },
    setSeedInfo: (text) => { seedInfo.textContent = text; },
  };
}
