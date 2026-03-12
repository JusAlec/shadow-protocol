// ============================================================
// Shadow Protocol - Main Game Page
// ============================================================
import React, { useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useGameState } from '../engine/useGameState';
import TacticalMap from '../components/game/TacticalMap';
import TacticalHUD from '../components/game/TacticalHUD';
import TimelineBar from '../components/game/TimelineBar';
import CombatLog from '../components/game/CombatLog';
import { useMovementAnimation } from '../hooks/useMovementAnimation';
import { useCombatAnimations } from '../hooks/useCombatAnimations';
import { useAudioEffects } from '../hooks/useAudioEffects';
import { preloadSprites } from '../engine/sprites';
import { preloadTileSprites } from '../engine/tileSprites';

const ALL_TEMPLATES = ['specter', 'bulldog', 'circuit', 'phantom', 'reina', 'hydrabad', 'grunt', 'heavy_trooper', 'commander'];

const Index = () => {
  const {
    gameState, initGame, selectAction, handleTileClick,
    executeReload, executeOverwatch, endTurn, useCombo, setHoveredTile,
    clearPendingPath, clearPendingCombatAnimation,
  } = useGameState();

  const { animatingUnits, startAnimation } = useMovementAnimation();
  const { activeAnimation: activeCombatAnimation, startCombatAnimation } = useCombatAnimations();
  const { playGunshot, playExplosion, playLevelUp, playFlashbang, playFootstep, playLastStep, playConstruction, playDrone, playStimulant, playHydrabad, playGoldenEagleShot, playCartelRally } = useAudioEffects();
  const lastPendingPathRef = useRef<string | null>(null);
  const lastPendingCombatAnimRef = useRef<string | null>(null);
  const lastCombatLogLen = useRef(0);
  const goldenEagleShotsFired = useRef(0);

  // AI stuck recovery: track when pending state was first observed during enemy_turn
  const stuckTimestampRef = useRef<number | null>(null);

  // Derive input blocking from pendingPath or pendingCombatAnimation
  const inputBlocked = !!gameState?.pendingPath || !!gameState?.pendingCombatAnimation;

  useEffect(() => {
    initGame();
    preloadSprites(ALL_TEMPLATES);
    preloadTileSprites();
  }, [initGame]);

  // #12: AI stuck recovery — covers both pending-state stalls and no-progress stalls
  const lastEnemyActionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameState || gameState.phase !== 'enemy_turn') {
      stuckTimestampRef.current = null;
      lastEnemyActionRef.current = null;
      return;
    }

    // Track state fingerprint to detect no progress
    const fingerprint = `${gameState.activeUnitId}:${gameState.pendingPath ? 'p' : ''}:${gameState.pendingCombatAnimation ? 'a' : ''}`;
    if (fingerprint !== lastEnemyActionRef.current) {
      lastEnemyActionRef.current = fingerprint;
      stuckTimestampRef.current = Date.now();
    }

    const timer = setTimeout(() => {
      if (stuckTimestampRef.current !== null && Date.now() - stuckTimestampRef.current >= 3000) {
        clearPendingPath();
        clearPendingCombatAnimation();
        // Force end turn if still stuck with no pending state
        if (!gameState.pendingPath && !gameState.pendingCombatAnimation) {
          endTurn();
        }
        stuckTimestampRef.current = null;
      }
    }, 3100);

    return () => clearTimeout(timer);
  }, [gameState?.phase, gameState?.activeUnitId, gameState?.pendingPath, gameState?.pendingCombatAnimation, clearPendingPath, clearPendingCombatAnimation, endTurn]);

  // Handle pendingPath -> start animation (useLayoutEffect to run before paint)
  useLayoutEffect(() => {
    if (!gameState?.pendingPath) {
      lastPendingPathRef.current = null;
      return;
    }

    const { unitId, path } = gameState.pendingPath;
    // Deduplicate: don't re-trigger for the same path
    const pathKey = `${unitId}:${path.map(p => `${p.x},${p.y}`).join('|')}`;
    if (pathKey === lastPendingPathRef.current) return;
    lastPendingPathRef.current = pathKey;

    startAnimation(unitId, path, () => {
      clearPendingPath();
    }, playFootstep, playLastStep);
  }, [gameState?.pendingPath, startAnimation, clearPendingPath]);

  // Handle pendingCombatAnimation -> start combat animation
  useLayoutEffect(() => {
    if (!gameState?.pendingCombatAnimation) {
      lastPendingCombatAnimRef.current = null;
      return;
    }

    const anim = gameState.pendingCombatAnimation;
    const animKey = `${anim.from.x},${anim.from.y}->${anim.to.x},${anim.to.y}:${anim.hit}:${anim.damage}`;
    if (animKey === lastPendingCombatAnimRef.current) return;
    lastPendingCombatAnimRef.current = animKey;

    startCombatAnimation(anim, () => {
      clearPendingCombatAnimation();
    });
  }, [gameState?.pendingCombatAnimation, startCombatAnimation, clearPendingCombatAnimation]);

  // Play sound on new combat animations
  useEffect(() => {
    if (!gameState?.pendingCombatAnimation) return;
    const animType = gameState.pendingCombatAnimation.type;
    if (animType === 'ability') {
      playExplosion();
    } else if (animType === 'projectile') {
      playGunshot();
    } else if (animType === 'buff') {
      playLevelUp();
    } else if (animType === 'flashbang') {
      playFlashbang();
    } else if (animType === 'construction') {
      playConstruction();
    } else if (animType === 'drone') {
      playDrone();
    } else if (animType === 'stimulant') {
      playStimulant();
    } else if (animType === 'typing') {
      playHydrabad();
    } else if (animType === 'golden_eagle') {
      // Sounds are fired progress-based in a separate effect below
    } else if (animType === 'reina_rally') {
      playCartelRally();
    }
  }, [gameState?.pendingCombatAnimation, playGunshot, playExplosion, playLevelUp, playFlashbang, playConstruction, playDrone, playStimulant, playHydrabad, playGoldenEagleShot, playCartelRally]);

  // Golden Eagle: fire shot sounds in sync with animation progress
  useEffect(() => {
    if (!activeCombatAnimation || activeCombatAnimation.type !== 'golden_eagle') {
      goldenEagleShotsFired.current = 0;
      return;
    }
    const shotCount = activeCombatAnimation.shotCount || 1;
    const { progress } = activeCombatAnimation;
    // Shots fire during active phase (10-85%)
    const activeProgress = Math.max(0, Math.min(1, (progress - 0.10) / 0.75));
    const currentShotIndex = Math.min(Math.floor(activeProgress * shotCount), shotCount - 1);
    // Fire sound for each new shot threshold crossed
    while (goldenEagleShotsFired.current <= currentShotIndex && activeProgress > 0) {
      playGoldenEagleShot();
      goldenEagleShotsFired.current++;
    }
  }, [activeCombatAnimation, playGoldenEagleShot]);

  // Play gunshot sound on new damage log entries (fallback for shots without animation)
  useEffect(() => {
    if (!gameState) return;
    const log = gameState.combatLog;
    const prevLen = lastCombatLogLen.current;
    lastCombatLogLen.current = log.length;

    // Only use log-based sound if there's no pending combat animation (to avoid double-play)
    if (log.length > prevLen && !gameState.pendingCombatAnimation) {
      const newEntries = log.slice(prevLen);
      if (newEntries.some(e => e.type === 'damage')) {
        playGunshot();
      }
    }
  }, [gameState?.combatLog.length, playGunshot, gameState?.pendingCombatAnimation]);

  // Guarded tile click - ignore during animation
  const guardedTileClick = useCallback((pos: { x: number; y: number }) => {
    if (inputBlocked) return;
    handleTileClick(pos);
  }, [handleTileClick, inputBlocked]);

  // Guarded action selection
  const guardedSelectAction = useCallback((action: string | null) => {
    if (inputBlocked) return;
    selectAction(action);
  }, [selectAction, inputBlocked]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!gameState || gameState.phase !== 'player_turn' || !!gameState.pendingPath) return;
      const activeUnit = gameState.units.find(u => u.id === gameState.activeUnitId);
      switch (e.key.toLowerCase()) {
        case 'm': selectAction('move'); break;
        case 's': selectAction('shoot'); break;
        case 'r': executeReload(); break;
        case 'o': executeOverwatch(); break;
        // #8: Keyboard shortcuts 1 & 2 for abilities
        case '1':
          if (activeUnit && activeUnit.abilityIds[0]) {
            selectAction(`ability:${activeUnit.abilityIds[0]}`);
          }
          break;
        case '2':
          if (activeUnit && activeUnit.abilityIds[1]) {
            selectAction(`ability:${activeUnit.abilityIds[1]}`);
          }
          break;
        case '3':
          if (activeUnit && activeUnit.abilityIds[2]) {
            selectAction(`ability:${activeUnit.abilityIds[2]}`);
          }
          break;
        case '4':
          if (activeUnit && activeUnit.abilityIds[3]) {
            selectAction(`ability:${activeUnit.abilityIds[3]}`);
          }
          break;
        case ' ':
        case 'escape':
          e.preventDefault();
          // #13: Cancel pending combo on Escape
          if (gameState.selectedAction || gameState.pendingCombo) selectAction(null);
          else endTurn();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, selectAction, executeReload, executeOverwatch, endTurn]);

  if (!gameState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-foreground">SHADOW PROTOCOL</h1>
          <p className="text-muted-foreground">Initializing tactical systems...</p>
        </div>
      </div>
    );
  }

  // Victory / Defeat screen
  if (gameState.phase === 'victory' || gameState.phase === 'defeat') {
    const isVictory = gameState.phase === 'victory';
    const playerUnits = gameState.units.filter(u => u.faction === 'player');
    const alive = playerUnits.filter(u => u.alive).length;
    const enemyCount = gameState.units.filter(u => u.faction === 'enemy').length;
    const enemiesKilled = gameState.units.filter(u => u.faction === 'enemy' && !u.alive).length;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-xl border border-border/30 bg-card p-8 text-center max-w-md">
          <h1 className={`text-3xl font-black mb-2 ${
            isVictory ? 'text-[hsl(120,70%,50%)]' : 'text-[hsl(0,70%,55%)]'
          }`}>
            {isVictory ? 'MISSION COMPLETE' : 'MISSION FAILED'}
          </h1>
          <p className="text-muted-foreground mb-6">
            {isVictory ? 'All hostiles eliminated.' : 'All operatives lost.'}
          </p>
          <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Turns</div>
              <div className="text-lg font-bold">{gameState.turn}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Survivors</div>
              <div className="text-lg font-bold">{alive}/{playerUnits.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Kills</div>
              <div className="text-lg font-bold">{enemiesKilled}/{enemyCount}</div>
            </div>
          </div>
          <button
            onClick={initGame}
            className="rounded-lg bg-primary px-6 py-2 text-primary-foreground font-medium hover:bg-primary/90 transition-all"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  const activeUnit = gameState.units.find(u => u.id === gameState.activeUnitId);
  const isEnemyTurn = gameState.phase === 'enemy_turn';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-border/20 bg-card/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-black tracking-widest text-foreground">SHADOW PROTOCOL</h1>
          <span className="text-xs text-muted-foreground">Turn {gameState.turn}</span>
        </div>
        <div className="flex items-center gap-2">
          {isEnemyTurn && (
            <span className="animate-pulse rounded bg-[hsl(0,70%,50%,0.2)] px-2 py-0.5 text-xs font-medium text-[hsl(0,70%,60%)]">
              ENEMY TURN
            </span>
          )}
          {activeUnit && (
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${
              activeUnit.faction === 'player'
                ? 'bg-[hsl(210,60%,50%,0.2)] text-[hsl(210,80%,65%)]'
                : 'bg-[hsl(0,60%,50%,0.2)] text-[hsl(0,70%,60%)]'
            }`}>
              {activeUnit.name}
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - HUD */}
        <aside className="w-64 flex-shrink-0 overflow-y-auto border-r border-border/20 bg-card/30 p-3 space-y-3">
          <TacticalHUD
            gameState={gameState}
            onSelectAction={guardedSelectAction}
            onReload={executeReload}
            onOverwatch={executeOverwatch}
            onEndTurn={endTurn}
            onCombo={useCombo}
          />
        </aside>

        {/* Center - Map */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center overflow-auto p-4">
            <TacticalMap
              gameState={gameState}
              onTileClick={guardedTileClick}
              onTileHover={setHoveredTile}
              animatingUnits={animatingUnits}
              pendingPath={gameState.pendingPath}
              activeCombatAnimation={activeCombatAnimation}
            />
          </div>
          {/* Timeline */}
          <div className="border-t border-border/20 p-3">
            <TimelineBar gameState={gameState} />
          </div>
        </main>

        {/* Right Panel - Log */}
        <aside className="w-64 flex-shrink-0 overflow-y-auto border-l border-border/20 bg-card/30 p-3">
          <CombatLog entries={gameState.combatLog} />

          {/* Tile Info */}
          {gameState.hoveredTile && (
            <div className="mt-3 rounded-lg border border-border/30 bg-card/80 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Tile ({gameState.hoveredTile.x}, {gameState.hoveredTile.y})
              </h3>
              {(() => {
                const tile = gameState.grid[gameState.hoveredTile.y]?.[gameState.hoveredTile.x];
                if (!tile) return null;
                const occupant = tile.occupantId
                  ? gameState.units.find(u => u.id === tile.occupantId && u.alive)
                  : gameState.units.find(u => u.alive && u.position.x === gameState.hoveredTile!.x && u.position.y === gameState.hoveredTile!.y);
                const tileKey = `${gameState.hoveredTile!.x},${gameState.hoveredTile!.y}`;
                const isVisible = gameState.squadVisibility[tileKey] === 'visible';
                const showOccupant = occupant && (occupant.faction === 'player' || isVisible);
                const turret = gameState.turrets.find(t => t.position.x === gameState.hoveredTile!.x && t.position.y === gameState.hoveredTile!.y);

                return (
                  <div className="text-xs space-y-0.5">
                    <div>Type: <span className="text-foreground">{tile.type.replace(/_/g, ' ')}</span></div>
                    <div>Cover: <span className="text-foreground">{tile.coverValue}</span></div>
                    {tile.elevation > 0 && <div>Elevation: <span className="text-foreground">+{tile.elevation}</span></div>}
                    {tile.destructible && <div>HP: <span className="text-foreground">{tile.health}/{tile.maxHealth}</span></div>}
                    {tile.hazardEffect && <div>Hazard: <span className="text-[hsl(0,70%,55%)]">{tile.hazardEffect}</span></div>}
                    {showOccupant && (
                      <div className="mt-1 pt-1 border-t border-border/20">
                        <div className="font-semibold">
                          <span className={occupant.faction === 'player' ? 'text-[hsl(210,80%,65%)]' : 'text-[hsl(0,70%,60%)]'}>
                            {occupant.name}
                          </span>
                          <span className="text-muted-foreground ml-1">({occupant.class})</span>
                        </div>
                        <div>HP: <span className="text-foreground">{occupant.stats.health}/{occupant.stats.maxHealth}</span></div>
                        <div>Armor: <span className="text-foreground">{occupant.stats.armor}/{occupant.stats.maxArmor}</span></div>
                        <div>AP: <span className="text-foreground">{occupant.actionPoints}</span></div>
                        {occupant.statusEffects.length > 0 && (
                          <div>Status: <span className="text-[hsl(280,60%,55%)]">{occupant.statusEffects.map(e => e.type).join(', ')}</span></div>
                        )}
                      </div>
                    )}
                    {turret && (
                      <div className="mt-1 pt-1 border-t border-border/20">
                        <div className="font-semibold text-[hsl(50,80%,55%)]">Turret</div>
                        <div>HP: <span className="text-foreground">{turret.health}/{turret.maxHealth}</span></div>
                        <div>Damage: <span className="text-foreground">{turret.damage}</span></div>
                        <div>Range: <span className="text-foreground">{turret.range}</span></div>
                        <div>Turns: <span className="text-foreground">{turret.turnsRemaining}</span></div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default Index;
