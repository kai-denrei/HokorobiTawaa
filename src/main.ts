import './ui/styles.css';
import { BoardView } from './render/scene';
import { createOverlay, type PaletteItem } from './ui/overlay';
import { generateBoard, type Board } from './board';
import { TOWERS, ENEMIES } from './units/roster';

const toItems = (defs: typeof TOWERS): PaletteItem[] =>
  defs.map((d) => ({ key: d.key, label: d.label, role: d.role }));

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
  overlay.closePalette();
  board = generateBoard(seed, { targetCells: 130 });
  view.setBoard(board);
  view.highlightCell(null);
  overlay.setSeedInfo(`seed ${seed} · ${board.cells.size} cells · path ${board.path.length}`);
  overlay.setCellInfo('Tap buildable to place a tower · tap the path to spawn an enemy.');
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
  if (!hit) {
    overlay.setCellInfo('— no cell there —');
    overlay.closePalette();
    return;
  }
  const c = hit.cell;
  if (c.terrain === 'buildable') {
    overlay.openPalette(`Place tower · cell #${c.id}`, toItems(TOWERS), (key) => {
      const label = view.spawnTower(c.id, key);
      overlay.setCellInfo(`placed ${label ?? key} on #${c.id} · ${view.unitCount} units`);
    });
  } else if (c.terrain === 'path' || c.terrain === 'spawn' || c.terrain === 'base') {
    overlay.openPalette('Spawn enemy (walks the path)', toItems(ENEMIES), (key) => {
      const label = view.spawnEnemy(key);
      overlay.setCellInfo(`spawned ${label ?? key} · ${view.unitCount} units`);
    });
  } else {
    overlay.setCellInfo(`cell #${c.id} · ${c.terrain} · ${c.neighbors.length} neighbours`);
    overlay.closePalette();
  }
});

// --- dev/test hook: drive spawns from the console or a smoke test ---------
(window as unknown as { __hk?: unknown }).__hk = {
  view,
  get board() {
    return board;
  },
  spawnEnemy: (k: string) => view.spawnEnemy(k),
  firstBuildableScreen: () => {
    const cell = [...board.cells.values()].find((c) => c.terrain === 'buildable');
    return cell ? view.cellScreenPos(cell.id) : null;
  },
  spawnEveryEnemy: () => ENEMIES.map((e) => view.spawnEnemy(e.key)),
  spawnSomeTowers: () => {
    const buildable = [...board.cells.values()].filter((c) => c.terrain === 'buildable');
    TOWERS.forEach((t, i) => {
      const cell = buildable[i * 3 + 1];
      if (cell) view.spawnTower(cell.id, t.key);
    });
  },
};

// --- PWA service worker ---------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}
