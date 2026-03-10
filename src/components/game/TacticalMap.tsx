// ============================================================
// Shadow Protocol - SVG Tactical Map Renderer
// ============================================================
import React, { useMemo, useCallback } from 'react';
import { GameState, Position, TileData, Unit, VisibilityState } from '../../engine/types';
import { calculateHitChance, getDistance } from '../../engine/systems/combat';
import { hasLineOfSight } from '../../engine/systems/visibility';
import { WEAPONS } from '../../engine/data/weapons';

interface TacticalMapProps {
  gameState: GameState;
  onTileClick: (pos: Position) => void;
  onTileHover: (pos: Position | null) => void;
}

const TILE_SIZE = 56;
const GAP = 1;
const CELL = TILE_SIZE + GAP;

const TILE_COLORS: Record<string, string> = {
  floor: 'hsl(220 15% 18%)',
  half_cover: 'hsl(35 40% 35%)',
  full_cover: 'hsl(25 35% 28%)',
  wall: 'hsl(220 10% 12%)',
  elevated: 'hsl(220 20% 25%)',
  destructible_crate: 'hsl(30 50% 30%)',
  destructible_barrier: 'hsl(20 30% 25%)',
  destructible_vehicle: 'hsl(200 15% 22%)',
  explosive_barrel: 'hsl(0 60% 35%)',
  gas_canister: 'hsl(120 40% 25%)',
  hazard_electric: 'hsl(200 80% 45%)',
  hazard_fire: 'hsl(15 80% 40%)',
  hazard_poison: 'hsl(100 50% 30%)',
};

const TILE_ICONS: Record<string, string> = {
  half_cover: '▧',
  full_cover: '█',
  wall: '▓',
  elevated: '△',
  destructible_crate: '□',
  destructible_barrier: '▥',
  destructible_vehicle: '🚗',
  explosive_barrel: '◉',
  gas_canister: '☢',
  hazard_electric: '⚡',
  hazard_fire: '🔥',
  hazard_poison: '☠',
};

const UNIT_COLORS: Record<string, string> = {
  sniper: 'hsl(210 80% 55%)',
  assault: 'hsl(30 80% 55%)',
  engineer: 'hsl(50 80% 50%)',
  infiltrator: 'hsl(280 60% 55%)',
  heavy: 'hsl(0 70% 50%)',
  medic: 'hsl(140 60% 45%)',
};

