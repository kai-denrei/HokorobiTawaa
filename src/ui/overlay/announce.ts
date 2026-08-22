// announce.ts — the new-wave animatic: a CRT/hologram pop-up card that names the
// enemy type(s) a wave introduces, with the enemy drawn as an animated (slowly
// turning) halftone point cloud. Shows for ~3s then fades. Non-interactive
// (pointer-events: none) so it never blocks tower placement while a wave starts.

import { el } from './dom';
import { drawSprite } from '../sprite';
import { UNIT_BY_KEY, type UnitDef } from '../../units/roster';

export type WaveAnnounce = {
  el: HTMLElement;
  show: (keys: string[]) => void;
  hide: () => void;
};

const SPRITE_SIZE = 104;
const HOLD_MS = 3000; // on-screen before it fades
const SPIN_RATE = 0.8; // rad/s turntable spin

export function createWaveAnnounce(): WaveAnnounce {
  const root = el('div', 'hk-announce');
  const card = el('div', 'hk-announce-card');
  const head = el('div', 'hk-announce-head', 'New Threat');
  const grid = el('div', 'hk-announce-grid');
  card.append(head, grid);
  root.append(card);

  let raf = 0;
  let dismiss = 0;
  let startT = 0;
  let sprites: { canvas: HTMLCanvasElement; def: UnitDef }[] = [];

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    if (dismiss) clearTimeout(dismiss);
    raf = 0;
    dismiss = 0;
  };

  const hide = (): void => {
    stop();
    root.classList.remove('is-open');
  };

  const tick = (): void => {
    const spin = ((performance.now() - startT) / 1000) * SPIN_RATE;
    for (const s of sprites) drawSprite(s.canvas, s.def, SPRITE_SIZE, spin);
    raf = requestAnimationFrame(tick);
  };

  const show = (keys: string[]): void => {
    const defs = keys
      .map((k) => UNIT_BY_KEY[k])
      .filter((d): d is UnitDef => !!d && d.family === 'enemy');
    if (defs.length === 0) return;
    stop();
    grid.innerHTML = '';
    sprites = [];
    head.textContent = defs.length > 1 ? 'New Threats' : 'New Threat';
    for (const def of defs) {
      const item = el('div', 'hk-announce-item');
      const canvas = el('canvas', 'hk-announce-canvas');
      item.append(canvas, el('div', 'hk-announce-name', def.label), el('div', 'hk-announce-role', def.role));
      grid.append(item);
      sprites.push({ canvas, def });
    }
    root.classList.add('is-open');
    startT = performance.now();
    tick(); // draw the first frame immediately, then animate
    dismiss = window.setTimeout(hide, HOLD_MS);
  };

  return { el: root, show, hide };
}
