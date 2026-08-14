// panel.ts — the tabbed badge modal: Dev Log / Rules / Towers / Enemies / Setup,
// with lazily-built + cached content and a #hash deep-link. Owns everything
// inside the scrim; the composer wires the badge (open) and Escape (close).

import devlogRaw from '../../../DEVLOG.md?raw';
import rulesRaw from '../../../RULES.md?raw';
import { renderMarkdown } from '../markdown';
import { BUILD } from '../../version';
import { TOWERS, ENEMIES, type UnitDef } from '../../units/roster';
import { drawSprite } from '../sprite';
import { el } from './dom';
import type { OverlayHandlers, Tab } from './types';

/** Board size (min/default/max target-cell counts) for the maze slider. */
export const BOARD_SIZE = { min: 120, max: 320, step: 10, default: 210 };

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

export type Panel = {
  /** The full-screen scrim (contains the modal). */
  scrim: HTMLElement;
  /** Open the modal to a specific tab. */
  openTo: (t: Tab) => void;
  /** Close the modal. */
  close: () => void;
};

export function createPanel(handlers: OverlayHandlers): Panel {
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
  const openTo = (t: Tab): void => {
    showTab(t);
    scrim.classList.add('is-open');
  };
  const close = (): void => scrim.classList.remove('is-open');

  closeBtn.addEventListener('click', close);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  tabLog.addEventListener('click', () => showTab('log'));
  tabRules.addEventListener('click', () => showTab('rules'));
  tabTowers.addEventListener('click', () => showTab('towers'));
  tabEnemies.addEventListener('click', () => showTab('enemies'));
  tabSetup.addEventListener('click', () => showTab('setup'));

  // Deep-link: #rules / #towers / #enemies / #log / #setup opens that tab.
  const hashTab = (): Tab | null => {
    const h = location.hash.replace(/^#/, '') as Tab;
    return (['log', 'rules', 'towers', 'enemies', 'setup'] as Tab[]).includes(h) ? h : null;
  };
  const applyHash = (): void => {
    const t = hashTab();
    if (t) openTo(t);
  };
  window.addEventListener('hashchange', applyHash);
  applyHash();

  return { scrim, openTo, close };
}
