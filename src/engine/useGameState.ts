// ============================================================
// Shadow Protocol - Game State Manager (React Hook)
// ============================================================
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  GameState, GamePhase, Unit, Position, TileData, CombatLogEntry,
  MomentumEvent, TimelineEntry
} from '@/engine/types';
import { eventBus } from '@/engine/events';
import { generateDemoMap, getDemoSpawns } from '@/engine/data/maps';
import { createOperative, createEnemy } from '@/engine/data/operatives';
import { WEAPONS } from '@/engine/data/weapons';
import { ABILITIES } from '@/engine/data/abilities';
import {
  resolveAttack, applyDamage, applyStatusEffect, tickStatusEffects,
  calculateHitChance, getDistance
} from '@/engine/systems/combat';
import { calculateSquadVisibility, hasLineOfSight } from '@/engine/systems/visibility';
import { getReachableTiles, findPath, getTilesInRange } from '@/engine/systems/pathfinding';
import { initializeTimeline, advanceUnit, removeFromTimeline, getNextUnit, sortTimeline } from '@/engine/systems/initiative';
import { createMomentumState, applyMomentum, consumeMomentum } from '@/engine/systems/momentum';
import { checkHazardDamage, damageTile } from '@/engine/systems/environment';
import {
  createAIState, updateAwareness, decideAction, alertNearbyEnemies,
  AIAction, AIState
} from '@/engine/systems/ai';

// Animation callback type
export type AnimationCallbacks = {
  showDamageNumber: (pos: Position, value: number, critical: boolean, miss?: boolean, heal?: boolean) => void;
  showExplosion: (pos: Position, radius: number, type?: string) => void;
  animateUnitMove: (unitId: string, from: Position, to: Position, duration?: number) => void;
  triggerScreenShake: (intensity?: number) => void;
};

