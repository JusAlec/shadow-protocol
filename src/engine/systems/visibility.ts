// ============================================================
// Shadow Protocol - Fog of War / Visibility System
// ============================================================
import { Position, TileData, Unit, VisibilityMap, VisibilityState } from '@/engine/types';
import { getEuclideanDistance } from '@/engine/systems/combat';

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

// Bresenham line-of-sight check
export function hasLineOfSight(
  from: Position,
  to: Position,
  grid: TileData[][]
): boolean {
  let x0 = from.x, y0 = from.y;
  const x1 = to.x, y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    // Don't check the start or end tile for blocking
    if (!(x0 === from.x && y0 === from.y) && !(x0 === to.x && y0 === to.y)) {
      const tile = grid[y0]?.[x0];
      if (tile && tile.blocksVision) return false;
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return true;
}

// Calculate visibility for a single unit
export function calculateUnitVisibility(
  unit: Unit,
  grid: TileData[][],
  mapWidth: number,
  mapHeight: number
): VisibilityMap {
  const vis: VisibilityMap = {};
  const visionRange = unit.stats.vision;
  const unitTile = grid[unit.position.y]?.[unit.position.x];
  const elevationBonus = unitTile?.elevation || 0;
  const effectiveRange = visionRange + elevationBonus;

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const dist = getEuclideanDistance(unit.position, { x, y });
      if (dist <= effectiveRange && hasLineOfSight(unit.position, { x, y }, grid)) {
        vis[posKey(x, y)] = 'visible';
      }
    }
  }

  return vis;
}

// Combine visibility from all squad members
export function calculateSquadVisibility(
  units: Unit[],
  grid: TileData[][],
  mapWidth: number,
  mapHeight: number,
  previousSquadVis?: VisibilityMap
): { unitVisibility: Record<string, VisibilityMap>; squadVisibility: VisibilityMap } {
  const unitVisibility: Record<string, VisibilityMap> = {};
  const squadVis: VisibilityMap = {};

  // Initialize all tiles as hidden
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      squadVis[posKey(x, y)] = 'hidden';
    }
  }

  // Calculate each unit's vision
  const alivePlayerUnits = units.filter(u => u.faction === 'player' && u.alive);
  for (const unit of alivePlayerUnits) {
    const uVis = calculateUnitVisibility(unit, grid, mapWidth, mapHeight);
    unitVisibility[unit.id] = uVis;

    for (const [key, state] of Object.entries(uVis)) {
      if (state === 'visible') {
        squadVis[key] = 'visible';
      }
    }
  }

  // Mark previously visible tiles as 'detected' if no longer visible
  if (previousSquadVis) {
    for (const [key, prevState] of Object.entries(previousSquadVis)) {
      if (prevState === 'visible' && squadVis[key] === 'hidden') {
        squadVis[key] = 'detected';
      } else if (prevState === 'detected' && squadVis[key] === 'hidden') {
        squadVis[key] = 'detected'; // maintain detected state
      }
    }
  }

  return { unitVisibility, squadVisibility: squadVis };
}

// Check if a specific unit is visible to the player squad
export function isUnitVisible(
  target: Unit,
  squadVisibility: VisibilityMap
): boolean {
  const key = posKey(target.position.x, target.position.y);
  return squadVisibility[key] === 'visible';
}

export function getVisibilityState(
  pos: Position,
  squadVisibility: VisibilityMap
): VisibilityState {
  return squadVisibility[posKey(pos.x, pos.y)] || 'hidden';
}
