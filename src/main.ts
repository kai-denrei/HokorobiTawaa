import './ui/styles.css';
import { BoardView } from './render/scene';
import { createOverlay, BOARD_SIZE, type RadialItem } from './ui/overlay';
import { generateBoard, type Board } from './board';
import { TOWERS, ENEMIES } from './units/roster';
import { Game } from './game/game';

const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;
const app = document.getElementById('app') as HTMLElement;

const view = new BoardView(canvas);
let seed = (Math.random() * 0x7fffffff) | 0;
let boardSize = BOARD_SIZE.default; // maze target-cell count (Setup slider)
let board: Board;
let selectedTower: number | null = null; // last-tapped tower cell (W / ↑ upgrades it)

type Mode = 'attract' | 'play';
let mode: Mode = 'attract';
let demoTimer = 0;

const rand = (): number => (Math.random() * 0x7fffffff) | 0;

const overlay = createOverlay(app, {
  onRegenerate: () => {
    seed = rand();
    if (mode === 'attract') startAttract();
    else newPlayBoard();
  },
  onToggleMountains: (style) => view.setMountainStyle(style),
  onSetView: (index) => selectView(index),
  onPlay: () => startPlay(),
  onBoardSize: (n) => {
    boardSize = n;
    // Regenerate immediately only in attract mode; a live run keeps its board
    // and picks up the new size on the next Regenerate / new run.
    if (mode === 'attract') startAttract();
    else overlay.setCellInfo(`Maze size ${n} — applies on next Regenerate.`);
  },
  onContinue: () => {
    overlay.hideResult();
    game.continueRun();
  },
});

const game = new Game(view, {
  onHud: (d) => {
    overlay.setHud(d);
    view.setBaseLives(d.maxLives ? d.lives / d.maxLives : 1);
    overlay.refreshRadial(); // gold changed → update affordability of an open menu
  },
  onResult: (status, stats) => overlay.showResult(status === 'won', stats),
  onOpenPath: (index) => view.openPath(index),
});

view.onTick = (dt) => {
  if (mode === 'attract') demoTick(dt);
  else game.tick(dt);
};
view.onLeak = () => {
  view.hitBase(); // heart at the exit flashes red + wave on every arrival
  if (mode === 'play') game.leak();
};
view.onKill = (e) => {
  if (mode === 'play') game.onKill(e);
};

// Change camera preset, keeping the HUD selector highlight in sync. The single
// path shared by the HUD buttons, the 1/2/3 keys, and the mobile swipe gesture.
function selectView(index: number): void {
  view.setView(index);
  overlay.setActiveView(index);
}

// Radial menu to place a tower on an empty cell (near the tap), with a live
// range preview as options are focused / on placement.
function openPlaceRadial(cellId: number, x: number, y: number): void {
  const items: RadialItem[] = TOWERS.map((d) => ({
    key: d.key,
    label: d.label,
    cost: d.cost,
    affordable: game.canAfford(d.cost ?? 0),
    color: d.color,
  }));
  view.showRange(cellId, TOWERS[0]!.range ?? 0, TOWERS[0]!.color ?? 0xffffff, 3);
  overlay.openRadial(x, y, items, {
    canAfford: (key) => game.canAfford(TOWERS.find((t) => t.key === key)?.cost ?? 0),
    onFocus: (key) => {
      const d = TOWERS.find((t) => t.key === key)!;
      view.showRange(cellId, d.range ?? 0, d.color ?? 0xffffff, 3);
    },
    onPick: (key) => {
      const d = TOWERS.find((t) => t.key === key)!;
      const cost = d.cost ?? 0;
      if (game.spend(cost)) {
        view.spawnTower(cellId, key, cost);
        view.showRange(cellId, d.range ?? 0, d.color ?? 0xffffff, 1.8);
      } else {
        overlay.setCellInfo('not enough gold');
      }
    },
  });
}

/** Buy one upgrade tier for the tower on `cellId`, if affordable. Shared by the
 * radial menu and the keyboard shortcut. Returns whether it upgraded. */