function addLog(logs: CombatLogEntry[], turn: number, message: string, type: CombatLogEntry['type']): CombatLogEntry[] {
  return [...logs, { turn, timestamp: Date.now(), message, type }];
}

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const aiStatesRef = useRef<Map<string, AIState>>(new Map());
  const processingAI = useRef(false);
  const animCallbacksRef = useRef<AnimationCallbacks | null>(null);

  // Register animation callbacks
  const registerAnimations = useCallback((cbs: AnimationCallbacks) => {
    animCallbacksRef.current = cbs;
  }, []);

  // Initialize game
  const initGame = useCallback(() => {
    const grid = generateDemoMap();
    const spawns = getDemoSpawns();

    const players: Unit[] = [
      { ...createOperative('specter', 'specter'), position: spawns.playerSpawns[0] },
      { ...createOperative('bulldog', 'bulldog'), position: spawns.playerSpawns[1] },
      { ...createOperative('circuit', 'circuit'), position: spawns.playerSpawns[2] },
      { ...createOperative('phantom', 'phantom'), position: spawns.playerSpawns[3] },
    ];

    const enemies: Unit[] = [
      { ...createEnemy('grunt1', 'grunt'), position: spawns.enemySpawns[0] },
      { ...createEnemy('grunt2', 'grunt'), position: spawns.enemySpawns[1] },
      { ...createEnemy('heavy1', 'heavy_trooper'), position: spawns.enemySpawns[2] },
      { ...createEnemy('grunt3', 'grunt'), position: spawns.enemySpawns[3] },
      { ...createEnemy('cmdr1', 'commander'), position: spawns.enemySpawns[4] },
    ];

    const allUnits = [...players, ...enemies];

    for (const unit of allUnits) {
      grid[unit.position.y][unit.position.x].occupied = true;
      grid[unit.position.y][unit.position.x].occupantId = unit.id;
    }

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

    const { unitVisibility, squadVisibility } = calculateSquadVisibility(allUnits, grid, 12, 12);
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

        // Self-target abilities execute immediately
        if (ability.targetType === 'self') {
          return executeSelfAbility(prev, unit, abilityId);
        }

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
        return executeMove(prev, unit, pos, animCallbacksRef.current);
      }
      if (prev.selectedAction === 'shoot') {
        return executeShoot(prev, unit, pos, animCallbacksRef.current);
      }
      if (prev.selectedAction?.startsWith('ability:')) {
        return executeAbility(prev, unit, pos, prev.selectedAction.replace('ability:', ''), animCallbacksRef.current);
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

      // Apply combo effects
      const ability = ABILITIES[comboId];
      let newUnits = [...prev.units];

      if (comboId === 'tactical_barrage' && ability?.damage) {
        // Deal massive damage to nearest visible enemy
        const enemies = prev.units.filter(u => u.faction === 'enemy' && u.alive);
        const visibleEnemy = enemies.find(e =>
          prev.squadVisibility[`${e.position.x},${e.position.y}`] === 'visible'
        );
        if (visibleEnemy) {
          newUnits = newUnits.map(u => {
            if (u.id === visibleEnemy.id) {
              const newHealth = Math.max(0, u.stats.health - ability.damage!);
              return { ...u, stats: { ...u.stats, health: newHealth }, alive: newHealth > 0 };
            }
            return u;
          });
          logs = addLog(logs, prev.turn, `Tactical Barrage hit ${visibleEnemy.name} for ${ability.damage} damage!`, 'damage');
          animCallbacksRef.current?.showDamageNumber(visibleEnemy.position, ability.damage, true);
          animCallbacksRef.current?.triggerScreenShake(2);
          animCallbacksRef.current?.showExplosion(visibleEnemy.position, 1, 'impact');
        }
      } else if (comboId === 'breach_assault') {
        // Buff all player units
        newUnits = newUnits.map(u => {
          if (u.faction === 'player' && u.alive) {
            return {
              ...u,
              statusEffects: [...u.statusEffects, { type: 'buff_speed' as const, duration: 2 }, { type: 'buff_accuracy' as const, duration: 2 }],
            };
          }
          return u;
        });
        logs = addLog(logs, prev.turn, 'All operatives gain speed and accuracy boost!', 'ability');
      } else if (comboId === 'coordinated_strike' && ability?.damage) {
        const enemies = prev.units.filter(u => u.faction === 'enemy' && u.alive);
        const visibleEnemy = enemies.find(e =>
          prev.squadVisibility[`${e.position.x},${e.position.y}`] === 'visible'
        );
        if (visibleEnemy) {
          newUnits = newUnits.map(u => {
            if (u.id === visibleEnemy.id) {
              const newHealth = Math.max(0, u.stats.health - ability.damage!);
              return { ...u, stats: { ...u.stats, health: newHealth }, alive: newHealth > 0 };
            }
            return u;
          });
          logs = addLog(logs, prev.turn, `Coordinated Strike hit ${visibleEnemy.name} for ${ability.damage} damage!`, 'damage');
          animCallbacksRef.current?.showDamageNumber(visibleEnemy.position, ability.damage, false);
          animCallbacksRef.current?.showExplosion(visibleEnemy.position, 1, 'impact');
        }
      }

      return { ...prev, units: newUnits, momentum: consumeMomentum(prev.momentum), combatLog: logs };
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
        return processAITurn(prev, aiStatesRef.current, animCallbacksRef.current);
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
    registerAnimations,
  };
}

