// ============================================================
// Shadow Protocol - Game State Manager (React Hook)
// ============================================================
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  GameState, GamePhase, Unit, Position, TileData, CombatLogEntry,
  MomentumEvent, TimelineEntry, FacingDirection, CombatAnimation, DeployedTurret, DeployedDrone, SmokeCloud
} from '@/engine/types';
import { deltaToFacing } from '@/engine/sprites';
import { eventBus } from '@/engine/events';
import { generateDemoMap, getDemoSpawns } from '@/engine/data/maps';
import { createOperative, createEnemy } from '@/engine/data/operatives';
import { WEAPONS } from '@/engine/data/weapons';
import { ABILITIES } from '@/engine/data/abilities';
import {
  resolveAttack, applyDamage, applyStatusEffect, tickStatusEffects,
  calculateHitChance, getDistance
} from '@/engine/systems/combat';
import { calculateSquadVisibility, hasLineOfSight, isSmokeBlocking } from '@/engine/systems/visibility';
import { getReachableTiles, findPath, getTilesInRange } from '@/engine/systems/pathfinding';
import { initializeTimeline, advanceUnit, removeFromTimeline, getNextUnit, sortTimeline } from '@/engine/systems/initiative';
import { createMomentumState, applyMomentum, consumeMomentum } from '@/engine/systems/momentum';
import { checkHazardDamage, damageTile } from '@/engine/systems/environment';
import {
  createAIState, updateAwareness, decideAction, alertNearbyEnemies,
  AIAction, AIState
} from '@/engine/systems/ai';

function addLog(logs: CombatLogEntry[], turn: number, message: string, type: CombatLogEntry['type']): CombatLogEntry[] {
  return [...logs, { turn, timestamp: Date.now(), message, type }];
}

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const aiStatesRef = useRef<Map<string, AIState>>(new Map());
  const processingAI = useRef(false);

  // Initialize game
  const initGame = useCallback(() => {
    const grid = generateDemoMap();
    const spawns = getDemoSpawns();

    // Create player operatives
    const players: Unit[] = [
      { ...createOperative('specter', 'specter'), position: spawns.playerSpawns[0] },
      { ...createOperative('bulldog', 'bulldog'), position: spawns.playerSpawns[1] },
      { ...createOperative('circuit', 'circuit'), position: spawns.playerSpawns[2] },
      { ...createOperative('phantom', 'phantom'), position: spawns.playerSpawns[3] },
      { ...createOperative('reina', 'reina'), position: spawns.playerSpawns[4] },
      { ...createOperative('hydrabad', 'hydrabad'), position: spawns.playerSpawns[5] },
    ];

    // Create enemies
    const enemies: Unit[] = [
      { ...createEnemy('grunt1', 'grunt'), position: spawns.enemySpawns[0] },
      { ...createEnemy('grunt2', 'grunt'), position: spawns.enemySpawns[1] },
      { ...createEnemy('heavy1', 'heavy_trooper'), position: spawns.enemySpawns[2] },
      { ...createEnemy('grunt3', 'grunt'), position: spawns.enemySpawns[3] },
      { ...createEnemy('cmdr1', 'commander'), position: spawns.enemySpawns[4] },
    ];

    const allUnits = [...players, ...enemies];

    // Mark occupied tiles
    for (const unit of allUnits) {
      grid[unit.position.y][unit.position.x].occupied = true;
      grid[unit.position.y][unit.position.x].occupantId = unit.id;
    }

    // Initialize AI states
    const aiMap = new Map<string, AIState>();
    for (const enemy of enemies) {
      aiMap.set(enemy.id, createAIState([
        enemy.position,
        { x: enemy.position.x + 1, y: enemy.position.y + 1 },
        { x: enemy.position.x - 1, y: enemy.position.y + 1 },
        enemy.position,
      ]));
    }
    aiStatesRef.current = aiMap;

    // Calculate initial visibility
    const { unitVisibility, squadVisibility } = calculateSquadVisibility(allUnits, grid, 12, 12);

    // Initialize timeline
    const timeline = initializeTimeline(allUnits);
    const activeUnitId = getNextUnit(timeline);

    const state: GameState = {
      phase: 'player_turn',
      turn: 1,
      units: allUnits,
      grid,
      timeline,
      activeUnitId,
      momentum: createMomentumState(),
      visibility: unitVisibility,
      squadVisibility,
      selectedAction: null,
      targetingMode: false,
      hoveredTile: null,
      movementRange: [],
      attackRange: [],
      combatLog: [{ turn: 1, timestamp: Date.now(), message: 'Mission started. Eliminate all hostiles.', type: 'info' }],
      pendingPath: null,
      pendingCombatAnimation: null,
      turrets: [],
      drones: [],
      smokeClouds: [],
      pendingCombo: null,
      mapWidth: 12,
      mapHeight: 12,
    };

    // If first unit is player, show movement range
    const activeUnit = allUnits.find(u => u.id === activeUnitId);
    if (activeUnit?.faction === 'player') {
      state.phase = 'player_turn';
    } else {
      state.phase = 'enemy_turn';
    }

    setGameState(state);
  }, []);

  // Select action
  const selectAction = useCallback((action: string | null) => {
    setGameState(prev => {
      if (!prev || !prev.activeUnitId) return prev;
      const unit = prev.units.find(u => u.id === prev.activeUnitId);
      if (!unit || unit.faction !== 'player') return prev;

      if (action === 'move') {
        const hasDebuffSpeed = unit.statusEffects.some(e => e.type === 'debuff_speed');
        const effectiveAP = hasDebuffSpeed ? Math.floor(unit.actionPoints * 0.6) : unit.actionPoints;
        const reachable = getReachableTiles(unit.position, effectiveAP, prev.grid);
        return { ...prev, selectedAction: 'move', targetingMode: true, movementRange: reachable, attackRange: [] };
      }
      if (action === 'shoot') {
        const weapon = WEAPONS[unit.weaponId];
        if (!weapon || unit.ammo <= 0) return prev;
        const inRange = getTilesInRange(unit.position, weapon.range, prev.grid);
        return { ...prev, selectedAction: 'shoot', targetingMode: true, movementRange: [], attackRange: inRange };
      }
      if (action === 'reload') {
        return { ...prev, selectedAction: 'reload', targetingMode: false };
      }
      if (action === 'overwatch') {
        return { ...prev, selectedAction: 'overwatch', targetingMode: false };
      }
      if (action?.startsWith('ability:')) {
        const abilityId = action.replace('ability:', '');
        const ability = ABILITIES[abilityId];
        if (!ability) return prev;
        // #1: Self-targeting abilities auto-execute immediately (no targeting mode)
        if (ability.targetType === 'self') {
          return executeAbility(prev, unit, unit.position, abilityId);
        }
        const range = ability.range || 1;
        const inRange = getTilesInRange(unit.position, range, prev.grid);
        return { ...prev, selectedAction: action, targetingMode: true, movementRange: [], attackRange: inRange };
      }
      return { ...prev, selectedAction: null, targetingMode: false, movementRange: [], attackRange: [], pendingCombo: null };
    });
  }, []);

  // Execute tile click
  const handleTileClick = useCallback((pos: Position) => {
    setGameState(prev => {
      if (!prev || !prev.activeUnitId || prev.phase !== 'player_turn') return prev;
      const unit = prev.units.find(u => u.id === prev.activeUnitId);
      if (!unit || unit.faction !== 'player') return prev;

      // #13: Check pending combo before other actions
      if (prev.pendingCombo) {
        return executeCombo(prev, pos, prev.pendingCombo);
      }

      if (prev.selectedAction === 'move') {
        return executeMove(prev, unit, pos);
      }
      if (prev.selectedAction === 'shoot') {
        return executeShoot(prev, unit, pos);
      }
      if (prev.selectedAction?.startsWith('ability:')) {
        return executeAbility(prev, unit, pos, prev.selectedAction.replace('ability:', ''));
      }
      return prev;
    });
  }, []);

  // Execute reload
  const executeReload = useCallback(() => {
    setGameState(prev => {
      if (!prev || !prev.activeUnitId) return prev;
      const unit = prev.units.find(u => u.id === prev.activeUnitId);
      if (!unit) return prev;

      const newUnits = prev.units.map(u =>
        u.id === unit.id ? { ...u, ammo: u.maxAmmo, actionPoints: u.actionPoints - 1 } : u
      );
      const newTimeline = advanceUnit(prev.timeline, unit.id, 'reload', unit.stats.speed);
      let logs = addLog(prev.combatLog, prev.turn, `${unit.name} reloaded.`, 'info');

      return checkAndAdvanceTurn({
        ...prev,
        units: newUnits,
        timeline: newTimeline,
        combatLog: logs,
        pendingPath: null,
        selectedAction: null,
        targetingMode: false,
      });
    });
  }, []);

  // Execute overwatch — #11: costs ALL AP and ends turn immediately
  const executeOverwatch = useCallback(() => {
    setGameState(prev => {
      if (!prev || !prev.activeUnitId) return prev;
      const unit = prev.units.find(u => u.id === prev.activeUnitId);
      if (!unit) return prev;

      const newUnits = prev.units.map(u =>
        u.id === unit.id ? { ...u, overwatching: true, actionPoints: 0 } : u
      );
      const newTimeline = advanceUnit(prev.timeline, unit.id, 'overwatch', unit.stats.speed);
      let logs = addLog(prev.combatLog, prev.turn, `${unit.name} consumed all AP to set up overwatch.`, 'info');

      return advanceTurn({
        ...prev,
        units: newUnits,
        timeline: newTimeline,
        combatLog: logs,
        pendingPath: null,
        selectedAction: null,
        targetingMode: false,
        movementRange: [],
        attackRange: [],
      });
    });
  }, []);

  // End turn manually
  const endTurn = useCallback(() => {
    setGameState(prev => {
      if (!prev || !prev.activeUnitId) return prev;
      const unit = prev.units.find(u => u.id === prev.activeUnitId);
      if (!unit) return prev;

      const newTimeline = advanceUnit(prev.timeline, unit.id, 'end_turn', unit.stats.speed);
      return advanceTurn({
        ...prev,
        timeline: newTimeline,
        selectedAction: null,
        targetingMode: false,
        movementRange: [],
        attackRange: [],
      });
    });
  }, []);

  // #13: Use combo ability — self-target auto-executes, single-target enters targeting mode
  const useCombo = useCallback((comboId: string) => {
    setGameState(prev => {
      if (!prev || !prev.momentum.comboAvailable) return prev;
      const ability = ABILITIES[comboId];
      if (!ability) return prev;

      // breach_assault is self-targeting: auto-execute, buff ALL alive player units
      if (comboId === 'breach_assault') {
        let logs = addLog(prev.combatLog, prev.turn, `COMBO: BREACH ASSAULT! All allies gain speed boost!`, 'momentum');
        const newUnits = prev.units.map(u => {
          if (u.faction === 'player' && u.alive) {
            return { ...u, statusEffects: [...u.statusEffects, { type: 'buff_speed' as const, duration: 1 }] };
          }
          return u;
        });
        const combatAnim: CombatAnimation = {
          type: 'buff',
          from: { ...prev.units.find(u => u.id === prev.activeUnitId)?.position || { x: 0, y: 0 } },
          to: { ...prev.units.find(u => u.id === prev.activeUnitId)?.position || { x: 0, y: 0 } },
          hit: true,
          damage: 0,
          critical: false,
          duration: 500,
        };
        return {
          ...prev,
          units: newUnits,
          momentum: consumeMomentum(prev.momentum),
          combatLog: logs,
          pendingCombatAnimation: combatAnim,
        };
      }

      // tactical_barrage / coordinated_strike: enter targeting mode
      const range = ability.range || 8;
      const inRange = getTilesInRange(
        prev.units.find(u => u.id === prev.activeUnitId)?.position || { x: 0, y: 0 },
        range,
        prev.grid
      );
      let logs = addLog(prev.combatLog, prev.turn, `COMBO: ${ability.name.toUpperCase()} — Select a target!`, 'momentum');
      return {
        ...prev,
        pendingCombo: comboId,
        targetingMode: true,
        movementRange: [],
        attackRange: inRange,
        combatLog: logs,
      };
    });
  }, []);

  // Clear pending path (called after animation completes)
  const clearPendingPath = useCallback(() => {
    setGameState(prev => prev ? { ...prev, pendingPath: null } : prev);
  }, []);

  // Clear pending combat animation (called after animation completes)
  const clearPendingCombatAnimation = useCallback(() => {
    setGameState(prev => prev ? { ...prev, pendingCombatAnimation: null } : prev);
  }, []);

  // Set hovered tile
  const setHoveredTile = useCallback((pos: Position | null) => {
    setGameState(prev => prev ? { ...prev, hoveredTile: pos } : prev);
  }, []);

  // Process AI turn
  useEffect(() => {
    if (!gameState || gameState.phase !== 'enemy_turn' || processingAI.current) return;
    // Wait for pending animations to complete before processing next AI action
    if (gameState.pendingPath || gameState.pendingCombatAnimation) return;
    processingAI.current = true;

    const timer = setTimeout(() => {
      setGameState(prev => {
        if (!prev) return prev;
        return processAITurn(prev, aiStatesRef.current);
      });
      processingAI.current = false;
    }, 800);

    return () => { clearTimeout(timer); processingAI.current = false; };
  }, [gameState?.phase, gameState?.activeUnitId, gameState?.pendingPath, gameState?.pendingCombatAnimation, gameState?.units.find(u => u.id === gameState?.activeUnitId)?.actionPoints]);

  return {
    gameState,
    initGame,
    selectAction,
    handleTileClick,
    executeReload,
    executeOverwatch,
    endTurn,
    useCombo,
    setHoveredTile,
    clearPendingPath,
    clearPendingCombatAnimation,
  };
}

