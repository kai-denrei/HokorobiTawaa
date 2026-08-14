// overlay.ts — vanilla-TS DOM overlay on top of the Three.js canvas.
// Top bar (title + version badge), a tabbed Dev Log / Rules modal opened from
// the badge, a bottom HUD readout, and a Regenerate control.

import devlogRaw from '../../DEVLOG.md?raw';
import rulesRaw from '../../RULES.md?raw';
import { renderMarkdown } from './markdown';
import { BUILD } from '../version';
import { versionGlyphsHTML, applyGlyphFavicon } from '../version-glyph';
import { TOWERS, ENEMIES, UNIT_BY_KEY, type UnitDef } from '../units/roster';
import { drawSprite } from './sprite';

export type PaletteItem = { key: string; label: string; role: string; cost?: number; affordable?: boolean };

export type RadialItem = { key: string; label: string; cost?: number; affordable?: boolean; color?: number };
export type RadialHandlers = {
  onPick: (key: string) => void;
  onFocus?: (key: string) => void;
  onClose?: () => void;
  /** live affordability check (re-run via refreshRadial when gold changes). */
  canAfford?: (key: string) => boolean;
};

export type HudData = {
  lives: number;
  maxLives: number;
  gold: number;
  mult: number;
  wave: number;
  totalWaves: number;
  loop: number;
  score: number;
  message: string;
  status: string;
};

/** End-of-run stats for the result screen (mirrors game RunStats). */
export type ResultStats = {
  score: number;
  kills: number;
  loop: number;
  killsByType: Record<string, number>;
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
  openRadial: (cx: number, cy: number, items: RadialItem[], h: RadialHandlers) => void;
  refreshRadial: () => void;
  closeRadial: () => void;
  closePalette: () => void;
  setHud: (data: HudData) => void;
  showResult: (won: boolean, stats?: ResultStats) => void;
  hideResult: () => void;
  showTitle: () => void;
  hideTitle: () => void;
};