// --- Internal state transitions ---
function executeMove(state: GameState, unit: Unit, pos: Position, anim: AnimationCallbacks | null): GameState {
  const isReachable = state.movementRange.some(p => p.x === pos.x && p.y === pos.y);
  if (!isReachable) return state;

  const path = findPath(unit.position, pos, state.grid, unit.stats.movement);
  if (!path) return state;

  // Trigger movement animation and sound
  anim?.animateUnitMove(unit.id, unit.position, pos, 350);
  eventBus.emit('unit_moved', { unitId: unit.id, from: unit.position, to: pos });

  const newGrid = state.grid.map(row => row.map(t => ({ ...t })));
  newGrid[unit.position.y][unit.position.x].occupied = false;
  newGrid[unit.position.y][unit.position.x].occupantId = undefined;
  newGrid[pos.y][pos.x].occupied = true;
  newGrid[pos.y][pos.x].occupantId = unit.id;

  const newUnits = state.units.map(u =>
    u.id === unit.id ? { ...u, position: pos, actionPoints: u.actionPoints - 1 } : u
  );

  const newTimeline = advanceUnit(state.timeline, unit.id, 'move', unit.stats.speed);
  const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

  const movedUnit = newUnits.find(u => u.id === unit.id)!;
  const hazardDmg = checkHazardDamage(movedUnit, newGrid);

  let logs = state.combatLog;
  logs = addLog(logs, state.turn, `${unit.name} moved to (${pos.x}, ${pos.y}).`, 'movement');
  if (hazardDmg > 0) {
    logs = addLog(logs, state.turn, `${unit.name} took ${hazardDmg} hazard damage!`, 'environment');
    anim?.showDamageNumber(pos, hazardDmg, false);
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

function executeShoot(state: GameState, attacker: Unit, pos: Position, anim: AnimationCallbacks | null): GameState {
  const targetTile = state.grid[pos.y]?.[pos.x];
  if (!targetTile?.occupantId) {
    if (targetTile?.destructible) {
      return executeShootTile(state, attacker, pos, anim);
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

    // Animations
    anim?.showDamageNumber(defender.position, result.damage, result.critical);
    if (result.critical) {
      anim?.triggerScreenShake(1.5);
    }
    anim?.showExplosion(defender.position, 0.3, 'impact');

    if (result.critical) momentum = applyMomentum(momentum, 'critical_hit');
    if (result.flanking) momentum = applyMomentum(momentum, 'flank');

    const killed = newUnits.find(u => u.id === defender.id);
    if (killed && !killed.alive) {
      logs = addLog(logs, state.turn, `${defender.name} eliminated!`, 'kill');
      momentum = applyMomentum(momentum, 'kill');
      const filteredTimeline = removeFromTimeline(newTimeline, defender.id);
      const newGrid = state.grid.map(row => row.map(t => ({ ...t })));
      newGrid[defender.position.y][defender.position.x].occupied = false;
      newGrid[defender.position.y][defender.position.x].occupantId = undefined;

      anim?.showExplosion(defender.position, 0.5, 'explosion');
      anim?.triggerScreenShake(1);

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
    anim?.showDamageNumber(defender.position, 0, false, true);
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

function executeShootTile(state: GameState, attacker: Unit, pos: Position, anim: AnimationCallbacks | null): GameState {
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
    anim?.showExplosion(pos, 1, 'explosion');
    anim?.triggerScreenShake(1);
  } else {
    anim?.showExplosion(pos, 0.3, 'impact');
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

// Self-target ability (e.g., adrenal_boost) - no tile click needed
function executeSelfAbility(state: GameState, unit: Unit, abilityId: string): GameState {
  const ability = ABILITIES[abilityId];
  if (!ability) return state;
  if ((unit.abilityCooldowns[abilityId] || 0) > 0) return state;

  let newUnits = state.units.map(u => {
    if (u.id === unit.id) {
      const newEffects = [...u.statusEffects];
      if (ability.effects) {
        for (const eff of ability.effects) {
          newEffects.push({ type: eff.status, duration: eff.duration });
        }
      }
      return {
        ...u,
        actionPoints: u.actionPoints - ability.cost,
        abilityCooldowns: { ...u.abilityCooldowns, [abilityId]: ability.cooldown },
        statusEffects: newEffects,
      };
    }
    return u;
  });

  let logs = addLog(state.combatLog, state.turn, `${unit.name} used ${ability.name}!`, 'ability');
  const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);

  return advanceTurn({
    ...state,
    units: newUnits,
    timeline: newTimeline,
    combatLog: logs,
    selectedAction: null,
    targetingMode: false,
    movementRange: [],
    attackRange: [],
  });
}

function executeAbility(state: GameState, unit: Unit, pos: Position, abilityId: string, anim: AnimationCallbacks | null): GameState {
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

  // --- Headshot: single-target attack with crit bonus ---
  if (abilityId === 'headshot') {
    const targetTile = state.grid[pos.y]?.[pos.x];
    const defender = targetTile?.occupantId
      ? state.units.find(u => u.id === targetTile.occupantId && u.alive)
      : null;
    if (defender) {
      const result = resolveAttack(unit, defender, state.grid, ability.critBonus || 0);
      newUnits = newUnits.map(u => {
        if (u.id === unit.id) return { ...u, ammo: Math.max(0, u.ammo - 1) };
        if (u.id === defender.id && result.hit) {
          const newHealth = Math.max(0, u.stats.health - result.damage);
          return { ...u, stats: { ...u.stats, health: newHealth }, alive: newHealth > 0 };
        }
        return u;
      });
      if (result.hit) {
        logs = addLog(logs, state.turn, `Headshot hit ${defender.name} for ${result.damage}${result.critical ? ' (CRITICAL!)' : ''}`, 'damage');
        anim?.showDamageNumber(defender.position, result.damage, result.critical);
        if (result.critical) {
          anim?.triggerScreenShake(2);
          momentum = applyMomentum(momentum, 'critical_hit');
        }
        anim?.showExplosion(defender.position, 0.3, 'impact');
        const killed = newUnits.find(u => u.id === defender.id);
        if (killed && !killed.alive) {
          logs = addLog(logs, state.turn, `${defender.name} eliminated!`, 'kill');
          momentum = applyMomentum(momentum, 'kill');
        }
      } else {
        logs = addLog(logs, state.turn, `Headshot missed ${defender.name}!`, 'damage');
        anim?.showDamageNumber(defender.position, 0, false, true);
      }
    }
  }
  // --- AoE damage abilities (frag_grenade, suppression) ---
  else if (ability.damage && ability.targetType === 'area' && ability.radius) {
    anim?.showExplosion(pos, ability.radius, abilityId === 'frag_grenade' ? 'explosion' : 'impact');
    anim?.triggerScreenShake(ability.damage > 20 ? 1.5 : 0.8);

    for (const target of newUnits) {
      if (!target.alive) continue;
      const dist = getDistance(pos, target.position);
      if (dist <= ability.radius) {
        const idx = newUnits.findIndex(u => u.id === target.id);
        const newHealth = Math.max(0, newUnits[idx].stats.health - ability.damage);
        newUnits[idx] = { ...newUnits[idx], stats: { ...newUnits[idx].stats, health: newHealth }, alive: newHealth > 0 };
        logs = addLog(logs, state.turn, `${target.name} took ${ability.damage} ability damage!`, 'damage');
        anim?.showDamageNumber(target.position, ability.damage, false);
        if (newHealth <= 0) {
          logs = addLog(logs, state.turn, `${target.name} eliminated!`, 'kill');
          if (target.faction === 'enemy') momentum = applyMomentum(momentum, 'kill');
        }
      }
    }

    // Destroy destructible tiles in radius
    for (let dy = -ability.radius; dy <= ability.radius; dy++) {
      for (let dx = -ability.radius; dx <= ability.radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > ability.radius) continue;
        const tx = pos.x + dx;
        const ty = pos.y + dy;
        const tile = newGrid[ty]?.[tx];
        if (tile?.destructible) {
          newGrid = damageTile(newGrid, { x: tx, y: ty }, ability.damage, newUnits);
        }
      }
    }
  }
  // --- Single-target damage abilities (turret_deploy, etc.) ---
  else if (ability.damage && ability.targetType === 'single') {
    const targetTile = state.grid[pos.y]?.[pos.x];
    const defender = targetTile?.occupantId
      ? newUnits.find(u => u.id === targetTile.occupantId && u.alive)
      : null;
    if (defender) {
      const idx = newUnits.findIndex(u => u.id === defender.id);
      const newHealth = Math.max(0, defender.stats.health - ability.damage);
      newUnits[idx] = { ...newUnits[idx], stats: { ...newUnits[idx].stats, health: newHealth }, alive: newHealth > 0 };
      logs = addLog(logs, state.turn, `${ability.name} hit ${defender.name} for ${ability.damage} damage!`, 'damage');
      anim?.showDamageNumber(defender.position, ability.damage, false);
      anim?.showExplosion(defender.position, 0.3, 'impact');
      if (newHealth <= 0) {
        logs = addLog(logs, state.turn, `${defender.name} eliminated!`, 'kill');
        if (defender.faction === 'enemy') momentum = applyMomentum(momentum, 'kill');
      }
    }
  }

  // Apply status effects
  if (ability.effects) {
    for (const effect of ability.effects) {
      if (ability.targetType === 'area' && ability.radius) {
        for (let i = 0; i < newUnits.length; i++) {
          if (!newUnits[i].alive) continue;
          if (getDistance(pos, newUnits[i].position) <= ability.radius) {
            const newEffects = [...newUnits[i].statusEffects, { type: effect.status, duration: effect.duration }];
            newUnits[i] = { ...newUnits[i], statusEffects: newEffects };
          }
        }
      } else if (ability.targetType === 'single') {
        const targetTile = state.grid[pos.y]?.[pos.x];
        if (targetTile?.occupantId) {
          const idx = newUnits.findIndex(u => u.id === targetTile.occupantId);
          if (idx >= 0) {
            const newEffects = [...newUnits[idx].statusEffects, { type: effect.status, duration: effect.duration }];
            newUnits[idx] = { ...newUnits[idx], statusEffects: newEffects };
          }
        }
      }
    }
  }

  // Smoke screen: block vision on affected tiles
  if (abilityId === 'smoke_screen' && ability.radius) {
    for (let dy = -ability.radius; dy <= ability.radius; dy++) {
      for (let dx = -ability.radius; dx <= ability.radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > ability.radius) continue;
        const tx = pos.x + dx;
        const ty = pos.y + dy;
        if (newGrid[ty]?.[tx]) {
          newGrid[ty][tx] = { ...newGrid[ty][tx], blocksVision: true };
        }
      }
    }
    anim?.showExplosion(pos, ability.radius, 'smoke');
  }

  // Recon drone: reveal area
  if (abilityId === 'recon_drone' && ability.radius) {
    // Revealing is handled by recalculating visibility with boosted range
    // For now, just mark tiles as visible in squad visibility
    logs = addLog(logs, state.turn, `Drone deployed - area revealed!`, 'info');
  }

  const newTimeline = advanceUnit(state.timeline, unit.id, 'ability', unit.stats.speed);
  const { unitVisibility, squadVisibility } = calculateSquadVisibility(newUnits, newGrid, state.mapWidth, state.mapHeight, state.squadVisibility);

  // For recon drone, force-reveal tiles in radius
  if (abilityId === 'recon_drone' && ability.radius) {
    for (let dy = -(ability.radius + ability.range!); dy <= (ability.radius + ability.range!); dy++) {
      for (let dx = -(ability.radius + ability.range!); dx <= (ability.radius + ability.range!); dx++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist > ability.radius) continue;
        const tx = pos.x + dx;
        const ty = pos.y + dy;
        const key = `${tx},${ty}`;
        if (tx >= 0 && tx < state.mapWidth && ty >= 0 && ty < state.mapHeight) {
          squadVisibility[key] = 'visible';
        }
      }
    }
  }

  // Clean up dead units from timeline
  let finalTimeline = newTimeline;
  for (const u of newUnits) {
    if (!u.alive) {
      finalTimeline = removeFromTimeline(finalTimeline, u.id);
      // Clear occupancy
      if (newGrid[u.position.y]?.[u.position.x]) {
        newGrid[u.position.y][u.position.x].occupied = false;
        newGrid[u.position.y][u.position.x].occupantId = undefined;
      }
    }
  }

  return advanceTurn({
    ...state,
    units: newUnits,
    grid: newGrid,
    timeline: finalTimeline,
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

  let timeline = state.timeline.filter(e => {
    const unit = state.units.find(u => u.id === e.unitId);
    return unit?.alive;
  });

  const nextId = getNextUnit(timeline);
  if (!nextId) return { ...state, phase: 'victory' };

  const nextUnit = state.units.find(u => u.id === nextId);
  if (!nextUnit) return state;

  const newUnits = state.units.map(u => {
    if (u.id === nextId) {
      const updated = { ...u, actionPoints: u.maxActionPoints, overwatching: false };
      const newCooldowns: Record<string, number> = {};
      for (const [key, val] of Object.entries(updated.abilityCooldowns)) {
        if (val > 0) newCooldowns[key] = val - 1;
      }
      updated.abilityCooldowns = newCooldowns;
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

function processAITurn(state: GameState, aiStates: Map<string, AIState>, anim: AnimationCallbacks | null): GameState {
  const enemy = state.units.find(u => u.id === state.activeUnitId);
  if (!enemy || enemy.faction === 'player') return state;
  if (!enemy.alive) return advanceTurn(state);

  const playerUnits = state.units.filter(u => u.faction === 'player' && u.alive);
  const enemyUnits = state.units.filter(u => u.faction === 'enemy' && u.alive);

  let aiState = aiStates.get(enemy.id) || createAIState();
  aiState = updateAwareness(enemy, aiState, playerUnits, state.grid);
  aiStates.set(enemy.id, aiState);

  const action = decideAction(enemy, aiState, playerUnits, enemyUnits, state.grid);
  return executeAIAction(state, enemy, action, aiStates, anim);
}

function executeAIAction(state: GameState, enemy: Unit, action: AIAction, aiStates: Map<string, AIState>, anim: AnimationCallbacks | null): GameState {
  let logs = state.combatLog;

  switch (action.type) {
    case 'move': {
      if (!action.targetPosition) break;

      anim?.animateUnitMove(enemy.id, enemy.position, action.targetPosition, 350);

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
        anim?.showDamageNumber(target.position, result.damage, result.critical);
        anim?.showExplosion(target.position, 0.3, 'impact');
        if (result.critical) anim?.triggerScreenShake(1.5);

        const killed = newUnits.find(u => u.id === target.id);
        if (killed && !killed.alive) {
          logs = addLog(logs, state.turn, `${target.name} is down!`, 'kill');
          anim?.triggerScreenShake(1);
        }
      } else {
        logs = addLog(logs, state.turn, `${enemy.name} missed ${target.name}.`, 'damage');
        anim?.showDamageNumber(target.position, 0, false, true);
      }

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

      // Apply damage
      if (ability.damage && action.targetUnitId) {
        const target = newUnits.find(u => u.id === action.targetUnitId);
        if (target) {
          const idx = newUnits.findIndex(u => u.id === target.id);
          const newHealth = Math.max(0, target.stats.health - ability.damage);
          newUnits[idx] = { ...newUnits[idx], stats: { ...newUnits[idx].stats, health: newHealth }, alive: newHealth > 0 };
          anim?.showDamageNumber(target.position, ability.damage, false);
          anim?.showExplosion(target.position, 0.5, 'impact');
        }
      }

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

  const newTimeline = advanceUnit(state.timeline, enemy.id, 'end_turn', enemy.stats.speed);
  return advanceTurn({ ...state, timeline: newTimeline, combatLog: logs });
}
