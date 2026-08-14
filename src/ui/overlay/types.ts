// types.ts — shared public types for the overlay and its sub-components.

export type Tab = 'log' | 'rules' | 'towers' | 'enemies' | 'setup';

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