// #13: Execute a targeted combo ability
function executeCombo(state: GameState, pos: Position, comboId: string): GameState {
  const ability = ABILITIES[comboId];
  if (!ability) return state;

  // Find enemy at position
  const targetTile = state.grid[pos.y]?.[pos.x];
  const defender = (targetTile?.occupantId
    ? state.units.find(u => u.id === targetTile.occupantId && u.alive && u.faction === 'enemy')
    : null)
    || state.units.find(u => u.alive && u.faction === 'enemy' && u.position.x === pos.x && u.position.y === pos.y);

  if (!defender) return state;

  const dmg = ability.damage || 0;
  const newHealth = Math.max(0, defender.stats.health - dmg);
  let newUnits = state.units.map(u => {
    if (u.id === defender.id) {
      return { ...u, stats: { ...u.stats, health: newHealth }, alive: newHealth > 0 };
    }
    return u;
  });

  let logs = addLog(state.combatLog, state.turn, `COMBO: ${ability.name} hit ${defender.name} for ${dmg} damage!`, 'damage');
  if (newHealth <= 0) {
    logs = addLog(logs, state.turn, `${defender.name} eliminated by combo!`, 'kill');
  }

  const combatAnim: CombatAnimation = {
    type: 'ability',
    from: { ...pos },
    to: { ...pos },
    hit: true,
    damage: dmg,
    critical: false,
    duration: 800,
    radius: 1,
  };

  let newGrid = state.grid.map(row => row.map(t => ({ ...t })));
  let timeline = state.timeline;
  let momentum = consumeMomentum(state.momentum);

  if (newHealth <= 0) {
    timeline = removeFromTimeline(timeline, defender.id);
    newGrid[defender.position.y][defender.position.x].occupied = false;
    newGrid[defender.position.y][defender.position.x].occupantId = undefined;
    momentum = applyMomentum(momentum, 'kill');
  }

  const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

  return checkAndAdvanceTurn({
    ...state,
    units: newUnits,
    grid: newGrid,
    timeline,
    momentum,
    visibility: unitVisibility,
    squadVisibility,
    combatLog: logs,
    pendingPath: null,
    pendingCombatAnimation: combatAnim,
    pendingCombo: null,
    selectedAction: null,
    targetingMode: false,
    movementRange: [],
    attackRange: [],
  });
}

// --- Internal state transitions ---
function executeMove(state: GameState, unit: Unit, pos: Position): GameState {
  const isReachable = state.movementRange.some(p => p.x === pos.x && p.y === pos.y);
  if (!isReachable) return state;

  const path = findPath(unit.position, pos, state.grid, unit.actionPoints);
  if (!path) return state;

  const tilesTraversed = path.length - 1; // first element is current position
  if (tilesTraversed <= 0) return state;

  // Determine facing from last movement step
  const lastStep = path[path.length - 1];
  const prevStep = path[path.length - 2];
  const newFacing = deltaToFacing(lastStep.x - prevStep.x, lastStep.y - prevStep.y);

  // Update grid occupancy
  const newGrid = state.grid.map(row => row.map(t => ({ ...t })));
  newGrid[unit.position.y][unit.position.x].occupied = false;
  newGrid[unit.position.y][unit.position.x].occupantId = undefined;
  newGrid[pos.y][pos.x].occupied = true;
  newGrid[pos.y][pos.x].occupantId = unit.id;

  const remainingAP = unit.actionPoints - tilesTraversed;

  const newUnits = state.units.map(u =>
    u.id === unit.id ? { ...u, position: pos, actionPoints: remainingAP, facing: newFacing } : u
  );

  const newTimeline = advanceUnit(state.timeline, unit.id, 'move', unit.stats.speed);

  // Recalculate visibility
  const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

  // Check hazard
  const movedUnit = newUnits.find(u => u.id === unit.id)!;
  const hazardDmg = checkHazardDamage(movedUnit, newGrid);

  let logs = state.combatLog;
  logs = addLog(logs, state.turn, `${unit.name} moved to (${pos.x}, ${pos.y}).`, 'movement');
  if (hazardDmg > 0) {
    logs = addLog(logs, state.turn, `${unit.name} took ${hazardDmg} hazard damage!`, 'environment');
  }

  return checkAndAdvanceTurn({
    ...state,
    units: newUnits,
    grid: newGrid,
    timeline: newTimeline,
    visibility: unitVisibility,
    squadVisibility,
    combatLog: logs,
    pendingPath: { unitId: unit.id, path },
    selectedAction: null,
    targetingMode: false,
    movementRange: [],
    attackRange: [],
  });
}