function upgradeTowerAt(cellId: number): boolean {
  const inf = view.towerInfo(cellId);
  if (!inf || inf.nextCost == null) return false;
  if (!game.spend(inf.nextCost)) {
    overlay.setCellInfo('not enough gold');
    return false;
  }
  view.upgradeTower(cellId, inf.nextCost);
  const after = view.towerInfo(cellId);
  if (after) view.showRange(cellId, after.range, after.color, 1.8);
  return true;
}

// Radial menu for an existing tower: Upgrade / Sell, with its range shown.
function openTowerRadial(cellId: number, x: number, y: number): void {
  const info = view.towerInfo(cellId);
  if (!info) return;
  selectedTower = cellId; // remember it for the W / ↑ upgrade shortcut
  view.showRange(cellId, info.range, info.color, 3);
  const items: RadialItem[] = [];
  if (info.nextCost != null) {
    items.push({ key: 'upgrade', label: 'Upgrade', cost: info.nextCost, affordable: game.canAfford(info.nextCost), color: info.color });
  } else {
    items.push({ key: 'upgrade', label: 'Max tier', affordable: false, color: info.color });
  }
  items.push({ key: 'sell', label: `Sell +◆${info.sellValue}`, color: 0xff5a4e });
  overlay.openRadial(x, y, items, {
    canAfford: (key) => {
      if (key === 'sell') return true;
      const inf = view.towerInfo(cellId);
      return !!inf && inf.nextCost != null && game.canAfford(inf.nextCost);
    },
    onPick: (key) => {
      const inf = view.towerInfo(cellId);
      if (!inf) return;
      if (key === 'upgrade') {
        upgradeTowerAt(cellId);
      } else if (key === 'sell') {
        view.sellTower(cellId);
        game.addGold(inf.sellValue);
        view.hideRange();
        selectedTower = null;
      }
    },
  });
}

function setSeedInfo(): void {
  overlay.setSeedInfo(`seed ${seed} · ${board.cells.size} cells · path ${board.path.length}`);
}

/** Place one of each tower type, spread evenly along the whole path (demo). */
function placeDemoTowers(): void {
  const placed = new Set<number>();
  const n = TOWERS.length;
  const pathLen = board.path.length;
  const freeNeighbor = (pathIdx: number): number | null => {
    const pc = board.cells.get(board.path[pathIdx]!);
    if (!pc) return null;
    for (const nb of pc.neighbors) {
      const c = board.cells.get(nb);
      if (c && c.terrain === 'buildable' && !placed.has(nb)) return nb;
    }
    return null;
  };
  for (let i = 0; i < n; i++) {
    const target = Math.floor(((i + 0.5) / n) * pathLen);
    // search outward from the evenly-spaced target for a free buildable neighbour
    for (let off = 0; off < pathLen; off++) {
      const cand = freeNeighbor(Math.min(pathLen - 1, target + off)) ?? freeNeighbor(Math.max(0, target - off));
      if (cand != null) {
        view.spawnTower(cand, TOWERS[i]!.key);
        placed.add(cand);
        break;
      }
    }
  }
}

function demoTick(dt: number): void {
  demoTimer -= dt;
  if (demoTimer <= 0) {
    const key = ENEMIES[(Math.random() * ENEMIES.length) | 0]!.key;
    view.spawnEnemy(key);
    demoTimer = 0.6 + Math.random() * 0.7;
  }
}

/** Attract mode: autoplay a demo (one of each tower + random enemies) + title. */
function startAttract(): void {
  mode = 'attract';
  overlay.closePalette();
  overlay.hideResult();
  board = generateBoard(seed, { targetCells: boardSize });
  view.setBoard(board);
  view.highlightCell(null);
  setSeedInfo();
  overlay.setCellInfo('Attract demo — press PLAY to start.');
  placeDemoTowers();
  demoTimer = 0.3;
  overlay.showTitle();
}

/** PLAY: clear the demo units and start the real game on the current board. */
function startPlay(): void {
  mode = 'play';
  overlay.hideTitle();
  view.clearUnits();
  overlay.setCellInfo('Place towers on buildable platforms before the wave hits.');
  game.reset();
}

