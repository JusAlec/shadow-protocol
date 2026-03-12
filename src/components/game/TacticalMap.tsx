// ============================================================
// Shadow Protocol - SVG Tactical Map Renderer (Performance Optimized)
// ============================================================
import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { GameState, Position, TileData, Unit, VisibilityState } from '../../engine/types';
import { calculateHitChance } from '../../engine/systems/combat';
import { AnimationState } from '../../engine/useAnimations';
import CombatEffects from './CombatEffects';
import { getTileSpriteUrl, hasTileSprite } from '../../engine/tileSprites';

interface TacticalMapProps {
  gameState: GameState;
  onTileClick: (pos: Position) => void;
  onTileHover: (pos: Position | null) => void;
  animState: AnimationState;
}

export const TILE_SIZE = 56;
export const GAP = 1;
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

// ─── Static Grid Tiles (memoized separately) ────────────────
interface GridTilesProps {
  grid: TileData[][];
  squadVisibility: Record<string, VisibilityState>;
  movementRange: Position[];
  attackRange: Position[];
  hoveredTile: Position | null;
  activeUnitPos: Position | undefined;
  onTileClick: (pos: Position) => void;
  onTileHover: (pos: Position | null) => void;
}

const GridTiles = React.memo<GridTilesProps>(({
  grid, squadVisibility, movementRange, attackRange, hoveredTile, activeUnitPos, onTileClick, onTileHover
}) => {
  const moveSet = useMemo(() => {
    const s = new Set<string>();
    movementRange.forEach(p => s.add(`${p.x},${p.y}`));
    return s;
  }, [movementRange]);

  const atkSet = useMemo(() => {
    const s = new Set<string>();
    attackRange.forEach(p => s.add(`${p.x},${p.y}`));
    return s;
  }, [attackRange]);

  return (
    <>
      {grid.map((row, y) =>
        row.map((tile, x) => {
          const key = `${x},${y}`;
          const vis = squadVisibility[key] || 'hidden';
          const inMoveRange = moveSet.has(key);
          const inAtkRange = atkSet.has(key);
          const isHovered = hoveredTile?.x === x && hoveredTile?.y === y;
          const isActive = activeUnitPos?.x === x && activeUnitPos?.y === y;

          return (
            <g
              key={key}
              onClick={() => onTileClick({ x, y })}
              onMouseEnter={() => onTileHover({ x, y })}
              onMouseLeave={() => onTileHover(null)}
              className="cursor-pointer"
              filter={vis === 'hidden' ? 'url(#fog-hidden)' : vis === 'detected' ? 'url(#fog-detected)' : undefined}
            >
              {/* Base tile - floor sprite or color fallback */}
              {hasTileSprite('floor') ? (
                <image href={getTileSpriteUrl('floor')}
                  x={x * CELL + GAP} y={y * CELL + GAP}
                  width={TILE_SIZE} height={TILE_SIZE}
                  style={{ imageRendering: 'pixelated' }}
                  opacity={vis === 'hidden' ? 0.3 : 1} />
              ) : (
                <rect x={x * CELL + GAP} y={y * CELL + GAP}
                  width={TILE_SIZE} height={TILE_SIZE} rx={3}
                  fill={TILE_COLORS.floor}
                  opacity={vis === 'hidden' ? 0.3 : 1} />
              )}
              {/* Non-floor tile sprite overlay (or color fallback) */}
              {tile.type !== 'floor' && (
                hasTileSprite(tile.type) ? (
                  <image href={getTileSpriteUrl(tile.type)}
                    x={x * CELL + GAP} y={y * CELL + GAP}
                    width={TILE_SIZE} height={TILE_SIZE}
                    style={{ imageRendering: 'pixelated' }}
                    opacity={vis === 'hidden' ? 0.3 : 1} />
                ) : (
                  <>
                    <rect x={x * CELL + GAP} y={y * CELL + GAP}
                      width={TILE_SIZE} height={TILE_SIZE} rx={3}
                      fill={TILE_COLORS[tile.type] || TILE_COLORS.floor}
                      opacity={vis === 'hidden' ? 0.3 : 1} />
                    {TILE_ICONS[tile.type] && vis !== 'hidden' && (
                      <text x={x * CELL + GAP + TILE_SIZE / 2} y={y * CELL + GAP + TILE_SIZE - 6}
                        textAnchor="middle" fontSize={10} fill="hsl(0 0% 60%)" pointerEvents="none">
                        {TILE_ICONS[tile.type]}
                      </text>
                    )}
                  </>
                )
              )}
              {/* Selection/highlight border */}
              <rect x={x * CELL + GAP} y={y * CELL + GAP}
                width={TILE_SIZE} height={TILE_SIZE} rx={3}
                fill="none"
                stroke={
                  isActive ? 'hsl(45 100% 60%)' :
                  isHovered ? 'hsl(210 60% 60%)' :
                  inMoveRange ? 'hsl(120 70% 45%)' :
                  inAtkRange ? 'hsl(0 70% 50%)' :
                  'hsl(220 10% 15%)'
                }
                strokeWidth={isActive ? 2.5 : isHovered || inMoveRange || inAtkRange ? 1.5 : 0.5}
              />
              {inMoveRange && (
                <rect x={x * CELL + GAP} y={y * CELL + GAP} width={TILE_SIZE} height={TILE_SIZE} rx={3}
                  fill="hsl(120 70% 45%)" opacity={0.15} />
              )}
              {inAtkRange && (
                <rect x={x * CELL + GAP} y={y * CELL + GAP} width={TILE_SIZE} height={TILE_SIZE} rx={3}
                  fill="hsl(0 70% 50%)" opacity={0.12} />
              )}
              {tile.destructible && tile.health < tile.maxHealth && vis === 'visible' && (
                <>
                  <rect x={x * CELL + GAP + 4} y={y * CELL + GAP + TILE_SIZE - 6}
                    width={TILE_SIZE - 8} height={3} fill="hsl(0 0% 20%)" rx={1} />
                  <rect x={x * CELL + GAP + 4} y={y * CELL + GAP + TILE_SIZE - 6}
                    width={(TILE_SIZE - 8) * (tile.health / tile.maxHealth)} height={3}
                    fill="hsl(30 80% 50%)" rx={1} />
                </>
              )}
              {tile.elevation > 0 && (
                <text x={x * CELL + GAP + 6} y={y * CELL + GAP + 12}
                  fontSize={8} fill="hsl(200 60% 60%)" pointerEvents="none">↑{tile.elevation}</text>
              )}
            </g>
          );
        })
      )}
    </>
  );
});
GridTiles.displayName = 'GridTiles';