export type OverlayHandlers = {
  onRegenerate: () => void;
  onToggleMountains: (style: 'wire' | 'solid') => void;
  onPlay: () => void;
  /** Maze target-cell count changed (applied on release). */
  onBoardSize?: (cells: number) => void;
  /** Continue after a victory into the next, harder loop. */
  onContinue?: () => void;
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

/** Human-readable stat chips for a tower or enemy, drawn under its sprite. */
function unitStats(u: UnitDef): string[] {
  if (u.family === 'tower') {
    const s: string[] = [];
    if (u.cost != null) s.push(`◆${u.cost}`);
    if (u.damage) s.push(`dmg ${u.damage}`);
    if (u.range) s.push(`↔ ${u.range}`);
    if (u.fireRate) s.push(`⟳ ${u.fireRate}/s`);
    switch (u.attack) {
      case 'spread': s.push(`${u.pellets ?? 0} pellets`); break;
      case 'homing': s.push('homing'); break;
      case 'mortar': s.push(`splash ${u.splash ?? 0}`); break;
      case 'beam': s.push('instant beam'); break;
      case 'slow': s.push(`slow ×${u.slowFactor ?? 1} · ${u.slowDur ?? 0}s`); break;
    }
    return s;
  }
  const s: string[] = [];
  if (u.hp) s.push(`♥ ${u.hp}`);
  if (u.bounty != null) s.push(`◆ ${u.bounty}`);
  if (u.speed != null) s.push(`» ${u.speed}`);
  if (u.erratic) s.push('erratic');
  if (u.accelOnHit) s.push('speeds up when hit');
  if (u.slowOnHitSelf) s.push('slows when hit');
  if (u.healOOC) s.push('regenerates');
  if (u.auraBoost) s.push('boosts allies');
  return s;
}

/** A responsive grid of unit cards: dotted sprite + label/role + stat chips. */
function buildGallery(units: UnitDef[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'hk-gallery';
  for (const u of units) {
    const card = document.createElement('div');
    card.className = 'hk-card';
    const canvas = document.createElement('canvas');
    canvas.className = 'hk-card-sprite';
    drawSprite(canvas, u);
    const text = document.createElement('div');
    text.className = 'hk-card-text';
    const chips = unitStats(u).map((s) => `<span class="hk-chip">${s}</span>`).join('');
    text.innerHTML =
      `<div class="hk-card-name">${u.label}</div>` +
      `<div class="hk-card-role">${u.role}</div>` +
      `<div class="hk-card-stats">${chips}</div>`;
    card.append(canvas, text);
    grid.append(card);
  }
  return grid;
}

/** Board size (min/default/max target-cell counts) for the maze slider. */
export const BOARD_SIZE = { min: 120, max: 320, step: 10, default: 210 };

/** "Setup" tab: the maze-size slider (applies on release). */
function buildSetup(handlers: OverlayHandlers): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'hk-setup';
  const row = document.createElement('div');
  row.className = 'hk-setup-row';
  const label = document.createElement('label');
  label.className = 'hk-setup-label';
  label.textContent = 'Maze size';
  const val = document.createElement('span');
  val.className = 'hk-setup-val';
  val.textContent = String(BOARD_SIZE.default);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'hk-slider';
  slider.min = String(BOARD_SIZE.min);
  slider.max = String(BOARD_SIZE.max);
  slider.step = String(BOARD_SIZE.step);
  slider.value = String(BOARD_SIZE.default);
  slider.setAttribute('aria-label', 'Maze size (cells)');
  slider.addEventListener('input', () => { val.textContent = slider.value; });
  slider.addEventListener('change', () => handlers.onBoardSize?.(Number(slider.value)));
  row.append(label, val);
  wrap.append(row, slider);
  const hint = document.createElement('div');
  hint.className = 'hk-setup-hint';
  hint.textContent = 'Cells in the procedural board — smaller is tighter, larger is roomier. Applies to the next board (Regenerate, or the next run if a game is in progress).';
  wrap.append(hint);
  return wrap;
}

export function createOverlay(root: HTMLElement, handlers: OverlayHandlers): Overlay {
  // --- top bar -------------------------------------------------------------
  const top = el('div', 'hk-top');
  const title = el('div', 'hk-title');
  title.innerHTML = '<span class="hk-kanji">綻</span> HokorobiTawaa <span class="hk-kanji">塔</span>';
  const badge = el('button', 'hk-badge');
  badge.innerHTML = `${versionGlyphsHTML(BUILD.token)}v${BUILD.version}<span class="hk-badge-token">${BUILD.token}</span>`;
  applyGlyphFavicon(BUILD.token); // tab icon = the build's glyph (cache-bust check)
  badge.title = 'Build version — open Dev Log & Rules';
  top.append(title, badge);

  // --- panel (modal) -------------------------------------------------------
  const scrim = el('div', 'hk-scrim');
  const panel = el('div', 'hk-panel');
  const tabs = el('div', 'hk-tabs');
  const tabLog = el('button', 'hk-tab is-active', 'Dev Log');
  const tabRules = el('button', 'hk-tab', 'Rules');
  const tabTowers = el('button', 'hk-tab', 'Towers');
  const tabEnemies = el('button', 'hk-tab', 'Enemies');
  const tabSetup = el('button', 'hk-tab', 'Setup');
  const closeBtn = el('button', 'hk-close', '×');
  tabs.append(tabLog, tabRules, tabTowers, tabEnemies, tabSetup, closeBtn);
  const body = el('div', 'hk-panel-body');
  const meta = el('div', 'hk-panel-meta', `build ${BUILD.token} · ${BUILD.builtAt}`);
  panel.append(tabs, body, meta);
  scrim.append(panel);

  type Tab = 'log' | 'rules' | 'towers' | 'enemies' | 'setup';
  const tabBtns: Record<Tab, HTMLButtonElement> = {
    log: tabLog,
    rules: tabRules,
    towers: tabTowers,
    enemies: tabEnemies,
    setup: tabSetup,
  };
  // Content is built lazily and cached (galleries render point-cloud sprites once).
  const content: Partial<Record<Tab, HTMLElement>> = {};
  const buildContent = (which: Tab): HTMLElement => {
    if (content[which]) return content[which]!;
    let node: HTMLElement;
    if (which === 'log') {
      node = el('div');
      node.innerHTML = renderMarkdown(devlogRaw);
    } else if (which === 'rules') {
      node = el('div');
      node.innerHTML = renderMarkdown(rulesRaw);
    } else if (which === 'setup') {
      node = buildSetup(handlers);
    } else {
      node = buildGallery(which === 'towers' ? TOWERS : ENEMIES);
    }
    content[which] = node;
    return node;
  };
  const showTab = (which: Tab): void => {
    for (const k of Object.keys(tabBtns) as Tab[]) tabBtns[k].classList.toggle('is-active', k === which);
    body.innerHTML = '';
    body.append(buildContent(which));
    body.scrollTop = 0;
  };
  const openPanelTo = (t: Tab): void => {
    showTab(t);
    scrim.classList.add('is-open');
  };
  const openPanel = (): void => openPanelTo('log');
  const closePanel = (): void => scrim.classList.remove('is-open');

  badge.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) closePanel();
  });
  tabLog.addEventListener('click', () => showTab('log'));
  tabRules.addEventListener('click', () => showTab('rules'));
  tabTowers.addEventListener('click', () => showTab('towers'));
  tabEnemies.addEventListener('click', () => showTab('enemies'));
  tabSetup.addEventListener('click', () => showTab('setup'));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePanel();
      closeRadial();
    }
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

  // --- HUD (lives / credit / wave / score) --------------------------------
  const hud = el('div', 'hk-hud');

  /** Render the kills-by-type histogram into `resultHist` from run stats. */
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

  // --- win / lose result screen -------------------------------------------
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
  resultRules.addEventListener('click', () => openPanelTo('rules'));
  resultActions.append(resultContinue, resultBtn, resultRules);
  resultInner.append(resultTitle, resultSub, resultHist, resultActions);
  result.append(resultInner);

  // --- attract / title screen (shown over the autoplaying demo) -----------
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

  // --- radial menu (tower placement / actions, positioned at the tap) ------
  const radial = el('div', 'hk-radial');
  let radialOnClose: (() => void) | null = null;
  let radialCanAfford: ((key: string) => boolean) | null = null;
  let radialButtons: { it: RadialItem; btn: HTMLButtonElement }[] = [];
  const isLocked = (it: RadialItem): boolean => (radialCanAfford ? !radialCanAfford(it.key) : it.affordable === false);
  const closeRadial = (): void => {
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
    if (e.target === radial) closeRadial();
  });
  const openRadial = (cx: number, cy: number, items: RadialItem[], h: RadialHandlers): void => {
    radial.innerHTML = '';
    radialOnClose = h.onClose ?? null;
    radialCanAfford = h.canAfford ?? null;
    radialButtons = [];
    const R = 104;
    const pad = 86;
    const px = Math.max(pad, Math.min(window.innerWidth - pad, cx));
    const py = Math.max(pad + 44, Math.min(window.innerHeight - pad - 60, cy));
    const n = items.length;
    items.forEach((it, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const btn = el('button', 'hk-radial-item');
      if (isLocked(it)) btn.classList.add('is-locked');
      btn.style.left = px + Math.cos(ang) * R + 'px';
      btn.style.top = py + Math.sin(ang) * R + 'px';
      const dot = it.color != null ? `<span class="hk-radial-dot" style="color:#${it.color.toString(16).padStart(6, '0')}"></span>` : '';
      const cost = it.cost != null ? `<span class="hk-radial-cost">◆${it.cost}</span>` : '';
      btn.innerHTML = `${dot}<span class="hk-radial-label">${it.label}</span>${cost}`;
      btn.addEventListener('click', () => {
        if (isLocked(it)) return;
        h.onPick(it.key);
        closeRadial();
      });
      btn.addEventListener('pointerenter', () => h.onFocus?.(it.key));
      radial.append(btn);
      radialButtons.push({ it, btn });
    });
    const center = el('div', 'hk-radial-center');
    center.style.left = px + 'px';
    center.style.top = py + 'px';
    radial.append(center);
    radial.classList.add('is-open');
  };
  const refreshRadial = (): void => {
    if (!radial.classList.contains('is-open')) return;
    for (const { it, btn } of radialButtons) btn.classList.toggle('is-locked', isLocked(it));
  };

  root.append(top, hud, scrim, bottom, sheet, result, titleScreen, radial);

  // Deep-link: #rules / #towers / #enemies / #log opens the panel to that tab.
  const hashTab = (): Tab | null => {
    const h = location.hash.replace(/^#/, '') as Tab;
    return (['log', 'rules', 'towers', 'enemies', 'setup'] as Tab[]).includes(h) ? h : null;
  };
  const applyHash = (): void => {
    const t = hashTab();
    if (t) {
      showTab(t);
      scrim.classList.add('is-open');
    }
  };
  window.addEventListener('hashchange', applyHash);
  applyHash();

  return {
    setCellInfo: (text) => {
      info.textContent = text;
    },
    setSeedInfo: (text) => {
      seedInfo.textContent = text;
    },
    openPalette,
    openTowerMenu,
    openRadial,
    refreshRadial,
    closeRadial,
    closePalette,
    setHud: (data) => {
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
    },
    showResult: (won, stats) => {
      resultTitle.textContent = won ? 'VICTORY' : 'GAME OVER';
      resultTitle.classList.toggle('is-won', won);
      const blurb = won ? 'All 12 waves cleared. Continue for a harder loop.' : 'The base was overrun.';
      resultSub.textContent = stats ? `${blurb}  ·  Score ${stats.score}` : blurb;
      if (stats) buildHist(stats); else resultHist.innerHTML = '';
      resultContinue.style.display = won ? '' : 'none';
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