function executeShoot(state: GameState, attacker: Unit, pos: Position): GameState {
  const targetTile = state.grid[pos.y]?.[pos.x];
  if (!targetTile?.occupantId) {
    // Fallback: find enemy at position even if occupantId is missing (defensive against overlap)
    const fallbackTarget = state.units.find(
      u => u.alive && u.faction !== attacker.faction && u.position.x === pos.x && u.position.y === pos.y
    );
    if (fallbackTarget) {
      // Proceed with fallback target below
    } else if (targetTile?.destructible) {
      return executeShootTile(state, attacker, pos);
    } else {
      return state;
    }
  }

  const defender = state.units.find(u => u.id === targetTile.occupantId && u.alive)
    || state.units.find(u => u.alive && u.faction !== attacker.faction && u.position.x === pos.x && u.position.y === pos.y);
  if (!defender) return state;

  const weapon = WEAPONS[attacker.weaponId];
  if (!weapon || attacker.ammo <= 0) return state;
  if (getDistance(attacker.position, pos) > weapon.range) return state;
  if (!hasLineOfSight(attacker.position, pos, state.grid)) {
    const blockedBy = isSmokeBlocking(attacker.position, pos, state.grid) ? 'smoke' : 'an obstacle';
    const logs = addLog(state.combatLog, state.turn, `${attacker.name}'s line of sight blocked by ${blockedBy}!`, 'info');
    return { ...state, combatLog: logs };
  }

  const result = resolveAttack(attacker, defender, state.grid);

  const combatAnim: CombatAnimation = {
    type: 'projectile',
    from: { ...attacker.position },
    to: { ...defender.position },
    hit: result.hit,
    damage: result.damage,
    critical: result.critical,
    duration: 600,
  };

  // Phase 1c: Compute attack facing toward target
  const attackFacing = deltaToFacing(defender.position.x - attacker.position.x, defender.position.y - attacker.position.y);

  let newUnits = state.units.map(u => {
    if (u.id === attacker.id) return { ...u, ammo: u.ammo - 1, actionPoints: u.actionPoints - 1, facing: attackFacing };
    if (u.id === defender.id && result.hit) {
      const newHealth = Math.max(0, u.stats.health - result.damage);
      const newArmor = Math.max(0, u.stats.armor - Math.min(u.stats.armor, result.damage));
      return {
        ...u,
        stats: { ...u.stats, health: newHealth, armor: newArmor },
        alive: newHealth > 0,
      };
    }
    return u;
  });

  let momentum = state.momentum;
  let logs = state.combatLog;
  const newTimeline = advanceUnit(state.timeline, attacker.id, 'shoot', attacker.stats.speed);

  if (result.hit) {
    logs = addLog(logs, state.turn,
      `${attacker.name} hit ${defender.name} for ${result.damage} damage${result.critical ? ' (CRITICAL!)' : ''} [${Math.round(result.hitChance)}% chance]`,
      'damage');

    if (result.critical) momentum = applyMomentum(momentum, 'critical_hit');
    if (result.flanking) momentum = applyMomentum(momentum, 'flank');

    const killed = newUnits.find(u => u.id === defender.id);
    if (killed && !killed.alive) {
      logs = addLog(logs, state.turn, `${defender.name} eliminated!`, 'kill');
      momentum = applyMomentum(momentum, 'kill');
      // Remove from timeline
      const filteredTimeline = removeFromTimeline(newTimeline, defender.id);
      // Clear occupancy
      const newGrid = state.grid.map(row => row.map(t => ({ ...t })));
      newGrid[defender.position.y][defender.position.x].occupied = false;
      newGrid[defender.position.y][defender.position.x].occupantId = undefined;

      return checkAndAdvanceTurn({
        ...state,
        units: newUnits,
        grid: newGrid,
        timeline: filteredTimeline,
        momentum,
        combatLog: logs,
        pendingPath: null,
        pendingCombatAnimation: combatAnim,
        selectedAction: null,
        targetingMode: false,
        movementRange: [],
        attackRange: [],
      });
    }
  } else {
    logs = addLog(logs, state.turn, `${attacker.name} missed ${defender.name} [${Math.round(result.hitChance)}% chance]`, 'damage');
    if (attacker.faction === 'player') momentum = applyMomentum(momentum, 'miss');
  }

  return checkAndAdvanceTurn({
    ...state,
    units: newUnits,
    timeline: newTimeline,
    momentum,
    combatLog: logs,
    pendingPath: null,
    pendingCombatAnimation: combatAnim,
    selectedAction: null,
    targetingMode: false,
    movementRange: [],
    attackRange: [],
  });
}

function executeShootTile(state: GameState, attacker: Unit, pos: Position): GameState {
  const weapon = WEAPONS[attacker.weaponId];
  if (!weapon || attacker.ammo <= 0) return state;

  const newGrid = damageTile(state.grid, pos, weapon.damage, state.units);
  const newUnits = state.units.map(u =>
    u.id === attacker.id ? { ...u, ammo: u.ammo - 1, actionPoints: u.actionPoints - 1 } : u
  );
  const newTimeline = advanceUnit(state.timeline, attacker.id, 'shoot', attacker.stats.speed);
  let logs = addLog(state.combatLog, state.turn, `${attacker.name} shot at destructible object at (${pos.x}, ${pos.y}).`, 'environment');

  const tile = newGrid[pos.y][pos.x];
  let momentum = state.momentum;
  if (tile.type === 'floor' && state.grid[pos.y][pos.x].type !== 'floor') {
    logs = addLog(logs, state.turn, `Object destroyed at (${pos.x}, ${pos.y})!`, 'environment');
    momentum = applyMomentum(momentum, 'destroy_cover');
  }

  const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

  return checkAndAdvanceTurn({
    ...state,
    units: newUnits,
    grid: newGrid,
    timeline: newTimeline,
    momentum,
    visibility: unitVisibility,
    squadVisibility,
    combatLog: logs,
    pendingPath: null,
    selectedAction: null,
    targetingMode: false,
    movementRange: [],
    attackRange: [],
  });
}