function newPlayBoard(): void {
  mode = 'play';
  overlay.closePalette();
  overlay.hideResult();
  overlay.hideTitle();
  board = generateBoard(seed, { targetCells: boardSize });
  view.setBoard(board);
  view.highlightCell(null);
  setSeedInfo();
  overlay.setCellInfo('Place towers on buildable platforms before the wave hits.');
  game.reset();
}

startAttract();
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
  const dx = e.clientX - downX;
  const dy = e.clientY - downY;
  const heldMs = performance.now() - downT;
  // Horizontal swipe cycles camera views (any mode). Reuses the drag gesture
  // that otherwise just cancels a tap; must be deliberate and mostly flat so it
  // doesn't fire on a sloppy tap. Swipe left → next preset, right → previous.
  if (heldMs < 700 && Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
    const dir = dx < 0 ? 1 : -1;
    selectView((view.currentView + dir + view.viewCount) % view.viewCount);
    return;
  }
  if (Math.hypot(dx, dy) > 12 || heldMs > 600) return;
  if (mode !== 'play') return; // no placement during the attract demo
  const hit = view.pick(e.clientX, e.clientY);
  view.highlightCell(hit?.cell ?? null);
  if (!hit) {
    overlay.setCellInfo('— no cell there —');
    overlay.closeRadial();
    selectedTower = null;
    return;
  }
  const c = hit.cell;
  if (c.terrain === 'buildable') {
    if (view.hasTower(c.id)) openTowerRadial(c.id, e.clientX, e.clientY);
    else {
      selectedTower = null;
      openPlaceRadial(c.id, e.clientX, e.clientY);
    }
  } else {
    overlay.setCellInfo(`cell #${c.id} · ${c.terrain}`);
    overlay.closeRadial();
    selectedTower = null;
  }
});

// Camera presets: number keys 1 / 2 / 3 switch cinematic views (any mode).
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; // don't hijack the slider
  const n = e.key === '1' ? 0 : e.key === '2' ? 1 : e.key === '3' ? 2 : -1;
  if (n < 0 || n >= view.viewCount) return;
  e.preventDefault();
  selectView(n);
});

// PC quick-upgrade: with a tower selected (tapped), W or ↑ buys the next tier.
window.addEventListener('keydown', (e) => {
  if (mode !== 'play') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; // don't hijack the size slider
  if (e.key !== 'w' && e.key !== 'W' && e.key !== 'ArrowUp') return;
  if (selectedTower == null || !view.hasTower(selectedTower)) return;
  e.preventDefault();
  upgradeTowerAt(selectedTower);
});

// --- dev/test hook: drive spawns from the console or a smoke test ---------
(window as unknown as { __hk?: unknown }).__hk = {
  view,
  game,
  overlay,
  hurt: () => {
    game.leak();
    view.hitBase();
  },
  openPath: (i = 0) => view.openPath(i),
  altPathCount: () => board.altPaths.length,
  get board() {
    return board;
  },
  spawnEnemy: (k: string) => view.spawnEnemy(k),
  firstBuildableScreen: () => {
    const cell = [...board.cells.values()].find((c) => c.terrain === 'buildable');
    return cell ? view.cellScreenPos(cell.id) : null;
  },
  highlightFirstBuildable: () => {
    const cell = [...board.cells.values()].find((c) => c.terrain === 'buildable');
    view.highlightCell(cell ?? null);
    return cell ? cell.id : null;
  },
  // line the path with towers (one buildable neighbour per path cell)
  spawnGauntlet: () => {
    const keys = TOWERS.map((t) => t.key);
    const placed = new Set<number>();
    let n = 0;
    for (const pid of board.path) {
      const pc = board.cells.get(pid);
      if (!pc) continue;
      for (const nb of pc.neighbors) {
        const c = board.cells.get(nb);
        if (c && c.terrain === 'buildable' && !placed.has(nb)) {
          view.spawnTower(nb, keys[n % keys.length]!);
          placed.add(nb);
          n++;
          break;
        }
      }
    }
    return n;
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
    // reload once when a NEW build's SW takes control (cache-bust applied),
    // but not on the very first install (no prior controller).
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}
