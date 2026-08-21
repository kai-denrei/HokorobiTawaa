// overlay.ts — composes the vanilla-TS DOM overlay from focused components in
// ./overlay/*: chrome (top/bottom bars), the tabbed badge panel, the HUD, the
// radial + sheet action menus, and the title/result screens. This file only
// wires the cross-component bits (badge → panel, Escape → panel+radial) and maps
// the components' APIs onto the public Overlay object.

import { createChrome } from './overlay/chrome';
import { createPanel } from './overlay/panel';
import { createRadial, createSheet } from './overlay/menus';
import { createHud, createTitleScreen, createResultScreen } from './overlay/screens';
import type { Overlay, OverlayHandlers } from './overlay/types';

export type {
  Overlay,
  OverlayHandlers,
  PaletteItem,
  RadialItem,
  RadialHandlers,
  HudData,
  ResultStats,
  TowerMenuInfo,
} from './overlay/types';
export { BOARD_SIZE } from './overlay/panel';

export function createOverlay(root: HTMLElement, handlers: OverlayHandlers): Overlay {
  const chrome = createChrome(handlers);
  const panel = createPanel(handlers);
  const hud = createHud();
  const sheet = createSheet();
  const radial = createRadial();
  const result = createResultScreen(handlers, panel.openTo);
  const title = createTitleScreen(handlers);

  // cross-component wiring: the badge opens the panel; Escape closes the panel
  // and any open radial.
  chrome.badge.addEventListener('click', () => panel.openTo('log'));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      panel.close();
      radial.close();
    }
  });

  // append order sets stacking among equal z-index layers (unchanged).
  root.append(chrome.top, hud.el, panel.scrim, chrome.bottom, sheet.el, result.el, title.el, radial.el);

  return {
    setCellInfo: chrome.setCellInfo,
    setSeedInfo: chrome.setSeedInfo,
    openPalette: sheet.openPalette,
    openTowerMenu: sheet.openTowerMenu,
    openRadial: radial.open,
    refreshRadial: radial.refresh,
    closeRadial: radial.close,
    closePalette: sheet.close,
    setHud: hud.set,
    setActiveView: chrome.setActiveView,
    showResult: result.show,
    hideResult: result.hide,
    showTitle: () => {
      hud.clear();
      title.show();
    },
    hideTitle: title.hide,
  };
}