function executeAbility(state: GameState, unit: Unit, pos: Position, abilityId: string): GameState {
  const ability = ABILITIES[abilityId];
  if (!ability) return state;
  if ((unit.abilityCooldowns[abilityId] || 0) > 0) return state;

  // #7: Range validation — prevent execution outside ability range
  if (ability.range && ability.targetType !== 'self') {
    if (getDistance(unit.position, pos) > ability.range) return state;
  }

  // Compute facing from caster to target
  const abilityFacing = deltaToFacing(pos.x - unit.position.x, pos.y - unit.position.y);

  let newUnits = state.units.map(u => {
    if (u.id === unit.id) {
      return {
        ...u,
        actionPoints: u.actionPoints - ability.cost,
        abilityCooldowns: { ...u.abilityCooldowns, [abilityId]: ability.cooldown },
        facing: abilityFacing,
      };
    }
    return u;
  });

  let logs = addLog(state.combatLog, state.turn, `${unit.name} used ${ability.name}!`, 'ability');
  let momentum = state.momentum;
  let newGrid = state.grid.map(row => row.map(t => ({ ...t })));
  let combatAnim: CombatAnimation | null = null;

  // --- Phase 3: Headshot special case ---
  if (abilityId === 'headshot') {
    const targetTile = state.grid[pos.y]?.[pos.x];
    const defender = (targetTile?.occupantId
      ? state.units.find(u => u.id === targetTile.occupantId && u.alive)
      : null)
      || state.units.find(u => u.alive && u.faction !== unit.faction && u.position.x === pos.x && u.position.y === pos.y);

    if (!defender) return state;
    if (!hasLineOfSight(unit.position, pos, state.grid)) return state;

    const result = resolveAttack(unit, defender, state.grid, ability.critBonus || 0);

    combatAnim = {
      type: 'projectile',
      from: { ...unit.position },
      to: { ...defender.position },
      hit: result.hit,
      damage: result.damage,
      critical: result.critical,
      duration: 600,
    };

    newUnits = newUnits.map(u => {
      if (u.id === defender.id && result.hit) {
        const newHealth = Math.max(0, u.stats.health - result.damage);
        const newArmor = Math.max(0, u.stats.armor - Math.min(u.stats.armor, result.damage));
        return { ...u, stats: { ...u.stats, health: newHealth, armor: newArmor }, alive: newHealth > 0 };
      }
      return u;
    });

    if (result.hit) {
      logs = addLog(logs, state.turn,
        `${unit.name} hit ${defender.name} for ${result.damage} damage${result.critical ? ' (CRITICAL!)' : ''} [${Math.round(result.hitChance)}% chance]`,
        'damage');
      if (result.critical) momentum = applyMomentum(momentum, 'critical_hit');
      if (result.flanking) momentum = applyMomentum(momentum, 'flank');

      const killed = newUnits.find(u => u.id === defender.id);
      if (killed && !killed.alive) {
        logs = addLog(logs, state.turn, `${defender.name} eliminated!`, 'kill');
        momentum = applyMomentum(momentum, 'kill');
        const newTimeline = removeFromTimeline(
          advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed),
          defender.id
        );
        newGrid[defender.position.y][defender.position.x].occupied = false;
        newGrid[defender.position.y][defender.position.x].occupantId = undefined;

        const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

        return checkAndAdvanceTurn({
          ...state,
          units: newUnits,
          grid: newGrid,
          timeline: newTimeline,
          momentum,
          visibility: unitVisibility,
          squadVisibility,
          combatLog: logs,
          pendingPath: null,
          pendingCombatAnimation: combatAnim,
          selectedAction: null,
          targetingMode: false,
          movementRange: [],
          attackRange: [],
        });
      }
    } else {
      logs = addLog(logs, state.turn, `${unit.name} missed ${defender.name} [${Math.round(result.hitChance)}% chance]`, 'damage');
      if (unit.faction === 'player') momentum = applyMomentum(momentum, 'miss');
    }

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

    return checkAndAdvanceTurn({
      ...state,
      units: newUnits,
      grid: newGrid,
      timeline: newTimeline,
      momentum,
      visibility: unitVisibility,
      squadVisibility,
      combatLog: logs,
      pendingPath: null,
      pendingCombatAnimation: combatAnim,
      selectedAction: null,
      targetingMode: false,
      movementRange: [],
      attackRange: [],
    });
  }

  // --- Phase 5b: Smoke Screen ---
  if (abilityId === 'smoke_screen') {
    const radius = ability.radius || 2;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const tx = pos.x + dx;
        const ty = pos.y + dy;
        if (newGrid[ty]?.[tx]) {
          newGrid[ty][tx] = { ...newGrid[ty][tx], smoke: 6 };
        }
      }
    }
    // Track as SmokeCloud for unified circle rendering
    const newSmokeClouds: SmokeCloud[] = [...state.smokeClouds, { center: { ...pos }, radius, turnsRemaining: 6 }];
    logs = addLog(logs, state.turn, `Smoke deployed at (${pos.x}, ${pos.y})!`, 'ability');

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

    return checkAndAdvanceTurn({
      ...state,
      units: newUnits,
      grid: newGrid,
      timeline: newTimeline,
      momentum,
      visibility: unitVisibility,
      squadVisibility,
      combatLog: logs,
      smokeClouds: newSmokeClouds,
      pendingPath: null,
      selectedAction: null,
      targetingMode: false,
      movementRange: [],
      attackRange: [],
    });
  }

  // --- Phase 6: Recon Drone — deploy persistent drone entity ---
  if (abilityId === 'recon_drone') {
    const radius = ability.radius || 3;
    const newSquadVis = { ...state.squadVisibility };
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const tx = pos.x + dx;
        const ty = pos.y + dy;
        if (tx >= 0 && tx < state.mapWidth && ty >= 0 && ty < state.mapHeight) {
          newSquadVis[`${tx},${ty}`] = 'visible';
        }
      }
    }

    // Deploy drone entity on the tile
    const drone: DeployedDrone = {
      id: `drone_${unit.id}_${Date.now()}`,
      position: { ...pos },
      ownerId: unit.id,
      radius,
      health: 30,
      maxHealth: 30,
      turnsRemaining: 5,
    };

    // Mark tile as occupied
    newGrid[pos.y][pos.x] = { ...newGrid[pos.y][pos.x], occupied: true };

    const droneAnim: CombatAnimation = {
      type: 'drone',
      from: { ...unit.position },
      to: { ...pos },
      hit: true,
      damage: 0,
      critical: false,
      duration: 600,
      radius: radius,
    };

    logs = addLog(logs, state.turn, `Recon drone deployed at (${pos.x}, ${pos.y}) for 5 turns!`, 'ability');

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

    return checkAndAdvanceTurn({
      ...state,
      units: newUnits,
      grid: newGrid,
      timeline: newTimeline,
      momentum,
      visibility: unitVisibility,
      squadVisibility: newSquadVis,
      combatLog: logs,
      drones: [...state.drones, drone],
      pendingPath: null,
      pendingCombatAnimation: droneAnim,
      selectedAction: null,
      targetingMode: false,
      movementRange: [],
      attackRange: [],
    });
  }

  // --- Phase 7b: Turret Deploy ---
  if (abilityId === 'turret_deploy') {
    const targetTile = newGrid[pos.y]?.[pos.x];
    if (!targetTile || targetTile.occupied || targetTile.blocksMovement) {
      return state; // Invalid placement
    }

    // Mark tile as occupied so units can't walk through
    newGrid[pos.y][pos.x] = { ...newGrid[pos.y][pos.x], occupied: true };

    const turret: DeployedTurret = {
      id: `turret_${unit.id}_${Date.now()}`,
      position: { ...pos },
      ownerId: unit.id,
      damage: 20,
      range: 3,
      health: 50,
      maxHealth: 50,
      turnsRemaining: 8,
    };

    logs = addLog(logs, state.turn, `Turret deployed at (${pos.x}, ${pos.y})!`, 'ability');

    // #4: Construction animation
    const constructionAnim: CombatAnimation = {
      type: 'construction',
      from: { ...unit.position },
      to: { ...pos },
      hit: true,
      damage: 0,
      critical: false,
      duration: 500,
    };

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

    return checkAndAdvanceTurn({
      ...state,
      units: newUnits,
      grid: newGrid,
      timeline: newTimeline,
      momentum,
      visibility: unitVisibility,
      squadVisibility,
      combatLog: logs,
      turrets: [...state.turrets, turret],
      pendingPath: null,
      pendingCombatAnimation: constructionAnim,
      selectedAction: null,
      targetingMode: false,
      movementRange: [],
      attackRange: [],
    });
  }

  // --- Flashbang animation (non-damaging AoE with effects) ---
  if (!ability.damage && ability.targetType === 'area' && ability.radius && ability.effects) {
    combatAnim = {
      type: 'flashbang',
      from: { ...pos },
      to: { ...pos },
      hit: true,
      damage: 0,
      critical: false,
      duration: 600,
      radius: ability.radius,
    };
  }

  // --- Golden Eagle: Unload all remaining ammo at target (multi-shot) ---
  if (abilityId === 'golden_eagle') {
    const targetTile = state.grid[pos.y]?.[pos.x];
    const defender = (targetTile?.occupantId
      ? state.units.find(u => u.id === targetTile.occupantId && u.alive)
      : null)
      || state.units.find(u => u.alive && u.faction !== unit.faction && u.position.x === pos.x && u.position.y === pos.y);

    if (!defender) return state;
    if (!hasLineOfSight(unit.position, pos, state.grid)) return state;

    const caster = newUnits.find(u => u.id === unit.id)!;
    const shotsToFire = Math.max(1, caster.ammo);
    const perShotDamages: number[] = [];
    let totalDamage = 0;

    for (let i = 0; i < shotsToFire; i++) {
      const targetUnit = newUnits.find(u => u.id === defender.id);
      if (!targetUnit || !targetUnit.alive) break;

      // Each shot does 5-10 damage, every shot hits
      const dmg = 5 + Math.floor(Math.random() * 6);
      perShotDamages.push(dmg);
      totalDamage += dmg;

      const idx = newUnits.findIndex(u => u.id === defender.id);
      const newHealth = Math.max(0, newUnits[idx].stats.health - dmg);
      const newArmor = Math.max(0, newUnits[idx].stats.armor - Math.min(newUnits[idx].stats.armor, dmg));
      newUnits[idx] = { ...newUnits[idx], stats: { ...newUnits[idx].stats, health: newHealth, armor: newArmor }, alive: newHealth > 0 };
    }

    // Consume all ammo
    newUnits = newUnits.map(u => u.id === unit.id ? { ...u, ammo: 0 } : u);

    combatAnim = {
      type: 'golden_eagle',
      from: { ...unit.position },
      to: { ...defender.position },
      hit: perShotDamages.length > 0,
      damage: totalDamage,
      critical: false,
      duration: 300 + shotsToFire * 200,
      shotCount: shotsToFire,
      perShotDamages,
      casterFacing: abilityFacing,
    };

    if (perShotDamages.length > 0) {
      logs = addLog(logs, state.turn,
        `${unit.name} unloaded ${shotsToFire} rounds at ${defender.name} — ${perShotDamages.length} hit for ${totalDamage} total damage`,
        'damage');

      // Intimidate proc
      if (Math.random() * 100 < 30) {
        const idx = newUnits.findIndex(u => u.id === defender.id);
        if (idx >= 0 && newUnits[idx].alive) {
          newUnits[idx] = { ...newUnits[idx], statusEffects: [...newUnits[idx].statusEffects, { type: 'intimidate', duration: 1 }] };
          logs = addLog(logs, state.turn, `${defender.name} is intimidated!`, 'status');
        }
      }

      const killed = newUnits.find(u => u.id === defender.id);
      if (killed && !killed.alive) {
        logs = addLog(logs, state.turn, `${defender.name} eliminated!`, 'kill');
        momentum = applyMomentum(momentum, 'kill');
        const newTimeline = removeFromTimeline(advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed), defender.id);
        newGrid[defender.position.y][defender.position.x].occupied = false;
        newGrid[defender.position.y][defender.position.x].occupantId = undefined;
        const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);
        return checkAndAdvanceTurn({
          ...state, units: newUnits, grid: newGrid, timeline: newTimeline, momentum,
          visibility: unitVisibility, squadVisibility, combatLog: logs,
          pendingPath: null, pendingCombatAnimation: combatAnim,
          selectedAction: null, targetingMode: false, movementRange: [], attackRange: [],
        });
      }
    } else {
      logs = addLog(logs, state.turn, `${unit.name} unloaded ${shotsToFire} rounds — no damage dealt!`, 'damage');
      if (unit.faction === 'player') momentum = applyMomentum(momentum, 'miss');
    }

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);
    return checkAndAdvanceTurn({
      ...state, units: newUnits, grid: newGrid, timeline: newTimeline, momentum,
      visibility: unitVisibility, squadVisibility, combatLog: logs,
      pendingPath: null, pendingCombatAnimation: combatAnim,
      selectedAction: null, targetingMode: false, movementRange: [], attackRange: [],
    });
  }

  // --- Reina Rally — elite ability, uses all AP ---
  if (abilityId === 'reina_rally' && ability.radius) {
    // Apply rally_ap to all nearby allies within radius
    for (const ally of newUnits) {
      if (!ally.alive || ally.faction !== unit.faction) continue;
      if (getDistance(unit.position, ally.position) <= ability.radius) {
        const allyIdx = newUnits.findIndex(u => u.id === ally.id);
        newUnits[allyIdx] = { ...newUnits[allyIdx], statusEffects: [...newUnits[allyIdx].statusEffects, { type: 'rally_ap', duration: 1 }] };
      }
    }
    logs = addLog(logs, state.turn, `${unit.name} rallied nearby allies! +2 AP next turn.`, 'ability');

    // Uses all remaining AP
    newUnits = newUnits.map(u => u.id === unit.id ? { ...u, actionPoints: 0 } : u);

    combatAnim = { type: 'reina_rally', from: { ...unit.position }, to: { ...unit.position }, hit: true, damage: 0, critical: false, duration: 6300 };

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);
    return checkAndAdvanceTurn({
      ...state, units: newUnits, grid: newGrid, timeline: newTimeline, momentum,
      visibility: unitVisibility, squadVisibility, combatLog: logs,
      pendingPath: null, pendingCombatAnimation: combatAnim,
      selectedAction: null, targetingMode: false, movementRange: [], attackRange: [],
    });
  }

  // --- Hack: IT Admin — purge debuffs from ally, grant accuracy buff ---
  if (abilityId === 'no_justin_it') {
    // Find ally at target position
    const ally = newUnits.find(u => u.alive && u.faction === 'player' && u.position.x === pos.x && u.position.y === pos.y && u.id !== unit.id);
    if (!ally) return state;

    const debuffTypes = ['debuff_speed', 'debuff_accuracy', 'suppression', 'poison', 'burn'];
    const allyIdx = newUnits.findIndex(u => u.id === ally.id);
    const cleansedEffects = newUnits[allyIdx].statusEffects.filter(e => !debuffTypes.includes(e.type));
    cleansedEffects.push({ type: 'buff_accuracy', duration: 2 });
    newUnits[allyIdx] = { ...newUnits[allyIdx], statusEffects: cleansedEffects };

    // Individual cooldown for IT Admin — uses all remaining AP
    newUnits = newUnits.map(u => u.id === unit.id ? {
      ...u, actionPoints: 0, abilityCooldowns: { ...u.abilityCooldowns, no_justin_it: 2 }
    } : u);

    logs = addLog(logs, state.turn, `${unit.name} purged debuffs from ${ally.name} and boosted accuracy!`, 'ability');
    combatAnim = { type: 'typing', from: { ...unit.position }, to: { ...unit.position }, hit: true, damage: 0, critical: false, duration: 4600 };

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);
    return checkAndAdvanceTurn({
      ...state, units: newUnits, grid: newGrid, timeline: newTimeline, momentum,
      visibility: unitVisibility, squadVisibility, combatLog: logs,
      pendingPath: null, pendingCombatAnimation: combatAnim,
      selectedAction: null, targetingMode: false, movementRange: [], attackRange: [],
    });
  }

  // --- Hack: Security — reveal all enemies + evasion buff ---
  if (abilityId === 'no_justin_security') {
    const newSquadVis = { ...state.squadVisibility };
    // Reveal all enemy positions
    for (const enemy of newUnits.filter(u => u.faction === 'enemy' && u.alive)) {
      newSquadVis[`${enemy.position.x},${enemy.position.y}`] = 'visible';
    }
    // Apply buff_speed to all alive allies
    newUnits = newUnits.map(u => {
      if (u.faction === 'player' && u.alive) {
        return { ...u, statusEffects: [...u.statusEffects, { type: 'buff_speed' as const, duration: 2 }] };
      }
      return u;
    });
    // Individual cooldown for Security — uses all remaining AP
    newUnits = newUnits.map(u => u.id === unit.id ? {
      ...u, actionPoints: 0, abilityCooldowns: { ...u.abilityCooldowns, no_justin_security: 3 }
    } : u);

    logs = addLog(logs, state.turn, `${unit.name} hacked security systems! All enemies revealed, allies gain evasion!`, 'ability');
    combatAnim = { type: 'typing', from: { ...unit.position }, to: { ...unit.position }, hit: true, damage: 0, critical: false, duration: 4600 };

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);
    return checkAndAdvanceTurn({
      ...state, units: newUnits, grid: newGrid, timeline: newTimeline, momentum,
      visibility: unitVisibility, squadVisibility: newSquadVis, combatLog: logs,
      pendingPath: null, pendingCombatAnimation: combatAnim,
      selectedAction: null, targetingMode: false, movementRange: [], attackRange: [],
    });
  }

  // --- Hack: Payroll — heal entire squad 15% max HP ---
  if (abilityId === 'no_justin_payroll') {
    newUnits = newUnits.map(u => {
      if (u.faction === 'player' && u.alive) {
        const healAmount = Math.floor(u.stats.maxHealth * 0.15);
        const newHealth = Math.min(u.stats.maxHealth, u.stats.health + healAmount);
        return { ...u, stats: { ...u.stats, health: newHealth } };
      }
      return u;
    });
    // Individual cooldown for Payroll — uses all remaining AP
    newUnits = newUnits.map(u => u.id === unit.id ? {
      ...u, actionPoints: 0, abilityCooldowns: { ...u.abilityCooldowns, no_justin_payroll: 2 }
    } : u);

    logs = addLog(logs, state.turn, `${unit.name} processed payroll! Entire squad healed 15% HP!`, 'ability');
    combatAnim = { type: 'typing', from: { ...unit.position }, to: { ...unit.position }, hit: true, damage: 0, critical: false, duration: 4600 };

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);
    return checkAndAdvanceTurn({
      ...state, units: newUnits, grid: newGrid, timeline: newTimeline, momentum,
      visibility: unitVisibility, squadVisibility, combatLog: logs,
      pendingPath: null, pendingCombatAnimation: combatAnim,
      selectedAction: null, targetingMode: false, movementRange: [], attackRange: [],
    });
  }

  // --- Hack: Great Firewall — stun mechanical enemies, debuff all human enemies ---
  if (abilityId === 'great_firewall') {
    // Stun deployed turrets/drones (reduce turnsRemaining by 2)
    const newTurrets = state.turrets.map(t => ({ ...t, turnsRemaining: Math.max(0, t.turnsRemaining - 2) }));
    const newDrones = state.drones.map(d => ({ ...d, turnsRemaining: Math.max(0, d.turnsRemaining - 2) }));

    // Apply debuff_speed + debuff_accuracy to all alive enemy units
    newUnits = newUnits.map(u => {
      if (u.faction === 'enemy' && u.alive) {
        return {
          ...u, statusEffects: [
            ...u.statusEffects,
            { type: 'debuff_speed' as const, duration: 2 },
            { type: 'debuff_accuracy' as const, duration: 2 },
          ]
        };
      }
      return u;
    });

    // Great Firewall uses all remaining AP
    newUnits = newUnits.map(u => u.id === unit.id ? { ...u, actionPoints: 0 } : u);

    logs = addLog(logs, state.turn, `${unit.name} activated Hack: Great Firewall! All enemies debuffed.`, 'ability');
    combatAnim = { type: 'typing', from: { ...unit.position }, to: { ...unit.position }, hit: true, damage: 0, critical: false, duration: 4600 };

    const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
    const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);
    return checkAndAdvanceTurn({
      ...state, units: newUnits, grid: newGrid, timeline: newTimeline, momentum,
      visibility: unitVisibility, squadVisibility, combatLog: logs,
      turrets: newTurrets, drones: newDrones,
      pendingPath: null, pendingCombatAnimation: combatAnim,
      selectedAction: null, targetingMode: false, movementRange: [], attackRange: [],
    });
  }

  // --- Default ability logic: AoE damage ---
  if (ability.damage && ability.targetType === 'area' && ability.radius) {
    // Create explosion animation for AoE damage abilities
    combatAnim = {
      type: 'ability',
      from: { ...pos },
      to: { ...pos },
      hit: true,
      damage: ability.damage,
      critical: false,
      duration: 800,
      radius: ability.radius,
    };

    for (const target of newUnits) {
      if (!target.alive) continue;
      const dist = getDistance(pos, target.position);
      if (dist <= ability.radius) {
        const newHealth = Math.max(0, target.stats.health - ability.damage);
        const idx = newUnits.findIndex(u => u.id === target.id);
        newUnits[idx] = { ...newUnits[idx], stats: { ...newUnits[idx].stats, health: newHealth }, alive: newHealth > 0 };
        logs = addLog(logs, state.turn, `${target.name} took ${ability.damage} ability damage!`, 'damage');
        if (newHealth <= 0) {
          logs = addLog(logs, state.turn, `${target.name} eliminated!`, 'kill');
          if (target.faction === 'enemy') momentum = applyMomentum(momentum, 'kill');
        }
      }
    }
  }

  // Apply status effects
  if (ability.effects) {
    for (const effect of ability.effects) {
      if (ability.targetType === 'area' && ability.radius) {
        for (const target of newUnits) {
          if (!target.alive) continue;
          if (getDistance(pos, target.position) <= ability.radius) {
            // Skip opposing faction for buff abilities
            if (ability.type === 'buff' && target.faction !== unit.faction) continue;
            const chanceRoll = effect.chance != null ? Math.random() * 100 < effect.chance : true;
            if (!chanceRoll) continue;
            const idx = newUnits.findIndex(u => u.id === target.id);
            const newEffects = [...newUnits[idx].statusEffects, { type: effect.status, duration: effect.duration }];
            newUnits[idx] = { ...newUnits[idx], statusEffects: newEffects };
          }
        }
      } else if (ability.targetType === 'self') {
        // #11: reina_rally applies rally_ap to nearby allies within radius, not just caster
        if (abilityId === 'reina_rally' && ability.radius) {
          for (const ally of newUnits) {
            if (!ally.alive || ally.faction !== unit.faction) continue;
            if (getDistance(unit.position, ally.position) <= ability.radius) {
              const allyIdx = newUnits.findIndex(u => u.id === ally.id);
              newUnits[allyIdx] = { ...newUnits[allyIdx], statusEffects: [...newUnits[allyIdx].statusEffects, { type: effect.status, duration: effect.duration }] };
            }
          }
          logs = addLog(logs, state.turn, `${unit.name} rallied nearby allies! +2 AP next turn.`, 'status');
        } else {
          const idx = newUnits.findIndex(u => u.id === unit.id);
          const newEffects = [...newUnits[idx].statusEffects, { type: effect.status, duration: effect.duration }];
          newUnits[idx] = { ...newUnits[idx], statusEffects: newEffects };
          // #1: Descriptive log for self-target buffs
          if (effect.status === 'buff_speed') {
            logs = addLog(logs, state.turn, `${unit.name} injected stimulant — speed boost for ${effect.duration} turns!`, 'status');
          }
        }
      }
    }
  }

  // Buff animation for self-targeting abilities
  if (ability.targetType === 'self' && ability.effects && !combatAnim) {
    combatAnim = {
      type: abilityId === 'adrenal_boost' ? 'stimulant' : 'buff',
      from: { ...unit.position },
      to: { ...unit.position },
      hit: true,
      damage: 0,
      critical: false,
      duration: 500,
    };
  }

  const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
  const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

  return checkAndAdvanceTurn({
    ...state,
    units: newUnits,
    grid: newGrid,
    timeline: newTimeline,
    momentum,
    visibility: unitVisibility,
    squadVisibility,
    combatLog: logs,
    pendingPath: null,
    pendingCombatAnimation: combatAnim,
    selectedAction: null,
    targetingMode: false,
    movementRange: [],
    attackRange: [],
  });
}

