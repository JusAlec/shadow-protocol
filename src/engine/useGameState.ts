// ============================================================
// Shadow Protocol - Game State Manager (React Hook)
// ============================================================
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  GameState, GamePhase, Unit, Position, TileData, CombatLogEntry,
  MomentumEvent, TimelineEntry
} from '../types';
import { eventBus } from '../events';
import { generateDemoMap, getDemoSpawns } from '../data/maps';
import { createOperative, createEnemy } from '../data/operatives';
import { WEAPONS } from '../data/weapons';
import { ABILITIES } from '../data/abilities';
import {
  resolveAttack, applyDamage, applyStatusEffect, tickStatusEffects,
  calculateHitChance, getDistance
} from '../systems/combat';
import { calculateSquadVisibility, hasLineOfSight } from '../systems/visibility';
import { getReachableTiles, findPath, getTilesInRange } from '../systems/pathfinding';
import { initializeTimeline, advanceUnit, removeFromTimeline, getNextUnit, sortTimeline } from '../systems/initiative';
import { createMomentumState, applyMomentum, consumeMomentum } from '../systems/momentum';
import { checkHazardDamage, damageTile } from '../systems/environment';
import {
  createAIState, updateAwareness, decideAction, alertNearbyEnemies,
  AIAction, AIState
} from '../systems/ai';

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
        const reachable = getReachableTiles(unit.position, unit.stats.movement, prev.grid);
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
        const range = ability.range || 1;
        const inRange = getTilesInRange(unit.position, range, prev.grid);
        return { ...prev, selectedAction: action, targetingMode: true, movementRange: [], attackRange: inRange };
      }
      return { ...prev, selectedAction: null, targetingMode: false, movementRange: [], attackRange: [] };
    });
  }, []);

  // Execute tile click
  const handleTileClick = useCallback((pos: Position) => {
    setGameState(prev => {
      if (!prev || !prev.activeUnitId || prev.phase !== 'player_turn') return prev;
      const unit = prev.units.find(u => u.id === prev.activeUnitId);
      if (!unit || unit.faction !== 'player') return prev;

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

      return advanceTurn({
        ...prev,
        units: newUnits,
        timeline: newTimeline,
        combatLog: logs,
        selectedAction: null,
        targetingMode: false,
      });
    });
  }, []);

  // Execute overwatch
  const executeOverwatch = useCallback(() => {
    setGameState(prev => {
      if (!prev || !prev.activeUnitId) return prev;
      const unit = prev.units.find(u => u.id === prev.activeUnitId);
      if (!unit) return prev;

      const newUnits = prev.units.map(u =>
        u.id === unit.id ? { ...u, overwatching: true, actionPoints: u.actionPoints - 1 } : u
      );
      const newTimeline = advanceUnit(prev.timeline, unit.id, 'overwatch', unit.stats.speed);
      let logs = addLog(prev.combatLog, prev.turn, `${unit.name} set up overwatch.`, 'info');

      return advanceTurn({
        ...prev,
        units: newUnits,
        timeline: newTimeline,
        combatLog: logs,
        selectedAction: null,
        targetingMode: false,
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

  // Use combo ability
  const useCombo = useCallback((comboId: string) => {
    setGameState(prev => {
      if (!prev || !prev.momentum.comboAvailable) return prev;
      let logs = addLog(prev.combatLog, prev.turn, `COMBO: ${comboId.replace(/_/g, ' ').toUpperCase()}!`, 'momentum');
      return { ...prev, momentum: consumeMomentum(prev.momentum), combatLog: logs };
    });
  }, []);

  // Set hovered tile
  const setHoveredTile = useCallback((pos: Position | null) => {
    setGameState(prev => prev ? { ...prev, hoveredTile: pos } : prev);
  }, []);

  // Process AI turn
  useEffect(() => {
    if (!gameState || gameState.phase !== 'enemy_turn' || processingAI.current) return;
    processingAI.current = true;

    const timer = setTimeout(() => {
      setGameState(prev => {
        if (!prev) return prev;
        return processAITurn(prev, aiStatesRef.current);
      });
      processingAI.current = false;
    }, 800);

    return () => { clearTimeout(timer); processingAI.current = false; };
  }, [gameState?.phase, gameState?.activeUnitId]);

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
  };
}

// --- Internal state transitions ---
function executeMove(state: GameState, unit: Unit, pos: Position): GameState {
  const isReachable = state.movementRange.some(p => p.x === pos.x && p.y === pos.y);
  if (!isReachable) return state;

  const path = findPath(unit.position, pos, state.grid, unit.stats.movement);
  if (!path) return state;

  // Update grid occupancy
  const newGrid = state.grid.map(row => row.map(t => ({ ...t })));
  newGrid[unit.position.y][unit.position.x].occupied = false;
  newGrid[unit.position.y][unit.position.x].occupantId = undefined;
  newGrid[pos.y][pos.x].occupied = true;
  newGrid[pos.y][pos.x].occupantId = unit.id;

  const newUnits = state.units.map(u =>
    u.id === unit.id ? { ...u, position: pos, actionPoints: u.actionPoints - 1 } : u
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

  return advanceTurn({
    ...state,
    units: newUnits,
    grid: newGrid,
    timeline: newTimeline,
    visibility: unitVisibility,
    squadVisibility,
    combatLog: logs,
    selectedAction: null,
    targetingMode: false,
    movementRange: [],
    attackRange: [],
  });
}

function executeShoot(state: GameState, attacker: Unit, pos: Position): GameState {
  const targetTile = state.grid[pos.y]?.[pos.x];
  if (!targetTile?.occupantId) {
    // Check if destructible tile
    if (targetTile?.destructible) {
      return executeShootTile(state, attacker, pos);
    }
    return state;
  }

  const defender = state.units.find(u => u.id === targetTile.occupantId && u.alive);
  if (!defender) return state;

  const weapon = WEAPONS[attacker.weaponId];
  if (!weapon || attacker.ammo <= 0) return state;
  if (getDistance(attacker.position, pos) > weapon.range) return state;
  if (!hasLineOfSight(attacker.position, pos, state.grid)) return state;

  const result = resolveAttack(attacker, defender, state.grid);

  let newUnits = state.units.map(u => {
    if (u.id === attacker.id) return { ...u, ammo: u.ammo - 1, actionPoints: u.actionPoints - 1 };
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

      return advanceTurn({
        ...state,
        units: newUnits,
        grid: newGrid,
        timeline: filteredTimeline,
        momentum,
        combatLog: logs,
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

  return advanceTurn({
    ...state,
    units: newUnits,
    timeline: newTimeline,
    momentum,
    combatLog: logs,
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

  return advanceTurn({
    ...state,
    units: newUnits,
    grid: newGrid,
    timeline: newTimeline,
    momentum,
    visibility: unitVisibility,
    squadVisibility,
    combatLog: logs,
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

  let newUnits = state.units.map(u => {
    if (u.id === unit.id) {
      return {
        ...u,
        actionPoints: u.actionPoints - ability.cost,
        abilityCooldowns: { ...u.abilityCooldowns, [abilityId]: ability.cooldown },
      };
    }
    return u;
  });

  let logs = addLog(state.combatLog, state.turn, `${unit.name} used ${ability.name}!`, 'ability');
  let momentum = state.momentum;
  let newGrid = state.grid.map(row => row.map(t => ({ ...t })));

  // Apply effects based on ability type
  if (ability.damage && ability.targetType === 'area' && ability.radius) {
    // AoE damage
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
            const idx = newUnits.findIndex(u => u.id === target.id);
            const newEffects = [...newUnits[idx].statusEffects, { type: effect.status, duration: effect.duration }];
            newUnits[idx] = { ...newUnits[idx], statusEffects: newEffects };
          }
        }
      } else if (ability.targetType === 'self') {
        const idx = newUnits.findIndex(u => u.id === unit.id);
        const newEffects = [...newUnits[idx].statusEffects, { type: effect.status, duration: effect.duration }];
        newUnits[idx] = { ...newUnits[idx], statusEffects: newEffects };
      }
    }
  }

  const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
  const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

  return advanceTurn({
    ...state,
    units: newUnits,
    grid: newGrid,
    timeline: newTimeline,
    momentum,
    visibility: unitVisibility,
    squadVisibility,
    combatLog: logs,
    selectedAction: null,
    targetingMode: false,
    movementRange: [],
    attackRange: [],
  });
}

function advanceTurn(state: GameState): GameState {
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

  // Tick status effects for the next unit
  const newUnits = state.units.map(u => {
    if (u.id === nextId) {
      const updated = { ...u, actionPoints: u.maxActionPoints, overwatching: false };
      // Reduce cooldowns
      const newCooldowns: Record<string, number> = {};
      for (const [key, val] of Object.entries(updated.abilityCooldowns)) {
        if (val > 0) newCooldowns[key] = val - 1;
      }
      updated.abilityCooldowns = newCooldowns;
      // Tick status effects
      updated.statusEffects = updated.statusEffects
        .map(e => ({ ...e, duration: e.duration - 1 }))
        .filter(e => e.duration > 0);
      return updated;
    }
    return u;
  });

  const phase: GamePhase = nextUnit.faction === 'player' ? 'player_turn' : 'enemy_turn';

  return {
    ...state,
    units: newUnits,
    timeline,
    activeUnitId: nextId,
    phase,
    turn: state.turn + 1,
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

    // Decide action
    const action = decideAction(enemy, aiState, playerUnits, enemyUnits, state.grid);

    // Execute action
    return executeAIAction(state, enemy, action, aiStates);
  }

  return state;
}

function executeAIAction(state: GameState, enemy: Unit, action: AIAction, aiStates: Map<string, AIState>): GameState {
  let logs = state.combatLog;

  switch (action.type) {
    case 'move': {
      if (!action.targetPosition) break;
      const newGrid = state.grid.map(row => row.map(t => ({ ...t })));
      newGrid[enemy.position.y][enemy.position.x].occupied = false;
      newGrid[enemy.position.y][enemy.position.x].occupantId = undefined;
      newGrid[action.targetPosition.y][action.targetPosition.x].occupied = true;
      newGrid[action.targetPosition.y][action.targetPosition.x].occupantId = enemy.id;

      const newUnits = state.units.map(u =>
        u.id === enemy.id ? { ...u, position: action.targetPosition! } : u
      );

      const newTimeline = advanceUnit(state.timeline, enemy.id, 'move', enemy.stats.speed);
      const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

      const aiState = aiStates.get(enemy.id);
      const awareness = aiState?.awareness || 'unaware';
      if (awareness !== 'unaware') {
        logs = addLog(logs, state.turn, `${enemy.name} moved.`, 'movement');
      }

      return advanceTurn({
        ...state, units: newUnits, grid: newGrid, timeline: newTimeline,
        visibility: unitVisibility, squadVisibility, combatLog: logs,
      });
    }

    case 'attack': {
      const target = state.units.find(u => u.id === action.targetUnitId && u.alive);
      if (!target) break;

      const result = resolveAttack(enemy, target, state.grid);
      let newUnits = state.units.map(u => {
        if (u.id === enemy.id) return { ...u, ammo: u.ammo - 1 };
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

      return advanceTurn({ ...state, units: newUnits, timeline: newTimeline, combatLog: logs });
    }

    case 'ability': {
      if (!action.abilityId) break;
      const ability = ABILITIES[action.abilityId];
      if (!ability) break;

      logs = addLog(logs, state.turn, `${enemy.name} used ${ability.name}!`, 'ability');
      const newTimeline = advanceUnit(state.timeline, enemy.id, 'ability', enemy.stats.speed);

      let newUnits = state.units.map(u => {
        if (u.id === enemy.id) {
          return { ...u, abilityCooldowns: { ...u.abilityCooldowns, [action.abilityId!]: ability.cooldown } };
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

      return advanceTurn({ ...state, units: newUnits, timeline: newTimeline, combatLog: logs });
    }

    default:
      break;
  }

  // Idle or failed action - just advance
  const newTimeline = advanceUnit(state.timeline, enemy.id, 'end_turn', enemy.stats.speed);
  return advanceTurn({ ...state, timeline: newTimeline, combatLog: logs });
}
