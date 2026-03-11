// ============================================================
// Shadow Protocol - Main Game Page
// ============================================================
import React, { useEffect, useCallback } from 'react';
import { useGameState } from '../engine/useGameState';
import { useAnimations } from '../engine/useAnimations';
import { eventBus } from '../engine/events';
import { playShoot, playExplosion, playMove, playCriticalHit, playMiss, playHeal, playUnitKilled, playAbility } from '../engine/audio';
import TacticalMap from '../components/game/TacticalMap';
import TacticalHUD from '../components/game/TacticalHUD';
import TimelineBar from '../components/game/TimelineBar';
import CombatLog from '../components/game/CombatLog';

const Index = () => {
  const {
    gameState, initGame, selectAction, handleTileClick,
    executeReload, executeOverwatch, endTurn, useCombo, setHoveredTile,
    registerAnimations,
  } = useGameState();

  const { animState, showDamageNumber, showExplosion, animateUnitMove, triggerScreenShake } = useAnimations();

  // Register animation callbacks with game state
  useEffect(() => {
    registerAnimations({ showDamageNumber, showExplosion, animateUnitMove, triggerScreenShake });
  }, [registerAnimations, showDamageNumber, showExplosion, animateUnitMove, triggerScreenShake]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!gameState || gameState.phase !== 'player_turn') return;
    switch (e.key.toLowerCase()) {
      case 'm': selectAction('move'); break;
      case 's': selectAction('shoot'); break;
      case 'r': executeReload(); break;
      case 'o': executeOverwatch(); break;
      case ' ':
      case 'escape':
        e.preventDefault();
        if (gameState.selectedAction) selectAction(null);
        else endTurn();
        break;
    }
  }, [gameState, selectAction, executeReload, executeOverwatch, endTurn]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
            onSelectAction={selectAction}
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
              onTileClick={handleTileClick}
              onTileHover={setHoveredTile}
              animState={animState}
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
                return (
                  <div className="text-xs space-y-0.5">
                    <div>Type: <span className="text-foreground">{tile.type.replace(/_/g, ' ')}</span></div>
                    <div>Cover: <span className="text-foreground">{tile.coverValue}</span></div>
                    {tile.elevation > 0 && <div>Elevation: <span className="text-foreground">+{tile.elevation}</span></div>}
                    {tile.destructible && <div>HP: <span className="text-foreground">{tile.health}/{tile.maxHealth}</span></div>}
                    {tile.hazardEffect && <div>Hazard: <span className="text-[hsl(0,70%,55%)]">{tile.hazardEffect}</span></div>}
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
