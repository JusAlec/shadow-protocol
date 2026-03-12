// ============================================================
// Shadow Protocol - SVG Tactical Map Renderer
// ============================================================
import React, { useMemo, useCallback } from 'react';
import { GameState, Position, TileData, Unit, VisibilityState, FacingDirection, SmokeCloud } from '../../engine/types';
import { ActiveCombatAnimation } from '../../hooks/useCombatAnimations';
import { calculateHitChance, getDistance } from '../../engine/systems/combat';
import { hasLineOfSight } from '../../engine/systems/visibility';
import { WEAPONS } from '../../engine/data/weapons';
import { getSpriteUrl, getTypingAnimationUrl, TYPING_FRAME_COUNT, getShootAnimationUrl, SHOOT_FRAME_COUNT, getRallyAnimationUrl, RALLY_FRAME_COUNT } from '../../engine/sprites';

export interface AnimatedUnitState {
  x: number;
  y: number;
  facing: FacingDirection;
  walkFrame: number;
}

interface TacticalMapProps {
  gameState: GameState;
  onTileClick: (pos: Position) => void;
  onTileHover: (pos: Position | null) => void;
  animatingUnits?: Map<string, AnimatedUnitState>;
  pendingPath?: { unitId: string; path: Position[] } | null;
  activeCombatAnimation?: ActiveCombatAnimation | null;
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

const SPRITE_SIZE = 48;
const PLAYER_SPRITE_SIZE = 56; // #3: Player units match tile size
const REINA_SPRITE_SIZE = 84; // #2/#6: Reina is visibly larger than all other units
const HYDRABAD_SPRITE_SIZE = 96; // Real Hydrabad is 120x120, render much larger
const ELITE_ABILITY_SIZE = 112; // Size Hydrabad (120x120 source) scales up to during abilities
const REINA_ELITE_SIZE = 124; // Size Reina (108x108 source) scales up to — larger to match Hydrabad visually

const TacticalMap: React.FC<TacticalMapProps> = ({ gameState, onTileClick, onTileHover, animatingUnits, pendingPath, activeCombatAnimation }) => {
  const { grid, units, squadVisibility, movementRange, attackRange, activeUnitId, selectedAction, hoveredTile, turrets, drones, smokeClouds } = gameState;
  const mapW = CELL * 12 + GAP;
  const mapH = CELL * 12 + GAP;

  const activeUnit = units.find(u => u.id === activeUnitId);

  // Hit chance for hovered enemy
  const hoveredHitChance = useMemo(() => {
    if (!hoveredTile || !activeUnit || selectedAction !== 'shoot') return null;
    const tile = grid[hoveredTile.y]?.[hoveredTile.x];
    const target = tile?.occupantId
      ? units.find(u => u.id === tile.occupantId && u.alive && u.faction === 'enemy')
      : units.find(u => u.alive && u.faction === 'enemy' && u.position.x === hoveredTile.x && u.position.y === hoveredTile.y);
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

        {/* Smoke Clouds */}
        {smokeClouds && smokeClouds.map((cloud, i) => {
          const cx = cloud.center.x * CELL + GAP + TILE_SIZE / 2;
          const cy = cloud.center.y * CELL + GAP + TILE_SIZE / 2;
          const r = (cloud.radius + 0.5) * CELL;
          const opacity = 0.3 * Math.min(cloud.turnsRemaining / 3, 1);

          return (
            <circle
              key={`smoke-${i}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="hsl(0 0% 55%)"
              opacity={opacity}
              pointerEvents="none"
            />
          );
        })}

        {/* Turrets */}
        {turrets && turrets.map(turret => {
          const tx = turret.position.x * CELL + GAP;
          const ty = turret.position.y * CELL + GAP;
          const healthPct = turret.health / turret.maxHealth;

          return (
            <g key={turret.id}>
              {/* Turret base */}
              <rect
                x={tx + TILE_SIZE / 2 - 10}
                y={ty + TILE_SIZE / 2 - 10}
                width={20}
                height={20}
                rx={3}
                fill="hsl(50 80% 45%)"
                stroke="hsl(50 60% 30%)"
                strokeWidth={1.5}
              />
              {/* Turret icon */}
              <text
                x={tx + TILE_SIZE / 2}
                y={ty + TILE_SIZE / 2 + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fontWeight="bold"
                fill="hsl(0 0% 10%)"
                pointerEvents="none"
              >
                T
              </text>
              {/* #8: Always show turret HP bar */}
              <rect
                x={tx + TILE_SIZE / 2 - 10}
                y={ty + TILE_SIZE / 2 + 13}
                width={20}
                height={2}
                fill="hsl(0 0% 15%)"
                rx={1}
              />
              <rect
                x={tx + TILE_SIZE / 2 - 10}
                y={ty + TILE_SIZE / 2 + 13}
                width={20 * healthPct}
                height={2}
                fill={healthPct > 0.5 ? 'hsl(120 70% 45%)' : 'hsl(0 70% 50%)'}
                rx={1}
              />
            </g>
          );
        })}

        {/* #7: Deployed Drones */}
        {drones && drones.map(drone => {
          const dx = drone.position.x * CELL + GAP;
          const dy = drone.position.y * CELL + GAP;
          const droneHealthPct = drone.health / drone.maxHealth;

          return (
            <g key={drone.id}>
              {/* Drone vision radius indicator */}
              <circle
                cx={dx + TILE_SIZE / 2}
                cy={dy + TILE_SIZE / 2}
                r={(drone.radius + 0.5) * CELL}
                fill="hsl(180 60% 50%)"
                opacity={0.05}
                pointerEvents="none"
              />
              <circle
                cx={dx + TILE_SIZE / 2}
                cy={dy + TILE_SIZE / 2}
                r={(drone.radius + 0.5) * CELL}
                fill="none"
                stroke="hsl(180 50% 45%)"
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.3}
                pointerEvents="none"
              />
              {/* Drone body */}
              <circle
                cx={dx + TILE_SIZE / 2}
                cy={dy + TILE_SIZE / 2}
                r={8}
                fill="hsl(180 60% 45%)"
                stroke="hsl(180 40% 30%)"
                strokeWidth={1.5}
              />
              <text
                x={dx + TILE_SIZE / 2}
                y={dy + TILE_SIZE / 2 + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={8}
                fontWeight="bold"
                fill="hsl(0 0% 95%)"
                pointerEvents="none"
              >
                D
              </text>
              {/* HP bar */}
              <rect
                x={dx + TILE_SIZE / 2 - 10}
                y={dy + TILE_SIZE / 2 + 11}
                width={20}
                height={2}
                fill="hsl(0 0% 15%)"
                rx={1}
              />
              <rect
                x={dx + TILE_SIZE / 2 - 10}
                y={dy + TILE_SIZE / 2 + 11}
                width={20 * droneHealthPct}
                height={2}
                fill={droneHealthPct > 0.5 ? 'hsl(180 60% 50%)' : 'hsl(0 70% 50%)'}
                rx={1}
              />
            </g>
          );
        })}

        {/* Units */}
        {units.filter(u => u.alive).map(unit => {
          const animState = animatingUnits?.get(unit.id);
          // If this unit has a pendingPath but animation hasn't started yet,
          // show it at the path start position (not at unit.position which is already the destination)
          const hasPendingButNotAnimating = pendingPath?.unitId === unit.id && !animState;
          const visualX = animState ? animState.x : hasPendingButNotAnimating ? pendingPath!.path[0].x : unit.position.x;
          const visualY = animState ? animState.y : hasPendingButNotAnimating ? pendingPath!.path[0].y : unit.position.y;
          const facing = animState ? animState.facing : unit.facing;
          const isWalking = !!animState;
          const walkFrame = animState ? animState.walkFrame : 0;

          const vis = getVisibility(Math.round(visualX), Math.round(visualY));
          // Show enemy only if visible
          if (unit.faction === 'enemy' && vis !== 'visible') return null;
          // #9: Units in smoke — allies show silhouette, enemies show "?" indicator
          const unitTile = grid[Math.round(visualY)]?.[Math.round(visualX)];
          const inSmoke = unitTile?.smoke && unitTile.smoke > 0;

          const cx = visualX * CELL + GAP + TILE_SIZE / 2;
          const cy = visualY * CELL + GAP + TILE_SIZE / 2;
          const isActive = unit.id === activeUnitId;
          const color = unit.faction === 'player' ? UNIT_COLORS[unit.class] : 'hsl(0 65% 50%)';
          const healthPct = unit.stats.health / unit.stats.maxHealth;

          // #9: Render smoke indicators instead of full unit
          if (inSmoke) {
            if (unit.faction === 'player') {
              // Ally silhouette in smoke
              return (
                <g key={unit.id}>
                  <circle cx={cx} cy={cy} r={14} fill="hsl(210 40% 40%)" opacity={0.4} />
                  <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="hsl(210 60% 70%)" opacity={0.6} pointerEvents="none">
                    {unit.name[0]}
                  </text>
                </g>
              );
            } else {
              // Enemy "last seen" indicator
              return (
                <g key={unit.id}>
                  <circle cx={cx} cy={cy} r={12} fill="hsl(0 50% 35%)" opacity={0.3} strokeDasharray="3 2" stroke="hsl(0 60% 50%)" strokeWidth={1} />
                  <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold" fill="hsl(0 60% 60%)" opacity={0.5} pointerEvents="none">
                    ?
                  </text>
                </g>
              );
            }
          }

          const spriteUrl = getSpriteUrl(unit.templateId, facing, isWalking, walkFrame);
          // #2/#3/#6: Reina largest, player units slightly larger than enemies
          const spriteSize = unit.templateId === 'reina' ? REINA_SPRITE_SIZE : unit.templateId === 'hydrabad' ? HYDRABAD_SPRITE_SIZE : unit.faction === 'player' ? PLAYER_SPRITE_SIZE : SPRITE_SIZE;

          return (
            <g key={unit.id} filter={isActive ? 'url(#glow)' : undefined}>
              {spriteUrl ? (
                <>
                  {/* Active unit highlight ring */}
                  {isActive && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={unit.templateId === 'reina' ? 34 : unit.faction === 'player' ? 26 : 22}
                      fill="none"
                      stroke="hsl(45 100% 70%)"
                      strokeWidth={2}
                      opacity={0.7}
                    />
                  )}
                  {/* Sprite image */}
                  <image
                    href={spriteUrl}
                    x={visualX * CELL + GAP + (TILE_SIZE - spriteSize) / 2}
                    y={visualY * CELL + GAP + (TILE_SIZE - spriteSize) / 2}
                    width={spriteSize}
                    height={spriteSize}
                    style={{ imageRendering: 'pixelated' }}
                    pointerEvents="none"
                  />
                </>
              ) : (
                <>
                  {/* Fallback: Unit circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={unit.templateId === 'reina' ? (isActive ? 30 : 28) : unit.faction === 'player' ? (isActive ? 22 : 20) : (isActive ? 18 : 16)}
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
                </>
              )}

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

        {/* Combat animation */}
        {activeCombatAnimation && (() => {
          const { type, from, to, progress, hit, damage, critical, radius } = activeCombatAnimation;

          // Buff animation — pulsing green/gold ring
          if (type === 'buff') {
            const centerX = to.x * CELL + GAP + TILE_SIZE / 2;
            const centerY = to.y * CELL + GAP + TILE_SIZE / 2;
            const ringRadius = 20 + 6 * Math.sin(progress * Math.PI * 2);
            const opacity = 0.7 * (1 - progress * 0.5);

            return (
              <g pointerEvents="none">
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={ringRadius}
                  fill="none"
                  stroke="hsl(80 70% 55%)"
                  strokeWidth={3}
                  opacity={opacity}
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={ringRadius * 0.7}
                  fill="hsl(45 100% 60%)"
                  opacity={0.15 * (1 - progress)}
                />
              </g>
            );
          }

          // Stimulant animation — pulsing purple ring + "+SPEED" text
          if (type === 'stimulant') {
            const centerX = to.x * CELL + GAP + TILE_SIZE / 2;
            const centerY = to.y * CELL + GAP + TILE_SIZE / 2;
            const ringRadius = 18 + 4 * Math.sin(progress * Math.PI * 3);
            const opacity = 0.8 * (1 - progress * 0.5);
            const textY = centerY - 20 - progress * 20;

            return (
              <g pointerEvents="none">
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={ringRadius}
                  fill="none"
                  stroke="hsl(280 60% 55%)"
                  strokeWidth={3}
                  opacity={opacity}
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={ringRadius * 0.6}
                  fill="hsl(280 60% 55%)"
                  opacity={0.12 * (1 - progress)}
                />
                <text
                  x={centerX}
                  y={textY}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight="bold"
                  fill="hsl(280 60% 65%)"
                  opacity={1 - progress * 0.6}
                  style={{ filter: 'drop-shadow(0 0 3px hsl(280 60% 40%))' }}
                >
                  +SPEED
                </text>
              </g>
            );
          }

          // Reina Rally — elite ability: scale up → rally sprite → scale down to idle
          if (type === 'reina_rally') {
            const centerX = to.x * CELL + GAP + TILE_SIZE / 2;
            const centerY = to.y * CELL + GAP + TILE_SIZE / 2;
            const normalSize = REINA_SPRITE_SIZE;
            const eliteSize = REINA_ELITE_SIZE;
            const idleUrl = getSpriteUrl('reina', 'south', false, 0);

            let currentSize: number;
            let animOpacity: number;
            let idleOpacity: number;

            if (progress < 0.10) {
              const t = progress / 0.10;
              currentSize = normalSize + (eliteSize - normalSize) * t;
              animOpacity = t;
              idleOpacity = 1 - t;
            } else if (progress < 0.85) {
              currentSize = eliteSize;
              animOpacity = 1;
              idleOpacity = 0;
            } else {
              const t = (progress - 0.85) / 0.15;
              currentSize = eliteSize - (eliteSize - normalSize) * t;
              animOpacity = 1 - t;
              idleOpacity = t;
            }

            const frameIndex = Math.floor(progress * RALLY_FRAME_COUNT * 3) % RALLY_FRAME_COUNT;
            const frameUrl = getRallyAnimationUrl(frameIndex);
            const textY = centerY - currentSize / 2 - 8;
            const textOpacity = progress < 0.10 ? progress / 0.10 : progress > 0.85 ? (1 - progress) / 0.15 : 1;
            // Pulsing rally ring
            const ringRadius = currentSize / 2 + 4 + 3 * Math.sin(progress * Math.PI * 6);

            return (
              <g pointerEvents="none">
                {/* Pulsing gold rally ring */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={ringRadius}
                  fill="none"
                  stroke="hsl(45 100% 60%)"
                  strokeWidth={3}
                  opacity={animOpacity * 0.7}
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={ringRadius * 0.85}
                  fill="hsl(45 100% 60%)"
                  opacity={animOpacity * 0.08}
                />
                {/* Idle sprite (visible during fade in/out) */}
                {idleOpacity > 0 && idleUrl && (
                  <image
                    href={idleUrl}
                    x={centerX - currentSize / 2}
                    y={centerY - currentSize / 2}
                    width={currentSize}
                    height={currentSize}
                    opacity={idleOpacity}
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                {/* Rally animation sprite */}
                {animOpacity > 0 && (
                  <image
                    href={frameUrl}
                    x={centerX - currentSize / 2}
                    y={centerY - currentSize / 2}
                    width={currentSize}
                    height={currentSize}
                    opacity={animOpacity}
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                {/* RALLY! text */}
                <text
                  x={centerX}
                  y={textY}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight="bold"
                  fill="hsl(45 100% 65%)"
                  opacity={textOpacity * 0.9}
                  style={{ filter: 'drop-shadow(0 0 3px hsl(45 100% 40%))' }}
                >
                  RALLY!
                </text>
              </g>
            );
          }

          // Typing animation — elite ability: scale up → typing sprite → scale down to idle
          if (type === 'typing') {
            const centerX = to.x * CELL + GAP + TILE_SIZE / 2;
            const centerY = to.y * CELL + GAP + TILE_SIZE / 2;
            const normalSize = HYDRABAD_SPRITE_SIZE;

            // Phase 1 (0-10%): scale up from normal to elite size
            // Phase 2 (10-85%): play animation at elite size
            // Phase 3 (85-100%): scale down from elite to normal, crossfade to idle
            let currentSize: number;
            let animOpacity: number;
            let idleOpacity: number;
            let showAnim: boolean;

            if (progress < 0.10) {
              const t = progress / 0.10;
              currentSize = normalSize + (ELITE_ABILITY_SIZE - normalSize) * t;
              animOpacity = t;
              idleOpacity = 1 - t;
              showAnim = true;
            } else if (progress < 0.85) {
              currentSize = ELITE_ABILITY_SIZE;
              animOpacity = 1;
              idleOpacity = 0;
              showAnim = true;
            } else {
              const t = (progress - 0.85) / 0.15;
              currentSize = ELITE_ABILITY_SIZE - (ELITE_ABILITY_SIZE - normalSize) * t;
              animOpacity = 1 - t;
              idleOpacity = t;
              showAnim = true;
            }

            const frameIndex = Math.floor(progress * TYPING_FRAME_COUNT * 3) % TYPING_FRAME_COUNT;
            const frameUrl = getTypingAnimationUrl(frameIndex);
            const idleUrl = getSpriteUrl('hydrabad', 'south', false, 0);
            const textY = centerY - currentSize / 2 - 8;
            const textOpacity = progress < 0.10 ? progress / 0.10 : progress > 0.85 ? (1 - progress) / 0.15 : 1;

            return (
              <g pointerEvents="none">
                {/* Idle sprite (visible during fade in/out) */}
                {idleOpacity > 0 && idleUrl && (
                  <image
                    href={idleUrl}
                    x={centerX - currentSize / 2}
                    y={centerY - currentSize / 2}
                    width={currentSize}
                    height={currentSize}
                    opacity={idleOpacity}
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                {/* Typing animation sprite */}
                {showAnim && (
                  <image
                    href={frameUrl}
                    x={centerX - currentSize / 2}
                    y={centerY - currentSize / 2}
                    width={currentSize}
                    height={currentSize}
                    opacity={animOpacity}
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                <text
                  x={centerX}
                  y={textY}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight="bold"
                  fill="hsl(200 80% 65%)"
                  opacity={textOpacity * 0.9}
                  style={{ filter: 'drop-shadow(0 0 3px hsl(200 80% 40%))' }}
                >
                  HACKING...
                </text>
              </g>
            );
          }

          // #5: Drone animation — pulsing translucent circle at target
          if (type === 'drone' && radius) {
            const centerX = to.x * CELL + GAP + TILE_SIZE / 2;
            const centerY = to.y * CELL + GAP + TILE_SIZE / 2;
            const maxRadius = (radius + 0.5) * CELL;
            const pulseRadius = maxRadius * (0.8 + 0.2 * Math.sin(progress * Math.PI * 4));
            const opacity = 0.4 * (1 - progress * 0.5);

            return (
              <g pointerEvents="none">
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={pulseRadius}
                  fill="hsl(180 60% 50%)"
                  opacity={0.1 * (1 - progress)}
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={pulseRadius}
                  fill="none"
                  stroke="hsl(180 70% 55%)"
                  strokeWidth={2}
                  opacity={opacity}
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={8}
                  fill="hsl(180 60% 60%)"
                  opacity={0.7 * (1 - progress)}
                />
              </g>
            );
          }

          // #4: Construction animation — expanding golden ring at build site
          if (type === 'construction') {
            const centerX = to.x * CELL + GAP + TILE_SIZE / 2;
            const centerY = to.y * CELL + GAP + TILE_SIZE / 2;
            const ringRadius = 10 + 12 * progress;
            const opacity = 0.8 * (1 - progress);

            return (
              <g pointerEvents="none">
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={ringRadius}
                  fill="none"
                  stroke="hsl(50 80% 55%)"
                  strokeWidth={3}
                  opacity={opacity}
                />
                {progress < 0.5 && (
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={6 * (1 - progress * 2)}
                    fill="hsl(50 80% 70%)"
                    opacity={0.6}
                  />
                )}
              </g>
            );
          }

          // Flashbang animation — expanding white flash
          if (type === 'flashbang' && radius) {
            const centerX = to.x * CELL + GAP + TILE_SIZE / 2;
            const centerY = to.y * CELL + GAP + TILE_SIZE / 2;
            const maxRadius = radius * CELL;
            const currentRadius = maxRadius * Math.min(progress * 2, 1);
            const flashOpacity = progress < 0.3 ? 0.9 * (1 - progress / 0.3) : 0;

            return (
              <g pointerEvents="none">
                {/* Expanding white circle */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={currentRadius}
                  fill="hsl(55 100% 90%)"
                  opacity={0.35 * (1 - progress)}
                />
                {/* Sharp center flash */}
                {progress < 0.3 && (
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={18 * (1 - progress * 3)}
                    fill="hsl(0 0% 100%)"
                    opacity={flashOpacity}
                  />
                )}
              </g>
            );
          }

          // Explosion / AoE ability animation
          if (type === 'ability' && radius) {
            const centerX = to.x * CELL + GAP + TILE_SIZE / 2;
            const centerY = to.y * CELL + GAP + TILE_SIZE / 2;
            const maxRadius = radius * CELL;
            const currentRadius = maxRadius * Math.min(progress * 1.5, 1);
            const showDamageText = progress > 0.5;
            const textProgress = (progress - 0.5) / 0.5;
            const textY = centerY - 20 - textProgress * 25;
            const textOpacity = 1 - textProgress * 0.6;

            return (
              <g pointerEvents="none">
                {/* Expanding explosion circle */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={currentRadius}
                  fill="hsl(25 90% 50%)"
                  opacity={0.3 * (1 - progress)}
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={currentRadius * 0.7}
                  fill="hsl(0 80% 55%)"
                  opacity={0.4 * (1 - progress)}
                />
                {/* Center flash */}
                {progress < 0.3 && (
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={12 * (1 - progress * 3)}
                    fill="hsl(45 100% 80%)"
                    opacity={0.9}
                  />
                )}
                {/* Damage text */}
                {showDamageText && (
                  <text
                    x={centerX}
                    y={textY}
                    textAnchor="middle"
                    fontSize={16}
                    fontWeight="bold"
                    fill="hsl(25 90% 60%)"
                    opacity={textOpacity}
                    style={{ filter: 'drop-shadow(0 0 3px hsl(0 80% 40%))' }}
                  >
                    -{damage}
                  </text>
                )}
              </g>
            );
          }

          // Golden Eagle — elite ability: scale up → shoot sprite → scale down to idle
          if (type === 'golden_eagle') {
            const shotCount = activeCombatAnimation.shotCount || 1;
            const perShotDamages = activeCombatAnimation.perShotDamages || [];
            const casterFacing = activeCombatAnimation.casterFacing || 'south';
            const fromCx = from.x * CELL + GAP + TILE_SIZE / 2;
            const fromCy = from.y * CELL + GAP + TILE_SIZE / 2;
            const toCx = to.x * CELL + GAP + TILE_SIZE / 2;
            const toCy = to.y * CELL + GAP + TILE_SIZE / 2;
            const normalSize = REINA_SPRITE_SIZE;
            const eliteSize = REINA_ELITE_SIZE;

            // Phase 1 (0-10%): scale up from normal to elite size
            // Phase 2 (10-85%): play shoot animation at elite size
            // Phase 3 (85-100%): scale down from elite to normal, crossfade to idle
            let currentSize: number;
            let animOpacity: number;
            let idleOpacity: number;

            if (progress < 0.10) {
              const t = progress / 0.10;
              currentSize = normalSize + (eliteSize - normalSize) * t;
              animOpacity = t;
              idleOpacity = 1 - t;
            } else if (progress < 0.85) {
              currentSize = eliteSize;
              animOpacity = 1;
              idleOpacity = 0;
            } else {
              const t = (progress - 0.85) / 0.15;
              currentSize = eliteSize - (eliteSize - normalSize) * t;
              animOpacity = 1 - t;
              idleOpacity = t;
            }

            // Shooting frames cycle during the active phase (10-85%)
            const activeProgress = Math.max(0, Math.min(1, (progress - 0.10) / 0.75));
            const activeShotCount = shotCount;
            const currentShotIndex = Math.min(Math.floor(activeProgress * activeShotCount), activeShotCount - 1);
            const shotProgress = (activeProgress * activeShotCount) - Math.floor(activeProgress * activeShotCount);
            const shootFrame = Math.floor(shotProgress * SHOOT_FRAME_COUNT) % SHOOT_FRAME_COUNT;
            const shootUrl = getShootAnimationUrl(casterFacing, shootFrame);
            const idleUrl = getSpriteUrl('reina', casterFacing, false, 0);
            const textY = fromCy - currentSize / 2 - 8;
            const textOpacity = progress < 0.10 ? progress / 0.10 : progress > 0.85 ? (1 - progress) / 0.15 : 1;

            return (
              <g pointerEvents="none">
                {/* Idle sprite (visible during fade in/out) */}
                {idleOpacity > 0 && idleUrl && (
                  <image
                    href={idleUrl}
                    x={fromCx - currentSize / 2}
                    y={fromCy - currentSize / 2}
                    width={currentSize}
                    height={currentSize}
                    opacity={idleOpacity}
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                {/* Shooting animation sprite */}
                {animOpacity > 0 && (
                  <image
                    href={shootUrl}
                    x={fromCx - currentSize / 2}
                    y={fromCy - currentSize / 2}
                    width={currentSize}
                    height={currentSize}
                    opacity={animOpacity}
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                {/* UNLOADING text */}
                <text
                  x={fromCx}
                  y={textY}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight="bold"
                  fill="hsl(45 100% 65%)"
                  opacity={textOpacity * 0.9}
                  style={{ filter: 'drop-shadow(0 0 3px hsl(45 100% 40%))' }}
                >
                  UNLOADING
                </text>
                {/* Projectile lines during active phase */}
                {progress >= 0.10 && progress < 0.85 && (() => {
                  const projEndX = fromCx + (toCx - fromCx) * Math.min(shotProgress * 2, 1);
                  const projEndY = fromCy + (toCy - fromCy) * Math.min(shotProgress * 2, 1);
                  return (
                    <>
                      <line
                        x1={fromCx} y1={fromCy}
                        x2={projEndX} y2={projEndY}
                        stroke="hsl(45 100% 55%)"
                        strokeWidth={2}
                        opacity={Math.max(0, 1 - shotProgress)}
                      />
                      {shotProgress < 0.15 && (
                        <circle cx={fromCx} cy={fromCy} r={8}
                          fill="hsl(45 100% 70%)" opacity={0.8 - shotProgress * 5} />
                      )}
                      {shotProgress > 0.45 && shotProgress < 0.65 && (
                        <circle cx={toCx} cy={toCy}
                          r={10 * (1 - Math.abs(shotProgress - 0.55) * 10)}
                          fill="hsl(0 70% 60%)" opacity={0.6} />
                      )}
                    </>
                  );
                })()}
                {/* Damage numbers for completed shots, stacked upward */}
                {perShotDamages.map((dmg, i) => {
                  if (i > currentShotIndex || progress < 0.10) return null;
                  const age = i < currentShotIndex ? 1 : shotProgress;
                  const yOffset = i * 16;
                  const dmgOpacity = i < currentShotIndex
                    ? Math.max(0.3, 1 - (currentShotIndex - i) * 0.15)
                    : age > 0.5 ? 1 - (age - 0.5) * 0.4 : 0;
                  if (dmgOpacity <= 0) return null;
                  return (
                    <text
                      key={i}
                      x={toCx + 15}
                      y={toCy - 10 - yOffset}
                      textAnchor="start"
                      fontSize={12}
                      fontWeight="bold"
                      fill="hsl(0 80% 60%)"
                      opacity={dmgOpacity}
                      style={{ filter: 'drop-shadow(0 0 2px hsl(0 80% 30%))' }}
                    >
                      -{dmg}
                    </text>
                  );
                })}
              </g>
            );
          }

          // Projectile animation (default)
          const fromCx = from.x * CELL + GAP + TILE_SIZE / 2;
          const fromCy = from.y * CELL + GAP + TILE_SIZE / 2;
          const toCx = to.x * CELL + GAP + TILE_SIZE / 2;
          const toCy = to.y * CELL + GAP + TILE_SIZE / 2;

          // Projectile line grows toward target
          const projEndX = fromCx + (toCx - fromCx) * Math.min(progress * 2, 1);
          const projEndY = fromCy + (toCy - fromCy) * Math.min(progress * 2, 1);

          // Damage text appears after projectile reaches target (progress > 0.5)
          const showDamageText = progress > 0.5;
          const textProgress = (progress - 0.5) / 0.5; // 0 to 1 over second half
          const textY = toCy - 20 - textProgress * 25;
          const textOpacity = 1 - textProgress * 0.6;

          return (
            <g pointerEvents="none">
              {/* Projectile line */}
              <line
                x1={fromCx}
                y1={fromCy}
                x2={projEndX}
                y2={projEndY}
                stroke="hsl(45 100% 55%)"
                strokeWidth={2}
                opacity={Math.max(0, 1 - progress)}
              />
              {/* Muzzle flash */}
              {progress < 0.15 && (
                <circle
                  cx={fromCx}
                  cy={fromCy}
                  r={8}
                  fill="hsl(45 100% 70%)"
                  opacity={0.8 - progress * 5}
                />
              )}
              {/* Damage number / MISS text */}
              {showDamageText && (
                <text
                  x={toCx}
                  y={textY}
                  textAnchor="middle"
                  fontSize={critical ? 18 : 14}
                  fontWeight="bold"
                  fill={hit ? (critical ? 'hsl(45 100% 60%)' : 'hsl(0 80% 60%)') : 'hsl(0 0% 70%)'}
                  opacity={textOpacity}
                  style={critical ? { filter: 'drop-shadow(0 0 3px hsl(45 100% 50%))' } : undefined}
                >
                  {hit ? `-${damage}` : 'MISS'}
                </text>
              )}
              {/* Impact flash on hit */}
              {hit && progress > 0.45 && progress < 0.65 && (
                <circle
                  cx={toCx}
                  cy={toCy}
                  r={12 * (1 - Math.abs(progress - 0.55) * 10)}
                  fill={critical ? 'hsl(45 100% 70%)' : 'hsl(0 70% 60%)'}
                  opacity={0.6}
                />
              )}
            </g>
          );
        })()}
      </svg>
    </div>
  );
};

export default TacticalMap;
