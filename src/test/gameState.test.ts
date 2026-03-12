import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, Position, TileData, Unit, FacingDirection } from '@/engine/types';
import { getReachableTiles, findPath } from '@/engine/systems/pathfinding';
import { createOperative, createEnemy } from '@/engine/data/operatives';

// Helper: create a simple open grid
function makeGrid(w: number, h: number): TileData[][] {
  const grid: TileData[][] = [];
  for (let y = 0; y < h; y++) {
    const row: TileData[] = [];
    for (let x = 0; x < w; x++) {
      row.push({
        type: 'floor',
        position: { x, y },
        blocksMovement: false,
        blocksVision: false,
        coverValue: 'none',
        coverDirections: [],
        elevation: 0,
        destructible: false,
        health: 0,
        maxHealth: 0,
        occupied: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

describe('AP = Movement Tiles System', () => {
  let grid: TileData[][];

  beforeEach(() => {
    grid = makeGrid(10, 10);
  });

  describe('operatives maxActionPoints match stats.movement', () => {
    it('Specter: maxAP=3, movement=3', () => {
      const unit = createOperative('s1', 'specter');
      expect(unit.maxActionPoints).toBe(3);
      expect(unit.stats.movement).toBe(3);
    });

    it('Bulldog: maxAP=3, movement=3', () => {
      const unit = createOperative('b1', 'bulldog');
      expect(unit.maxActionPoints).toBe(3);
      expect(unit.stats.movement).toBe(3);
    });

    it('Circuit: maxAP=3, movement=3', () => {
      const unit = createOperative('c1', 'circuit');
      expect(unit.maxActionPoints).toBe(3);
      expect(unit.stats.movement).toBe(3);
    });

    it('Phantom: maxAP=3, movement=3', () => {
      const unit = createOperative('p1', 'phantom');
      expect(unit.maxActionPoints).toBe(3);
      expect(unit.stats.movement).toBe(3);
    });

    it('Grunt: maxAP=3, movement=3', () => {
      const unit = createEnemy('g1', 'grunt');
      expect(unit.maxActionPoints).toBe(3);
      expect(unit.stats.movement).toBe(3);
    });

    it('Heavy Trooper: maxAP=3, movement=3', () => {
      const unit = createEnemy('h1', 'heavy_trooper');
      expect(unit.maxActionPoints).toBe(3);
      expect(unit.stats.movement).toBe(3);
    });

    it('Commander: maxAP=3, movement=3', () => {
      const unit = createEnemy('c1', 'commander');
      expect(unit.maxActionPoints).toBe(3);
      expect(unit.stats.movement).toBe(3);
    });
  });

  describe('getReachableTiles with actionPoints', () => {
    it('returns tiles within AP range', () => {
      const ap = 3;
      const start: Position = { x: 5, y: 5 };
      const reachable = getReachableTiles(start, ap, grid);

      // All returned tiles should be within Manhattan distance <= 3
      for (const pos of reachable) {
        const dist = Math.abs(pos.x - start.x) + Math.abs(pos.y - start.y);
        expect(dist).toBeLessThanOrEqual(ap);
        expect(dist).toBeGreaterThan(0);
      }
    });

    it('range equals actionPoints value', () => {
      const start: Position = { x: 5, y: 5 };
      // With AP=2 on open grid, max distance should be 2
      const reachable = getReachableTiles(start, 2, grid);
      const maxDist = Math.max(...reachable.map(p => Math.abs(p.x - start.x) + Math.abs(p.y - start.y)));
      expect(maxDist).toBe(2);
    });
  });

  describe('findPath respects AP budget', () => {
    it('finds a path within AP budget', () => {
      const path = findPath({ x: 0, y: 0 }, { x: 3, y: 0 }, grid, 4);
      expect(path).not.toBeNull();
      expect(path!.length - 1).toBe(3); // 3 tiles traversed
    });

    it('returns null when destination exceeds AP budget', () => {
      const path = findPath({ x: 0, y: 0 }, { x: 5, y: 0 }, grid, 3);
      expect(path).toBeNull();
    });
  });

  describe('Unit facing defaults', () => {
    it('all units default to south facing', () => {
      const specter = createOperative('s1', 'specter');
      const grunt = createEnemy('g1', 'grunt');
      expect(specter.facing).toBe('south');
      expect(grunt.facing).toBe('south');
    });
  });

  describe('Unit templateId', () => {
    it('player operatives have correct templateId', () => {
      expect(createOperative('s1', 'specter').templateId).toBe('specter');
      expect(createOperative('b1', 'bulldog').templateId).toBe('bulldog');
    });

    it('enemies have correct templateId', () => {
      expect(createEnemy('g1', 'grunt').templateId).toBe('grunt');
      expect(createEnemy('h1', 'heavy_trooper').templateId).toBe('heavy_trooper');
      expect(createEnemy('c1', 'commander').templateId).toBe('commander');
    });
  });
});
