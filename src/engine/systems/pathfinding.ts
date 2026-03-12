// ============================================================
// Shadow Protocol - A* Pathfinding
// ============================================================
import { Position, TileData } from '@/engine/types';

interface PathNode {
  pos: Position;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

export function findPath(
  start: Position,
  end: Position,
  grid: TileData[][],
  maxDistance?: number,
  allowOccupiedDest: boolean = false
): Position[] | null {
  const endTile = grid[end.y]?.[end.x];
  if (!endTile || endTile.blocksMovement) return null;
  // Block pathing to occupied destination unless explicitly allowed
  if (endTile.occupied && !allowOccupiedDest) return null;

  const open: PathNode[] = [];
  const closed = new Set<string>();

  const startNode: PathNode = {
    pos: start,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  };
  open.push(startNode);

  while (open.length > 0) {
    // Get node with lowest f
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const key = posKey(current.pos);

    if (current.pos.x === end.x && current.pos.y === end.y) {
      // Reconstruct path
      const path: Position[] = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift(node.pos);
        node = node.parent;
      }
      return path;
    }

    closed.add(key);

    // Check neighbors (4-directional)
    const neighbors: Position[] = [
      { x: current.pos.x - 1, y: current.pos.y },
      { x: current.pos.x + 1, y: current.pos.y },
      { x: current.pos.x, y: current.pos.y - 1 },
      { x: current.pos.x, y: current.pos.y + 1 },
    ];

    for (const nPos of neighbors) {
      const nKey = posKey(nPos);
      if (closed.has(nKey)) continue;

      const tile = grid[nPos.y]?.[nPos.x];
      if (!tile || tile.blocksMovement) continue;
      if (tile.occupied && !(allowOccupiedDest && nPos.x === end.x && nPos.y === end.y)) continue;

      const g = current.g + 1;
      if (maxDistance !== undefined && g > maxDistance) continue;

      const existingIdx = open.findIndex(n => posKey(n.pos) === nKey);
      if (existingIdx >= 0 && open[existingIdx].g <= g) continue;

      const h = heuristic(nPos, end);
      const node: PathNode = { pos: nPos, g, h, f: g + h, parent: current };

      if (existingIdx >= 0) {
        open[existingIdx] = node;
      } else {
        open.push(node);
      }
    }
  }

  return null; // No path found
}

// Get all reachable tiles within movement range
export function getReachableTiles(
  start: Position,
  movement: number,
  grid: TileData[][]
): Position[] {
  const reachable: Position[] = [];
  const visited = new Set<string>();
  const queue: { pos: Position; dist: number }[] = [{ pos: start, dist: 0 }];
  visited.add(posKey(start));

  while (queue.length > 0) {
    const { pos, dist } = queue.shift()!;
    if (dist > 0) reachable.push(pos);

    if (dist >= movement) continue;

    const neighbors: Position[] = [
      { x: pos.x - 1, y: pos.y },
      { x: pos.x + 1, y: pos.y },
      { x: pos.x, y: pos.y - 1 },
      { x: pos.x, y: pos.y + 1 },
    ];

    for (const n of neighbors) {
      const nKey = posKey(n);
      if (visited.has(nKey)) continue;
      const tile = grid[n.y]?.[n.x];
      if (!tile || tile.blocksMovement || tile.occupied) continue;
      visited.add(nKey);
      queue.push({ pos: n, dist: dist + 1 });
    }
  }

  return reachable;
}

// Get tiles in attack range (line of sight checked separately)
export function getTilesInRange(
  center: Position,
  range: number,
  grid: TileData[][]
): Position[] {
  const tiles: Position[] = [];
  const h = grid.length;
  const w = grid[0]?.length || 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.abs(x - center.x) + Math.abs(y - center.y);
      if (dist > 0 && dist <= range) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}
