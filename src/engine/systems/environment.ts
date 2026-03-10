// ============================================================
// Shadow Protocol - Environment & Destruction System
// ============================================================
import { TileData, Position, Unit, DestructionEvent } from '@/engine/types';
import { eventBus } from '@/engine/events';
import { applyDamage } from '@/engine/systems/combat';

export function damageTile(
  grid: TileData[][],
  pos: Position,
  damage: number,
  units: Unit[]
): TileData[][] {
  const tile = grid[pos.y]?.[pos.x];
  if (!tile || !tile.destructible) return grid;

  const newGrid = grid.map(row => row.map(t => ({ ...t })));
  const target = newGrid[pos.y][pos.x];
  target.health = Math.max(0, target.health - damage);

  if (target.health <= 0) {
    return destroyTile(newGrid, pos, units);
  }

  return newGrid;
}

export function destroyTile(
  grid: TileData[][],
  pos: Position,
  units: Unit[]
): TileData[][] {
  const tile = grid[pos.y][pos.x];
  const destroyEvent = tile.onDestroy;

  // Convert to floor
  grid[pos.y][pos.x] = {
    ...tile,
    type: 'floor',
    blocksMovement: false,
    blocksVision: false,
    coverValue: 'none',
    coverDirections: [],
    destructible: false,
    health: 0,
    maxHealth: 0,
    onDestroy: undefined,
  };

  eventBus.emit('tile_destroyed', { position: pos, previousType: tile.type });
  eventBus.emit('cover_destroyed', { position: pos });

  if (destroyEvent) {
    applyDestructionEvent(grid, pos, destroyEvent, units);
  }

  return grid;
}

function applyDestructionEvent(
  grid: TileData[][],
  pos: Position,
  event: DestructionEvent,
  units: Unit[]
): void {
  const radius = event === 'explode' ? 2 : 1;
  const neighbors = getPositionsInRadius(pos, radius, grid.length, grid[0].length);

  switch (event) {
    case 'explode': {
      // Deal 30 damage to all units in radius
      for (const unit of units) {
        if (neighbors.some(n => n.x === unit.position.x && n.y === unit.position.y)) {
          applyDamage(unit, 30);
          eventBus.emit('unit_damaged', {
            unitId: unit.id,
            damage: 30,
            source: 'explosion',
            remainingHealth: unit.stats.health,
          });
        }
      }
      // Destroy destructible tiles in radius
      for (const n of neighbors) {
        const t = grid[n.y]?.[n.x];
        if (t?.destructible) {
          destroyTile(grid, n, units);
        }
      }
      eventBus.emit('hazard_triggered', { position: pos, type: 'explosion', radius });
      break;
    }
    case 'spawn_poison_cloud': {
      for (const n of neighbors) {
        if (grid[n.y]?.[n.x]) {
          grid[n.y][n.x].hazardEffect = 'poison';
          grid[n.y][n.x].hazardDamage = 8;
          grid[n.y][n.x].type = 'hazard_poison';
        }
      }
      eventBus.emit('hazard_triggered', { position: pos, type: 'poison_cloud', radius });
      break;
    }
    case 'spawn_fire': {
      for (const n of neighbors) {
        if (grid[n.y]?.[n.x]) {
          grid[n.y][n.x].hazardEffect = 'burn';
          grid[n.y][n.x].hazardDamage = 10;
          grid[n.y][n.x].type = 'hazard_fire';
        }
      }
      break;
    }
    case 'spawn_electric_field': {
      for (const n of neighbors) {
        if (grid[n.y]?.[n.x]) {
          grid[n.y][n.x].hazardEffect = 'shock';
          grid[n.y][n.x].hazardDamage = 15;
          grid[n.y][n.x].type = 'hazard_electric';
        }
      }
      break;
    }
    case 'collapse':
      // Just destroys tile, already handled
      break;
  }
}

function getPositionsInRadius(
  center: Position,
  radius: number,
  mapH: number,
  mapW: number
): Position[] {
  const positions: Position[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (x >= 0 && x < mapW && y >= 0 && y < mapH) {
        if (Math.abs(dx) + Math.abs(dy) <= radius) {
          positions.push({ x, y });
        }
      }
    }
  }
  return positions;
}

// Apply hazard damage when unit steps on or starts turn on hazard tile
export function checkHazardDamage(unit: Unit, grid: TileData[][]): number {
  const tile = grid[unit.position.y]?.[unit.position.x];
  if (!tile?.hazardEffect || !tile.hazardDamage) return 0;

  applyDamage(unit, tile.hazardDamage);
  eventBus.emit('hazard_triggered', {
    unitId: unit.id,
    position: unit.position,
    type: tile.hazardEffect,
    damage: tile.hazardDamage,
  });
  return tile.hazardDamage;
}