function checkAndAdvanceTurn(state: GameState): GameState {
  // #14: Check win/loss BEFORE AP check — kills should trigger victory immediately
  const playerAlive = state.units.filter(u => u.faction === 'player' && u.alive);
  const enemyAlive = state.units.filter(u => u.faction === 'enemy' && u.alive);
  if (enemyAlive.length === 0) {
    return {
      ...state,
      phase: 'victory',
      combatLog: addLog(state.combatLog, state.turn, 'MISSION COMPLETE - All hostiles eliminated!', 'info'),
    };
  }
  if (playerAlive.length === 0) {
    return {
      ...state,
      phase: 'defeat',
      combatLog: addLog(state.combatLog, state.turn, 'MISSION FAILED - All operatives down.', 'info'),
    };
  }

  const activeUnit = state.units.find(u => u.id === state.activeUnitId);
  if (activeUnit && activeUnit.actionPoints > 0) {
    // Unit still has AP remaining - keep the same active unit, reset UI
    return {
      ...state,
      selectedAction: null,
      targetingMode: false,
      movementRange: [],
      attackRange: [],
    };
  }
  return advanceTurn(state);
}

function advanceTurn(state: GameState, recursionDepth: number = 0): GameState {
  // Recursion guard to prevent infinite loops if all units are stunned
  if (recursionDepth >= 10) return state;

  // Check win/lose conditions
  const playerAlive = state.units.filter(u => u.faction === 'player' && u.alive);
  const enemyAlive = state.units.filter(u => u.faction === 'enemy' && u.alive);

  if (enemyAlive.length === 0) {
    return {
      ...state,
      phase: 'victory',
      combatLog: addLog(state.combatLog, state.turn, 'MISSION COMPLETE - All hostiles eliminated!', 'info'),
    };
  }
  if (playerAlive.length === 0) {
    return {
      ...state,
      phase: 'defeat',
      combatLog: addLog(state.combatLog, state.turn, 'MISSION FAILED - All operatives down.', 'info'),
    };
  }

  // Clean dead units from timeline
  let timeline = state.timeline.filter(e => {
    const unit = state.units.find(u => u.id === e.unitId);
    return unit?.alive;
  });

  // Get next unit
  const nextId = getNextUnit(timeline);
  if (!nextId) return { ...state, phase: 'victory' };

  const nextUnit = state.units.find(u => u.id === nextId);
  if (!nextUnit) return state;

  // Phase 2: Check if next unit is stunned or intimidated BEFORE ticking effects
  const isStunned = nextUnit.statusEffects.some(e => e.type === 'stun' || e.type === 'intimidate');
  const stunType = nextUnit.statusEffects.find(e => e.type === 'stun' || e.type === 'intimidate')?.type;
  const hasRallyAP = nextUnit.statusEffects.some(e => e.type === 'rally_ap');

  // Tick status effects and build new units
  let newGrid = state.grid.map(row => row.map(t => ({ ...t })));

  // Phase 5b: Tick smoke — decrement all smoke timers
  for (let y = 0; y < state.mapHeight; y++) {
    for (let x = 0; x < state.mapWidth; x++) {
      if (newGrid[y][x].smoke && newGrid[y][x].smoke! > 0) {
        const newSmoke = newGrid[y][x].smoke! - 1;
        newGrid[y][x] = { ...newGrid[y][x], smoke: newSmoke > 0 ? newSmoke : undefined };
      }
    }
  }

  // Tick smoke clouds
  const smokeClouds = state.smokeClouds
    .map(c => ({ ...c, turnsRemaining: c.turnsRemaining - 1 }))
    .filter(c => c.turnsRemaining > 0);

  // Logs for expiry notifications (declared early so turret/drone expiry can append)
  let logs = state.combatLog;

  // Phase 7d: Tick turrets — decrement turnsRemaining, remove expired
  let turrets = state.turrets.map(t => ({ ...t, turnsRemaining: t.turnsRemaining - 1 }));
  const expiredTurrets = turrets.filter(t => t.turnsRemaining <= 0);
  turrets = turrets.filter(t => t.turnsRemaining > 0);
  // Clear tile occupancy for expired turrets
  for (const t of expiredTurrets) {
    if (newGrid[t.position.y]?.[t.position.x]) {
      // Only clear occupancy if no unit is actually there
      const unitOnTile = state.units.find(u => u.alive && u.position.x === t.position.x && u.position.y === t.position.y);
      if (!unitOnTile) {
        newGrid[t.position.y][t.position.x] = { ...newGrid[t.position.y][t.position.x], occupied: false, occupantId: undefined };
      }
    }
    logs = addLog(logs, state.turn, 'Turret expired.', 'info');
  }

  // #7: Tick drones — decrement turnsRemaining, remove expired
  let drones = state.drones.map(d => ({ ...d, turnsRemaining: d.turnsRemaining - 1 }));
  const expiredDrones = drones.filter(d => d.turnsRemaining <= 0);
  drones = drones.filter(d => d.turnsRemaining > 0);
  // Clear tile occupancy for expired drones
  for (const d of expiredDrones) {
    if (newGrid[d.position.y]?.[d.position.x]) {
      const unitOnTile = state.units.find(u => u.alive && u.position.x === d.position.x && u.position.y === d.position.y);
      if (!unitOnTile) {
        newGrid[d.position.y][d.position.x] = { ...newGrid[d.position.y][d.position.x], occupied: false, occupantId: undefined };
      }
    }
    logs = addLog(logs, state.turn, 'Recon drone expired.', 'info');
  }

  const newUnits = state.units.map(u => {
    if (u.id === nextId) {
      const updated = {
        ...u,
        // Phase 2: If stunned, set AP to 0 instead of max; rally_ap grants +2
        actionPoints: isStunned ? 0 : u.maxActionPoints + (hasRallyAP ? 2 : 0),
        overwatching: false,
      };
      // Reduce cooldowns
      const newCooldowns: Record<string, number> = {};
      for (const [key, val] of Object.entries(updated.abilityCooldowns)) {
        if (val > 0) newCooldowns[key] = val - 1;
      }
      updated.abilityCooldowns = newCooldowns;
      // Tick status effects (removes stun after it takes effect)
      updated.statusEffects = updated.statusEffects
        .map(e => ({ ...e, duration: e.duration - 1 }))
        .filter(e => e.duration > 0);
      return updated;
    }
    return u;
  });

  const phase: GamePhase = nextUnit.faction === 'player' ? 'player_turn' : 'enemy_turn';

  // Phase 2: If stunned/intimidated, skip this unit's turn
  if (isStunned) {
    const stunMsg = stunType === 'intimidate' ? `${nextUnit.name} is intimidated!` : `${nextUnit.name} is stunned!`;
    logs = addLog(logs, state.turn, stunMsg, 'status');
    const advancedTimeline = advanceUnit(timeline, nextId, 'end_turn', nextUnit.stats.speed);
    return advanceTurn({
      ...state,
      units: newUnits,
      grid: newGrid,
      timeline: advancedTimeline,
      turrets,
      drones,
      smokeClouds,
      combatLog: logs,
      turn: state.turn + 1,
    }, recursionDepth + 1);
  }

  return {
    ...state,
    units: newUnits,
    grid: newGrid,
    timeline,
    turrets,
    drones,
    smokeClouds,
    activeUnitId: nextId,
    phase,
    turn: state.turn + 1,
    combatLog: logs,
  };
}

