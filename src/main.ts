import './ui/styles.css';
import { BoardView } from './render/scene';
import { createOverlay } from './ui/overlay';
import { generateBoard, type Board } from './board';

const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;
const app = document.getElementById('app') as HTMLElement;

const view = new BoardView(canvas);
let seed = (Math.random() * 0x7fffffff) | 0;
let board: Board;

const overlay = createOverlay(app, {
  onRegenerate: () => {
    seed = (Math.random() * 0x7fffffff) | 0;
    regenerate();
  },
  onToggleMountains: (style) => view.setMountainStyle(style),
});

function regenerate(): void {
  board = generateBoard(seed, { targetCells: 130 });
  view.setBoard(board);
  view.highlightCell(null);
  overlay.setSeedInfo(`seed ${seed} · ${board.cells.size} cells · path ${board.path.length}`);
  overlay.setCellInfo('Tap a cell to inspect it.');
}

regenerate();
view.start();

// --- tap detection (distinguish tap from drag/scroll) --------------------
let downX = 0;
let downY = 0;
let downT = 0;
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
  downT = performance.now();
});
canvas.addEventListener('pointerup', (e) => {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved > 12 || performance.now() - downT > 600) return;
  const hit = view.pick(e.clientX, e.clientY);
  view.highlightCell(hit?.cell ?? null);
  if (hit) {
    const c = hit.cell;
    overlay.setCellInfo(`cell #${c.id} · ${c.terrain} · ${c.neighbors.length} neighbours`);
  } else {
    overlay.setCellInfo('— no cell there —');
  }
});

// --- PWA service worker ---------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}
