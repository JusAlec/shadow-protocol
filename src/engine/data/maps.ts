import { TileData, TileType, CoverDirection, Position, DestructionEvent } from '@/engine/types';

interface TileTemplate {
  type: TileType;
  blocksMovement: boolean;
  blocksVision: boolean;
  coverValue: 'none' | 'half' | 'full' | 'wall';
  elevation: number;
  destructible: boolean;
  health: number;
  onDestroy?: DestructionEvent;
  hazardEffect?: TileData['hazardEffect'];
  hazardDamage?: number;
}

const TILE_TEMPLATES: Record<string, TileTemplate> = {
  '.': { type: 'floor', blocksMovement: false, blocksVision: false, coverValue: 'none', elevation: 0, destructible: false, health: 0 },
  'H': { type: 'half_cover', blocksMovement: false, blocksVision: false, coverValue: 'half', elevation: 0, destructible: false, health: 0 },
  'F': { type: 'full_cover', blocksMovement: false, blocksVision: true, coverValue: 'full', elevation: 0, destructible: false, health: 0 },
  'W': { type: 'wall', blocksMovement: true, blocksVision: true, coverValue: 'wall', elevation: 0, destructible: false, health: 0 },
  'E': { type: 'elevated', blocksMovement: false, blocksVision: false, coverValue: 'none', elevation: 1, destructible: false, health: 0 },
  'C': { type: 'destructible_crate', blocksMovement: false, blocksVision: false, coverValue: 'half', elevation: 0, destructible: true, health: 40 },
  'B': { type: 'destructible_barrier', blocksMovement: false, blocksVision: false, coverValue: 'full', elevation: 0, destructible: true, health: 60 },
  'V': { type: 'destructible_vehicle', blocksMovement: true, blocksVision: true, coverValue: 'full', elevation: 0, destructible: true, health: 100, onDestroy: 'explode' },
  'X': { type: 'explosive_barrel', blocksMovement: false, blocksVision: false, coverValue: 'half', elevation: 0, destructible: true, health: 20, onDestroy: 'explode' },
  'G': { type: 'gas_canister', blocksMovement: false, blocksVision: false, coverValue: 'none', elevation: 0, destructible: true, health: 15, onDestroy: 'spawn_poison_cloud' },
  'e': { type: 'hazard_electric', blocksMovement: false, blocksVision: false, coverValue: 'none', elevation: 0, destructible: false, health: 0, hazardEffect: 'shock', hazardDamage: 15 },
  'f': { type: 'hazard_fire', blocksMovement: false, blocksVision: false, coverValue: 'none', elevation: 0, destructible: false, health: 0, hazardEffect: 'burn', hazardDamage: 10 },
  'p': { type: 'hazard_poison', blocksMovement: false, blocksVision: false, coverValue: 'none', elevation: 0, destructible: false, health: 0, hazardEffect: 'poison', hazardDamage: 8 },
};

// Demo map: 12x12 tactical engagement area
// Legend: . floor, H half cover, F full cover, W wall, E elevated,
//         C crate, B barrier, V vehicle, X barrel, G gas canister
const DEMO_MAP_LAYOUT = [
  'W W . . E E . . . . W W',
  'W . . H . . . . C . . W',
  '. . C . . . . G . . . .',
  '. H . . F . . . . H . .',
  '. . . . . . X . . . . .',
  'E . . B . . . . B . . E',
  'E . . B . . . . B . . E',
  '. . . . . X . . . . . .',
  '. H . . . . . F . . H .',
  '. . . . G . . . . C . .',
  'W . . C . . . . H . . W',
  'W W . . . . E E . . W W',
];

function inferCoverDirections(grid: string[][], x: number, y: number): CoverDirection[] {
  const dirs: CoverDirection[] = [];
  const cell = grid[y]?.[x];
  if (!cell) return dirs;
  const tmpl = TILE_TEMPLATES[cell];
  if (!tmpl || tmpl.coverValue === 'none') return dirs;

  // Provide cover in all adjacent floor directions
  if (y > 0 && !TILE_TEMPLATES[grid[y - 1][x]]?.blocksMovement) dirs.push('south'); // cover from south side
  if (y < grid.length - 1 && !TILE_TEMPLATES[grid[y + 1][x]]?.blocksMovement) dirs.push('north');
  if (x > 0 && !TILE_TEMPLATES[grid[y][x - 1]]?.blocksMovement) dirs.push('east');
  if (x < grid[0].length - 1 && !TILE_TEMPLATES[grid[y][x + 1]]?.blocksMovement) dirs.push('west');
  return dirs;
}

export function generateDemoMap(): TileData[][] {
  const rawGrid = DEMO_MAP_LAYOUT.map(row => row.split(' '));
  const grid: TileData[][] = [];

  for (let y = 0; y < 12; y++) {
    const row: TileData[] = [];
    for (let x = 0; x < 12; x++) {
      const char = rawGrid[y]?.[x] || '.';
      const tmpl = TILE_TEMPLATES[char] || TILE_TEMPLATES['.'];
      row.push({
        type: tmpl.type,
        position: { x, y },
        blocksMovement: tmpl.blocksMovement,
        blocksVision: tmpl.blocksVision,
        coverValue: tmpl.coverValue,
        coverDirections: inferCoverDirections(rawGrid, x, y),
        elevation: tmpl.elevation,
        destructible: tmpl.destructible,
        health: tmpl.health,
        maxHealth: tmpl.health,
        onDestroy: tmpl.onDestroy,
        hazardEffect: tmpl.hazardEffect,
        hazardDamage: tmpl.hazardDamage,
        occupied: false,
      });
    }
    grid.push(row);
  }

  return grid;
}

export interface SpawnConfig {
  playerSpawns: Position[];
  enemySpawns: Position[];
}

export function getDemoSpawns(): SpawnConfig {
  return {
    playerSpawns: [
      { x: 2, y: 10 },
      { x: 3, y: 11 },
      { x: 4, y: 10 },
      { x: 3, y: 9 },
    ],
    enemySpawns: [
      { x: 7, y: 0 },
      { x: 8, y: 1 },
      { x: 9, y: 0 },
      { x: 8, y: 2 },
      { x: 7, y: 1 },
    ],
  };
}
