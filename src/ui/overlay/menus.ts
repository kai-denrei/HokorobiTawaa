// menus.ts — contextual tower-action menus: the radial ring shown at the tap
// (place / upgrade / sell) and the bottom sheet (spawn palette + tower menu).

import { el } from './dom';
import { fitShift } from './radial-fit';
import type { PaletteItem, RadialItem, RadialHandlers, TowerMenuInfo } from './types';

export type Radial = {
  el: HTMLElement;
  open: (cx: number, cy: number, items: RadialItem[], h: RadialHandlers) => void;
  refresh: () => void;
  close: () => void;
};

/** env(safe-area-inset-left/right) in px — the notch / rounded-corner gutters at
 * the sides (in landscape). The top/bottom chrome bars already carry the top and
 * bottom insets, but nothing covers the horizontal ones. Measured via a throwaway
 * probe (env() only resolves in real layout); read fresh since a rotation changes
 * them, and menu-open is rare enough that one forced style read is cheap. */
function horizontalInsets(): { left: number; right: number } {
  const probe = el('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
  document.body.append(probe);
  const s = getComputedStyle(probe);
  const left = parseFloat(s.paddingLeft) || 0;
  const right = parseFloat(s.paddingRight) || 0;
  probe.remove();
  return { left, right };
}

/** A ring of action buttons positioned at the tap point. */
export function createRadial(): Radial {
  const radial = el('div', 'hk-radial');
  let radialOnClose: (() => void) | null = null;
  let radialCanAfford: ((key: string) => boolean) | null = null;
  let radialButtons: { it: RadialItem; btn: HTMLButtonElement }[] = [];
  const isLocked = (it: RadialItem): boolean => (radialCanAfford ? !radialCanAfford(it.key) : it.affordable === false);
  const close = (): void => {
    if (!radial.classList.contains('is-open')) return;
    radial.classList.remove('is-open');
    radial.innerHTML = '';
    radialButtons = [];
    radialCanAfford = null;
    const cb = radialOnClose;
    radialOnClose = null;
    cb?.();
  };
  radial.addEventListener('pointerdown', (e) => {
    if (e.target === radial) close();
  });
  const open = (cx: number, cy: number, items: RadialItem[], h: RadialHandlers): void => {
    radial.innerHTML = '';
    radialOnClose = h.onClose ?? null;
    radialCanAfford = h.canAfford ?? null;
    radialButtons = [];

    // Ring radius scales down on small viewports so the whole wheel has a chance
    // to fit before we nudge it (avoids a large ring that must always be shifted).
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const R = Math.max(66, Math.min(104, Math.min(vw, vh) * 0.3));

    // Lay the ring out AT the tap point; we shift the whole thing into frame
    // after measuring (see below). Buttons live in a wrapper we can translate in
    // one go; the wrapper is click-through so taps on empty space still close.
    const ring = el('div', 'hk-radial-ring');
    const n = items.length;
    items.forEach((it, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const btn = el('button', 'hk-radial-item');
      if (isLocked(it)) btn.classList.add('is-locked');
      btn.style.left = cx + Math.cos(ang) * R + 'px';
      btn.style.top = cy + Math.sin(ang) * R + 'px';
      const dot = it.color != null ? `<span class="hk-radial-dot" style="color:#${it.color.toString(16).padStart(6, '0')}"></span>` : '';
      const cost = it.cost != null ? `<span class="hk-radial-cost">◆${it.cost}</span>` : '';
      btn.innerHTML = `${dot}<span class="hk-radial-label">${it.label}</span>${cost}`;
      btn.addEventListener('click', () => {
        if (isLocked(it)) return;
        h.onPick(it.key);
        close();
      });
      btn.addEventListener('pointerenter', () => h.onFocus?.(it.key));
      ring.append(btn);
      radialButtons.push({ it, btn });
    });
    const center = el('div', 'hk-radial-center');
    center.style.left = cx + 'px';
    center.style.top = cy + 'px';
    ring.append(center);
    radial.append(ring);
    radial.classList.add('is-open');

    // Measure the real button box (accounts for variable label widths) and shift
    // the ring by the smallest offset that keeps it clear of the screen edges and
    // the top/bottom chrome bars (whose rects already include safe-area insets).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { btn } of radialButtons) {
      const r = btn.getBoundingClientRect();
      if (r.left < minX) minX = r.left;
      if (r.top < minY) minY = r.top;
      if (r.right > maxX) maxX = r.right;
      if (r.bottom > maxY) maxY = r.bottom;
    }
    if (Number.isFinite(minX)) {
      const M = 8;
      const ins = horizontalInsets();
      const topBar = document.querySelector('.hk-top');
      const botBar = document.querySelector('.hk-bottom');
      const safeT = (topBar ? topBar.getBoundingClientRect().bottom : 0) + M;
      const safeB = (botBar ? botBar.getBoundingClientRect().top : vh) - M;
      const { dx, dy } = fitShift(
        { minX, minY, maxX, maxY },
        { l: M + ins.left, t: safeT, r: vw - M - ins.right, btm: safeB },
      );
      if (dx || dy) ring.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };
  const refresh = (): void => {
    if (!radial.classList.contains('is-open')) return;
    for (const { it, btn } of radialButtons) btn.classList.toggle('is-locked', isLocked(it));
  };
  return { el: radial, open, refresh, close };
}

export type Sheet = {
  el: HTMLElement;
  openPalette: (title: string, items: PaletteItem[], onPick: (key: string) => void) => void;
  openTowerMenu: (info: TowerMenuInfo, on: { onUpgrade: () => void; onSell: () => void }) => void;
  close: () => void;
};

/** Bottom sheet reused for the spawn palette and the tower upgrade/sell menu. */
export function createSheet(): Sheet {
  const sheet = el('div', 'hk-sheet');
  const sheetHead = el('div', 'hk-sheet-head');
  const sheetTitle = el('div', 'hk-sheet-title', '');
  const sheetClose = el('button', 'hk-close', '×');
  sheetHead.append(sheetTitle, sheetClose);
  const sheetGrid = el('div', 'hk-sheet-grid');
  sheet.append(sheetHead, sheetGrid);

  const close = (): void => sheet.classList.remove('is-open');
  sheetClose.addEventListener('click', close);

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
        close();
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
      close();
    });
    sheetGrid.append(sell);

    sheet.classList.add('is-open');
  };

  return { el: sheet, openPalette, openTowerMenu, close };
}