// ─── Deterministic screen shake ─────────────────────────────
function getShakeOffset(startTime: number, intensity: number): { x: number; y: number } {
  const elapsed = Date.now() - startTime;
  const decay = Math.max(0, 1 - elapsed / 400);
  const freq = 0.05;
  return {
    x: Math.sin(elapsed * freq) * 6 * intensity * decay,
    y: Math.cos(elapsed * freq * 1.3) * 6 * intensity * decay,
  };
}

// ─── Main Map Component ─────────────────────────────────────
const TacticalMap: React.FC<TacticalMapProps> = ({ gameState, onTileClick, onTileHover, animState }) => {
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

  // Ref-based animation frame loop — only runs when animations are active
  const frameTimeRef = useRef(Date.now());
  const [, setFrame] = useState(0);
  const hasAnimations = animState.unitAnimations.length > 0 || animState.damageNumbers.length > 0 || animState.explosions.length > 0 || animState.screenShake;

  useEffect(() => {
    if (!hasAnimations) return;
    let running = true;
    const loop = () => {
      if (!running) return;
      frameTimeRef.current = Date.now();
      setFrame(f => f + 1);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { running = false; };
  }, [hasAnimations]);

  const now = frameTimeRef.current;

  // Compute unit render positions using stable timestamp
  const unitPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    units.forEach(unit => {
      const anim = animState.unitAnimations.find(a => a.unitId === unit.id);
      if (anim) {
        const elapsed = now - anim.timestamp;
        const progress = Math.min(1, elapsed / anim.duration);
        const eased = 1 - (1 - progress) * (1 - progress);
        map.set(unit.id, {
          x: anim.from.x + (anim.to.x - anim.from.x) * eased,
          y: anim.from.y + (anim.to.y - anim.from.y) * eased,
        });
      } else {
        map.set(unit.id, { x: unit.position.x, y: unit.position.y });
      }
    });
    return map;
  }, [units, animState.unitAnimations, now]);

  // Deterministic shake
  const shakeTransform = animState.screenShake
    ? (() => {
        const s = getShakeOffset(now - 50, animState.screenShakeIntensity);
        return `translate(${s.x}px, ${s.y}px)`;
      })()
    : undefined;

  // Damage flash set for unit hit detection
  const damagePositionSet = useMemo(() => {
    const s = new Set<string>();
    animState.damageNumbers.forEach(d => {
      if (!d.miss && !d.heal) s.add(`${d.position.x},${d.position.y}`);
    });
    return s;
  }, [animState.damageNumbers]);

  return (
    <div
      className="relative overflow-auto rounded-lg border border-border/30 bg-[hsl(220,15%,8%)]"
      style={{
        transform: shakeTransform,
        transition: animState.screenShake ? 'none' : 'transform 0.1s ease-out',
        willChange: animState.screenShake ? 'transform' : 'auto',
      }}
    >
      <svg width={mapW} height={mapH} viewBox={`0 0 ${mapW} ${mapH}`} className="block">
        <defs>
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
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="crit-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="hsl(45 100% 60%)" floodOpacity="0.6" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Static grid layer (memoized) */}
        <GridTiles
          grid={grid}
          squadVisibility={squadVisibility}
          movementRange={movementRange}
          attackRange={attackRange}
          hoveredTile={hoveredTile}
          activeUnitPos={activeUnit?.position}
          onTileClick={onTileClick}
          onTileHover={onTileHover}
        />

        {/* Animated units layer */}
        {units.filter(u => u.alive).map(unit => {
          const vis = squadVisibility[`${unit.position.x},${unit.position.y}`] || 'hidden';
          if (unit.faction === 'enemy' && vis !== 'visible') return null;

          const renderPos = unitPositions.get(unit.id) || unit.position;
          const cx = renderPos.x * CELL + GAP + TILE_SIZE / 2;
          const cy = renderPos.y * CELL + GAP + TILE_SIZE / 2;
          const isActiveUnit = unit.id === activeUnitId;
          const color = unit.faction === 'player' ? UNIT_COLORS[unit.class] : 'hsl(0 65% 50%)';
          const healthPct = unit.stats.health / unit.stats.maxHealth;
          const hasDamageFlash = damagePositionSet.has(`${unit.position.x},${unit.position.y}`);

          return (
            <g key={unit.id} filter={isActiveUnit ? 'url(#glow)' : undefined}>
              {hasDamageFlash && (
                <circle cx={cx} cy={cy} r={22} fill="none" stroke="hsl(0 80% 55%)" strokeWidth={2} opacity={0.8}>
                  <animate attributeName="r" from="16" to="28" dur="0.4s" fill="freeze" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="0.4s" fill="freeze" />
                </circle>
              )}
              <circle cx={cx} cy={cy} r={isActiveUnit ? 18 : 16}
                fill={color} stroke={isActiveUnit ? 'hsl(45 100% 70%)' : 'hsl(0 0% 10%)'}
                strokeWidth={isActiveUnit ? 2.5 : 1.5} opacity={0.9} />
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
                fontSize={isActiveUnit ? 13 : 11} fontWeight="bold" fill="hsl(0 0% 95%)" pointerEvents="none">
                {unit.name[0]}
              </text>
              <rect x={cx - 14} y={cy + 19} width={28} height={3} fill="hsl(0 0% 15%)" rx={1.5} />
              <rect x={cx - 14} y={cy + 19} width={28 * healthPct} height={3}
                fill={healthPct > 0.6 ? 'hsl(120 70% 45%)' : healthPct > 0.3 ? 'hsl(40 80% 50%)' : 'hsl(0 70% 50%)'}
                rx={1.5} />
              {unit.statusEffects.length > 0 && (
                <circle cx={cx + 14} cy={cy - 14} r={4} fill="hsl(280 60% 55%)" stroke="hsl(0 0% 10%)" strokeWidth={1} />
              )}
              {unit.overwatching && (
                <text x={cx - 14} y={cy - 14} fontSize={10} fill="hsl(45 100% 60%)" pointerEvents="none">👁</text>
              )}
            </g>
          );
        })}

        {/* Hit chance tooltip */}
        {hoveredHitChance && hoveredTile && (
          <g>
            <rect x={hoveredTile.x * CELL + GAP + TILE_SIZE + 4} y={hoveredTile.y * CELL + GAP}
              width={50} height={22} fill="hsl(0 0% 10%)" stroke="hsl(0 70% 50%)" strokeWidth={1} rx={4} opacity={0.9} />
            <text x={hoveredTile.x * CELL + GAP + TILE_SIZE + 29} y={hoveredTile.y * CELL + GAP + 15}
              textAnchor="middle" fontSize={12} fontWeight="bold" fill="hsl(0 0% 95%)" pointerEvents="none">
              {Math.round(hoveredHitChance.total)}%
            </text>
          </g>
        )}

        {/* Detected enemy ghosts */}
        {units.filter(u => u.faction === 'enemy' && u.alive).map(unit => {
          const vis = squadVisibility[`${unit.position.x},${unit.position.y}`] || 'hidden';
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

        {/* Combat Effects Overlay */}
        <CombatEffects animState={animState} tileSize={TILE_SIZE} gap={GAP} frameTime={now} />
      </svg>
    </div>
  );
};

export default TacticalMap;