const TacticalMap: React.FC<TacticalMapProps> = ({ gameState, onTileClick, onTileHover }) => {
  const { grid, units, squadVisibility, movementRange, attackRange, activeUnitId, selectedAction, hoveredTile } = gameState;
  const mapW = CELL * 12 + GAP;
  const mapH = CELL * 12 + GAP;

  const activeUnit = units.find(u => u.id === activeUnitId);

  // Hit chance for hovered enemy
  const hoveredHitChance = useMemo(() => {
    if (!hoveredTile || !activeUnit || selectedAction !== 'shoot') return null;
    const tile = grid[hoveredTile.y]?.[hoveredTile.x];
    if (!tile?.occupantId) return null;
    const target = units.find(u => u.id === tile.occupantId && u.alive && u.faction === 'enemy');
    if (!target) return null;
    return calculateHitChance(activeUnit, target, grid);
  }, [hoveredTile, activeUnit, selectedAction, grid, units]);

  const getVisibility = useCallback((x: number, y: number): VisibilityState => {
    return squadVisibility[`${x},${y}`] || 'hidden';
  }, [squadVisibility]);

  const isInMovementRange = useCallback((x: number, y: number): boolean => {
    return movementRange.some(p => p.x === x && p.y === y);
  }, [movementRange]);

  const isInAttackRange = useCallback((x: number, y: number): boolean => {
    return attackRange.some(p => p.x === x && p.y === y);
  }, [attackRange]);

  return (
    <div className="relative overflow-auto rounded-lg border border-border/30 bg-[hsl(220,15%,8%)]">
      <svg
        width={mapW}
        height={mapH}
        viewBox={`0 0 ${mapW} ${mapH}`}
        className="block"
      >
        <defs>
          {/* Fog of war filter */}
          <filter id="fog-hidden">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="linear" slope="0.2" />
              <feFuncG type="linear" slope="0.2" />
              <feFuncB type="linear" slope="0.2" />
            </feComponentTransfer>
          </filter>
          <filter id="fog-detected">
            <feColorMatrix type="saturate" values="0.3" />
            <feComponentTransfer>
              <feFuncR type="linear" slope="0.5" />
              <feFuncG type="linear" slope="0.5" />
              <feFuncB type="linear" slope="0.5" />
            </feComponentTransfer>
          </filter>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid tiles */}
        {grid.map((row, y) =>
          row.map((tile, x) => {
            const vis = getVisibility(x, y);
            const inMoveRange = isInMovementRange(x, y);
            const inAtkRange = isInAttackRange(x, y);
            const isHovered = hoveredTile?.x === x && hoveredTile?.y === y;
            const isActive = activeUnit?.position.x === x && activeUnit?.position.y === y;

            return (
              <g
                key={`${x}-${y}`}
                onClick={() => onTileClick({ x, y })}
                onMouseEnter={() => onTileHover({ x, y })}
                onMouseLeave={() => onTileHover(null)}
                className="cursor-pointer"
                filter={vis === 'hidden' ? 'url(#fog-hidden)' : vis === 'detected' ? 'url(#fog-detected)' : undefined}
              >
                {/* Base tile */}
                <rect
                  x={x * CELL + GAP}
                  y={y * CELL + GAP}
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  rx={3}
                  fill={TILE_COLORS[tile.type] || TILE_COLORS.floor}
                  stroke={
                    isActive ? 'hsl(45 100% 60%)' :
                    isHovered ? 'hsl(210 60% 60%)' :
                    inMoveRange ? 'hsl(120 70% 45%)' :
                    inAtkRange ? 'hsl(0 70% 50%)' :
                    'hsl(220 10% 15%)'
                  }
                  strokeWidth={isActive ? 2.5 : isHovered || inMoveRange || inAtkRange ? 1.5 : 0.5}
                  opacity={vis === 'hidden' ? 0.3 : 1}
                />

                {/* Movement range overlay */}
                {inMoveRange && (
                  <rect
                    x={x * CELL + GAP}
                    y={y * CELL + GAP}
                    width={TILE_SIZE}
                    height={TILE_SIZE}
                    rx={3}
                    fill="hsl(120 70% 45%)"
                    opacity={0.15}
                  />
                )}

                {/* Attack range overlay */}
                {inAtkRange && (
                  <rect
                    x={x * CELL + GAP}
                    y={y * CELL + GAP}
                    width={TILE_SIZE}
                    height={TILE_SIZE}
                    rx={3}
                    fill="hsl(0 70% 50%)"
                    opacity={0.12}
                  />
                )}

                {/* Tile icon */}
                {TILE_ICONS[tile.type] && vis !== 'hidden' && (
                  <text
                    x={x * CELL + GAP + TILE_SIZE / 2}
                    y={y * CELL + GAP + TILE_SIZE - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill="hsl(0 0% 60%)"
                    pointerEvents="none"
                  >
                    {TILE_ICONS[tile.type]}
                  </text>
                )}

                {/* Health bar for destructible tiles */}
                {tile.destructible && tile.health < tile.maxHealth && vis === 'visible' && (
                  <>
                    <rect
                      x={x * CELL + GAP + 4}
                      y={y * CELL + GAP + TILE_SIZE - 6}
                      width={TILE_SIZE - 8}
                      height={3}
                      fill="hsl(0 0% 20%)"
                      rx={1}
                    />
                    <rect
                      x={x * CELL + GAP + 4}
                      y={y * CELL + GAP + TILE_SIZE - 6}
                      width={(TILE_SIZE - 8) * (tile.health / tile.maxHealth)}
                      height={3}
                      fill="hsl(30 80% 50%)"
                      rx={1}
                    />
                  </>
                )}

                {/* Elevation indicator */}
                {tile.elevation > 0 && (
                  <text
                    x={x * CELL + GAP + 6}
                    y={y * CELL + GAP + 12}
                    fontSize={8}
                    fill="hsl(200 60% 60%)"
                    pointerEvents="none"
                  >
                    ↑{tile.elevation}
                  </text>
                )}
              </g>
            );
          })
        )}

        {/* Units */}
        {units.filter(u => u.alive).map(unit => {
          const vis = getVisibility(unit.position.x, unit.position.y);
          // Show enemy only if visible
          if (unit.faction === 'enemy' && vis !== 'visible') return null;

          const cx = unit.position.x * CELL + GAP + TILE_SIZE / 2;
          const cy = unit.position.y * CELL + GAP + TILE_SIZE / 2;
          const isActive = unit.id === activeUnitId;
          const color = unit.faction === 'player' ? UNIT_COLORS[unit.class] : 'hsl(0 65% 50%)';
          const healthPct = unit.stats.health / unit.stats.maxHealth;

          return (
            <g key={unit.id} filter={isActive ? 'url(#glow)' : undefined}>
              {/* Unit circle */}
              <circle
                cx={cx}
                cy={cy}
                r={isActive ? 18 : 16}
                fill={color}
                stroke={isActive ? 'hsl(45 100% 70%)' : 'hsl(0 0% 10%)'}
                strokeWidth={isActive ? 2.5 : 1.5}
                opacity={0.9}
              />

              {/* Unit initial */}
              <text
                x={cx}
                y={cy + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={isActive ? 13 : 11}
                fontWeight="bold"
                fill="hsl(0 0% 95%)"
                pointerEvents="none"
              >
                {unit.name[0]}
              </text>

              {/* Health bar */}
              <rect
                x={cx - 14}
                y={cy + 19}
                width={28}
                height={3}
                fill="hsl(0 0% 15%)"
                rx={1.5}
              />
              <rect
                x={cx - 14}
                y={cy + 19}
                width={28 * healthPct}
                height={3}
                fill={healthPct > 0.6 ? 'hsl(120 70% 45%)' : healthPct > 0.3 ? 'hsl(40 80% 50%)' : 'hsl(0 70% 50%)'}
                rx={1.5}
              />

              {/* Status effect indicators */}
              {unit.statusEffects.length > 0 && (
                <circle
                  cx={cx + 14}
                  cy={cy - 14}
                  r={4}
                  fill="hsl(280 60% 55%)"
                  stroke="hsl(0 0% 10%)"
                  strokeWidth={1}
                />
              )}

              {/* Overwatch indicator */}
              {unit.overwatching && (
                <text
                  x={cx - 14}
                  y={cy - 14}
                  fontSize={10}
                  fill="hsl(45 100% 60%)"
                  pointerEvents="none"
                >
                  👁
                </text>
              )}
            </g>
          );
        })}

        {/* Hit chance tooltip */}
        {hoveredHitChance && hoveredTile && (
          <g>
            <rect
              x={hoveredTile.x * CELL + GAP + TILE_SIZE + 4}
              y={hoveredTile.y * CELL + GAP}
              width={50}
              height={22}
              fill="hsl(0 0% 10%)"
              stroke="hsl(0 70% 50%)"
              strokeWidth={1}
              rx={4}
              opacity={0.9}
            />
            <text
              x={hoveredTile.x * CELL + GAP + TILE_SIZE + 29}
              y={hoveredTile.y * CELL + GAP + 15}
              textAnchor="middle"
              fontSize={12}
              fontWeight="bold"
              fill="hsl(0 0% 95%)"
              pointerEvents="none"
            >
              {Math.round(hoveredHitChance.total)}%
            </text>
          </g>
        )}

        {/* Detected enemy ghosts */}
        {units.filter(u => u.faction === 'enemy' && u.alive).map(unit => {
          const vis = getVisibility(unit.position.x, unit.position.y);
          if (vis !== 'detected') return null;

          const cx = unit.position.x * CELL + GAP + TILE_SIZE / 2;
          const cy = unit.position.y * CELL + GAP + TILE_SIZE / 2;

          return (
            <g key={`ghost-${unit.id}`} opacity={0.35}>
              <circle cx={cx} cy={cy} r={14} fill="hsl(0 50% 40%)" stroke="hsl(0 0% 30%)" strokeWidth={1} strokeDasharray="3 2" />
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="hsl(0 0% 70%)" pointerEvents="none">?</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default TacticalMap;