function processAITurn(state: GameState, aiStates: Map<string, AIState>): GameState {
  const enemy = state.units.find(u => u.id === state.activeUnitId);
  if (!enemy || enemy.faction !== 'player') {
    // It's an enemy - process AI
    if (!enemy || !enemy.alive) return advanceTurn(state);

    const playerUnits = state.units.filter(u => u.faction === 'player' && u.alive);
    const enemyUnits = state.units.filter(u => u.faction === 'enemy' && u.alive);

    // Update awareness
    let aiState = aiStates.get(enemy.id) || createAIState();
    aiState = updateAwareness(enemy, aiState, playerUnits, state.grid);
    aiStates.set(enemy.id, aiState);

    // #10: Pass turrets and drones to AI decision making
    const action = decideAction(enemy, aiState, playerUnits, enemyUnits, state.grid, state.turrets, state.drones);

    // Execute action
    let newState = executeAIAction(state, enemy, action, aiStates);

    // #12: After AI move action, check turrets for firing (pass movedEnemyId only for moves)
    const movedEnemyId = action.type === 'move' ? enemy.id : undefined;
    newState = processTurretFiring(newState, movedEnemyId);

    return newState;
  }

  return state;
}

// Phase 7c: Turret firing logic — #12: Only fire at the enemy that just moved, damage 5-15
function processTurretFiring(state: GameState, movedEnemyId?: string): GameState {
  if (state.turrets.length === 0) return state;
  // Don't fire if there's already a pending animation
  if (state.pendingCombatAnimation) return state;
  // #12: Only fire when an enemy actually moved
  if (!movedEnemyId) return state;

  let logs = state.combatLog;
  let newUnits = [...state.units];

  for (const turret of state.turrets) {
    // #12: Only target the enemy that just moved
    const movedEnemy = newUnits.find(u => u.id === movedEnemyId && u.faction === 'enemy' && u.alive);
    if (!movedEnemy) continue;

    const dist = getDistance(turret.position, movedEnemy.position);
    if (dist > turret.range) continue;
    if (!hasLineOfSight(turret.position, movedEnemy.position, state.grid)) continue;

    // #12: Random damage 5-15
    const dmg = Math.floor(Math.random() * 11) + 5;
    const newHealth = Math.max(0, movedEnemy.stats.health - dmg);
    newUnits = newUnits.map(u => {
      if (u.id === movedEnemy.id) {
        return { ...u, stats: { ...u.stats, health: newHealth }, alive: newHealth > 0 };
      }
      return u;
    });

    logs = addLog(logs, state.turn, `Turret hit ${movedEnemy.name} for ${dmg} damage!`, 'damage');
    if (newHealth <= 0) {
      logs = addLog(logs, state.turn, `${movedEnemy.name} eliminated by turret!`, 'kill');
    }

    const combatAnim: CombatAnimation = {
      type: 'projectile',
      from: { ...turret.position },
      to: { ...movedEnemy.position },
      hit: true,
      damage: dmg,
      critical: false,
      duration: 400,
    };

    return { ...state, units: newUnits, combatLog: logs, pendingCombatAnimation: combatAnim };
  }

  return { ...state, units: newUnits, combatLog: logs };
}

