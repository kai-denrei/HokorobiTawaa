import './ui/styles.css';
import { BoardView } from './render/scene';
import { createOverlay, type PaletteItem } from './ui/overlay';
import { generateBoard, type Board } from './board';
import { TOWERS, ENEMIES } from './units/roster';
import { Game } from './game/game';

const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;
const app = document.getElementById('app') as HTMLElement;

const view = new BoardView(canvas);
let seed = (Math.random() * 0x7fffffff) | 0;
let board: Board;

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
  onPlay: () => startPlay(),
});

const game = new Game(view, {
  onHud: (d) => overlay.setHud(d),
  onResult: (status) => overlay.showResult(status === 'won'),
});

view.onTick = (dt) => {
  if (mode === 'attract') demoTick(dt);
  else game.tick(dt);
};
view.onLeak = () => {
  if (mode === 'play') {
    game.leak();
    overlay.hitHeart(); // heart flashes red + wave on every life lost
  }
};
view.onKill = (e) => {
  if (mode === 'play') game.onKill(e);
};

function toBuyItems(): PaletteItem[] {
  return TOWERS.map((d) => ({
    key: d.key,
    label: d.label,
    role: d.role,
    cost: d.cost,
    affordable: game.canAfford(d.cost ?? 0),
  }));
}

function openBuy(cellId: number): void {
  overlay.openPalette(`Place tower · ◆${game.goldNow}`, toBuyItems(), (key) => {
    const def = TOWERS.find((t) => t.key === key)!;
    const cost = def.cost ?? 0;
    if (game.spend(cost)) {
      view.spawnTower(cellId, key, cost);
      overlay.setCellInfo(`placed ${def.label}`);
    } else {
      overlay.setCellInfo('not enough gold');
    }
  });
}

function openTowerMenuFor(cellId: number): void {
  const info = view.towerInfo(cellId);
  if (!info) return;
  overlay.openTowerMenu(
    {
      label: info.label,
      tier: info.tier,
      nextCost: info.nextCost,
      sellValue: info.sellValue,
      canAffordUpgrade: info.nextCost != null && game.canAfford(info.nextCost),
    },
    {
      onUpgrade: () => {
        const inf = view.towerInfo(cellId);
        if (inf && inf.nextCost != null && game.spend(inf.nextCost)) {
          view.upgradeTower(cellId, inf.nextCost);
          openTowerMenuFor(cellId); // refresh with new tier/costs
        }
      },
      onSell: () => {
        const inf = view.towerInfo(cellId);
        view.sellTower(cellId);
        game.addGold(inf ? inf.sellValue : 0);
        overlay.setCellInfo('tower sold');
      },
    },
  );
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
  board = generateBoard(seed, { targetCells: 130 });
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
  board = generateBoard(seed, { targetCells: 130 });
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
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved > 12 || performance.now() - downT > 600) return;
  if (mode !== 'play') return; // no placement during the attract demo
  const hit = view.pick(e.clientX, e.clientY);
  view.highlightCell(hit?.cell ?? null);
  if (!hit) {
    overlay.setCellInfo('— no cell there —');
    overlay.closePalette();
    return;
  }
  const c = hit.cell;
  if (c.terrain === 'buildable') {
    if (view.hasTower(c.id)) openTowerMenuFor(c.id);
    else openBuy(c.id);
  } else {
    overlay.setCellInfo(`cell #${c.id} · ${c.terrain}`);
    overlay.closePalette();
  }
});

// --- dev/test hook: drive spawns from the console or a smoke test ---------
(window as unknown as { __hk?: unknown }).__hk = {
  view,
  game,
  overlay,
  hurt: () => {
    game.leak();
    overlay.hitHeart();
  },
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
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}