function executeAIAction(state: GameState, enemy: Unit, action: AIAction, aiStates: Map<string, AIState>): GameState {
  let logs = state.combatLog;

  switch (action.type) {
    case 'move': {
      if (!action.targetPosition) break;

      // Calculate path and AP cost
      const path = action.path || findPath(enemy.position, action.targetPosition, state.grid, enemy.actionPoints);
      if (!path || path.length <= 1) break;

      const tilesTraversed = path.length - 1;
      const dest = path[path.length - 1];

      // Guard: abort move if destination is already occupied
      if (state.grid[dest.y][dest.x].occupied) break;

      // Determine facing from last step
      const lastStep = path[path.length - 1];
      const prevStep = path[path.length - 2];
      const newFacing = deltaToFacing(lastStep.x - prevStep.x, lastStep.y - prevStep.y);

      const newGrid = state.grid.map(row => row.map(t => ({ ...t })));
      newGrid[enemy.position.y][enemy.position.x].occupied = false;
      newGrid[enemy.position.y][enemy.position.x].occupantId = undefined;
      newGrid[dest.y][dest.x].occupied = true;
      newGrid[dest.y][dest.x].occupantId = enemy.id;

      const newUnits = state.units.map(u =>
        u.id === enemy.id ? { ...u, position: dest, actionPoints: u.actionPoints - tilesTraversed, facing: newFacing } : u
      );

      const newTimeline = advanceUnit(state.timeline, enemy.id, 'move', enemy.stats.speed);
      const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

      const aiState = aiStates.get(enemy.id);
      const awareness = aiState?.awareness || 'unaware';
      if (awareness !== 'unaware') {
        logs = addLog(logs, state.turn, `${enemy.name} moved.`, 'movement');
      }

      return checkAndAdvanceTurn({
        ...state, units: newUnits, grid: newGrid, timeline: newTimeline,
        visibility: unitVisibility, squadVisibility, combatLog: logs,
        pendingPath: { unitId: enemy.id, path },
      });
    }

    case 'attack': {
      // #7: Handle drone targeting
      if (action.targetUnitId?.startsWith('drone:')) {
        const droneId = action.targetUnitId.replace('drone:', '');
        const drone = state.drones.find(d => d.id === droneId);
        if (!drone) break;

        const weapon = WEAPONS[enemy.weaponId];
        const dmg = weapon ? weapon.damage : 15;
        const newDroneHealth = Math.max(0, drone.health - dmg);

        let newDrones = state.drones.map(d =>
          d.id === droneId ? { ...d, health: newDroneHealth } : d
        );

        logs = addLog(logs, state.turn, `${enemy.name} attacked recon drone for ${dmg} damage!`, 'damage');

        const newGrid = state.grid.map(row => row.map(t => ({ ...t })));
        if (newDroneHealth <= 0) {
          newDrones = newDrones.filter(d => d.id !== droneId);
          logs = addLog(logs, state.turn, `Recon drone destroyed!`, 'kill');
          const unitOnTile = state.units.find(u => u.alive && u.position.x === drone.position.x && u.position.y === drone.position.y);
          if (!unitOnTile) {
            newGrid[drone.position.y][drone.position.x].occupied = false;
            newGrid[drone.position.y][drone.position.x].occupantId = undefined;
          }
        }

        const droneCombatAnim: CombatAnimation = {
          type: 'projectile',
          from: { ...enemy.position },
          to: { ...drone.position },
          hit: true,
          damage: dmg,
          critical: false,
          duration: 600,
        };

        const newUnits = state.units.map(u =>
          u.id === enemy.id ? { ...u, ammo: u.ammo - 1, actionPoints: u.actionPoints - 1 } : u
        );
        const newTimeline = advanceUnit(state.timeline, enemy.id, 'shoot', enemy.stats.speed);

        return checkAndAdvanceTurn({
          ...state, units: newUnits, grid: newGrid, timeline: newTimeline,
          drones: newDrones, combatLog: logs,
          pendingPath: null, pendingCombatAnimation: droneCombatAnim,
        });
      }

      // #10: Handle turret targeting
      if (action.targetUnitId?.startsWith('turret:')) {
        const turretId = action.targetUnitId.replace('turret:', '');
        const turret = state.turrets.find(t => t.id === turretId);
        if (!turret) break;

        const weapon = WEAPONS[enemy.weaponId];
        const dmg = weapon ? weapon.damage : 15;
        const newTurretHealth = Math.max(0, turret.health - dmg);

        let newTurrets = state.turrets.map(t =>
          t.id === turretId ? { ...t, health: newTurretHealth } : t
        );

        logs = addLog(logs, state.turn, `${enemy.name} attacked turret for ${dmg} damage!`, 'damage');

        const newGrid = state.grid.map(row => row.map(t => ({ ...t })));
        if (newTurretHealth <= 0) {
          newTurrets = newTurrets.filter(t => t.id !== turretId);
          logs = addLog(logs, state.turn, `Turret destroyed!`, 'kill');
          // Clear tile occupancy
          const unitOnTile = state.units.find(u => u.alive && u.position.x === turret.position.x && u.position.y === turret.position.y);
          if (!unitOnTile) {
            newGrid[turret.position.y][turret.position.x].occupied = false;
            newGrid[turret.position.y][turret.position.x].occupantId = undefined;
          }
        }

        const turretCombatAnim: CombatAnimation = {
          type: 'projectile',
          from: { ...enemy.position },
          to: { ...turret.position },
          hit: true,
          damage: dmg,
          critical: false,
          duration: 600,
        };

        const newUnits = state.units.map(u =>
          u.id === enemy.id ? { ...u, ammo: u.ammo - 1, actionPoints: u.actionPoints - 1 } : u
        );
        const newTimeline = advanceUnit(state.timeline, enemy.id, 'shoot', enemy.stats.speed);

        return checkAndAdvanceTurn({
          ...state, units: newUnits, grid: newGrid, timeline: newTimeline,
          turrets: newTurrets, combatLog: logs,
          pendingPath: null, pendingCombatAnimation: turretCombatAnim,
        });
      }

      const target = state.units.find(u => u.id === action.targetUnitId && u.alive);
      if (!target) break;

      // Phase 1c: Compute attack facing toward target
      const attackFacing = deltaToFacing(target.position.x - enemy.position.x, target.position.y - enemy.position.y);

      const result = resolveAttack(enemy, target, state.grid);

      const aiCombatAnim: CombatAnimation = {
        type: 'projectile',
        from: { ...enemy.position },
        to: { ...target.position },
        hit: result.hit,
        damage: result.damage,
        critical: result.critical,
        duration: 600,
      };

      let newUnits = state.units.map(u => {
        if (u.id === enemy.id) return { ...u, ammo: u.ammo - 1, actionPoints: u.actionPoints - 1, facing: attackFacing };
        if (u.id === target.id && result.hit) {
          const newHealth = Math.max(0, u.stats.health - result.damage);
          return { ...u, stats: { ...u.stats, health: newHealth }, alive: newHealth > 0 };
        }
        return u;
      });

      const newTimeline = advanceUnit(state.timeline, enemy.id, 'shoot', enemy.stats.speed);

      if (result.hit) {
        logs = addLog(logs, state.turn,
          `${enemy.name} hit ${target.name} for ${result.damage} damage${result.critical ? ' (CRITICAL!)' : ''}`,
          'damage');
        const killed = newUnits.find(u => u.id === target.id);
        if (killed && !killed.alive) {
          logs = addLog(logs, state.turn, `${target.name} is down!`, 'kill');
        }
      } else {
        logs = addLog(logs, state.turn, `${enemy.name} missed ${target.name}.`, 'damage');
      }

      // Alert nearby enemies
      alertNearbyEnemies(enemy, state.units.filter(u => u.faction === 'enemy'), aiStates);

      return checkAndAdvanceTurn({ ...state, units: newUnits, timeline: newTimeline, combatLog: logs, pendingPath: null, pendingCombatAnimation: aiCombatAnim });
    }

    case 'ability': {
      if (!action.abilityId) break;
      const ability = ABILITIES[action.abilityId];
      if (!ability) break;

      logs = addLog(logs, state.turn, `${enemy.name} used ${ability.name}!`, 'ability');
      const newTimeline = advanceUnit(state.timeline, enemy.id, 'ability', enemy.stats.speed);

      let newUnits = state.units.map(u => {
        if (u.id === enemy.id) {
          return { ...u, actionPoints: u.actionPoints - ability.cost, abilityCooldowns: { ...u.abilityCooldowns, [action.abilityId!]: ability.cooldown } };
        }
        return u;
      });

      // Apply effects
      if (ability.effects && action.targetUnitId) {
        const target = newUnits.find(u => u.id === action.targetUnitId);
        if (target) {
          for (const eff of ability.effects) {
            const idx = newUnits.findIndex(u => u.id === target.id);
            newUnits[idx] = {
              ...newUnits[idx],
              statusEffects: [...newUnits[idx].statusEffects, { type: eff.status, duration: eff.duration }],
            };
          }
        }
      }

      return checkAndAdvanceTurn({ ...state, units: newUnits, timeline: newTimeline, combatLog: logs, pendingPath: null });
    }

    default:
      break;
  }

  // Idle or failed action - just advance
  const newTimeline = advanceUnit(state.timeline, enemy.id, 'end_turn', enemy.stats.speed);
  return advanceTurn({ ...state, timeline: newTimeline, combatLog: logs, pendingPath: null });
}
