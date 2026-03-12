// ============================================================
// Shadow Protocol - Enemy AI System
// ============================================================
import { Unit, Position, TileData, AIState, AwarenessState, DeployedTurret, DeployedDrone } from '@/engine/types';
import { eventBus } from '@/engine/events';
import { getDistance, getCoverBetween, isFlanking, resolveAttack, applyDamage } from '@/engine/systems/combat';
import { hasLineOfSight } from '@/engine/systems/visibility';
import { findPath, getReachableTiles } from '@/engine/systems/pathfinding';
import { WEAPONS } from '@/engine/data/weapons';
import { ABILITIES } from '@/engine/data/abilities';

export type { AIState };

export interface AIAction {
  type: 'move' | 'attack' | 'ability' | 'overwatch' | 'idle';
  targetPosition?: Position;
  targetUnitId?: string;
  abilityId?: string;
  path?: Position[];
}

// Initialize AI state for an enemy
export function createAIState(patrolPath: Position[] = []): AIState {
  return {
    awareness: 'unaware',
    patrolPath,
    patrolIndex: 0,
    alertCooldown: 0,
  };
}

// --- Awareness Transitions ---
export function updateAwareness(
  enemy: Unit,
  aiState: AIState,
  playerUnits: Unit[],
  grid: TileData[][],
  noisePositions: Position[] = []
): AIState {
  const newState = { ...aiState };

  // Check if any player unit is visible
  const canSeePlayer = playerUnits.some(
    p => p.alive &&
    getDistance(enemy.position, p.position) <= enemy.stats.vision &&
    hasLineOfSight(enemy.position, p.position, grid)
  );

  if (canSeePlayer) {
    if (newState.awareness !== 'engaged') {
      eventBus.emit('awareness_changed', {
        unitId: enemy.id,
        from: newState.awareness,
        to: 'engaged',
      });
    }
    newState.awareness = 'engaged';
    // Update last known position
    const visiblePlayer = playerUnits.find(
      p => p.alive &&
      getDistance(enemy.position, p.position) <= enemy.stats.vision &&
      hasLineOfSight(enemy.position, p.position, grid)
    );
    if (visiblePlayer) {
      newState.lastKnownPlayerPosition = { ...visiblePlayer.position };
    }
    newState.alertCooldown = 5;
  } else if (noisePositions.length > 0) {
    const nearestNoise = noisePositions.reduce((closest, n) => {
      const d = getDistance(enemy.position, n);
      return d < getDistance(enemy.position, closest) ? n : closest;
    }, noisePositions[0]);

    if (getDistance(enemy.position, nearestNoise) <= 6) {
      newState.awareness = newState.awareness === 'engaged' ? 'engaged' : 'suspicious';
      newState.noiseSource = nearestNoise;
    }
  } else if (newState.awareness === 'engaged' || newState.awareness === 'alerted') {
    newState.alertCooldown--;
    if (newState.alertCooldown <= 0) {
      newState.awareness = 'suspicious';
      newState.alertCooldown = 3;
    }
  } else if (newState.awareness === 'suspicious') {
    newState.alertCooldown--;
    if (newState.alertCooldown <= 0) {
      newState.awareness = 'unaware';
    }
  }

  return newState;
}

// --- Decision Making ---
export function decideAction(
  enemy: Unit,
  aiState: AIState,
  playerUnits: Unit[],
  allEnemies: Unit[],
  grid: TileData[][],
  turrets: DeployedTurret[] = [],
  drones: DeployedDrone[] = []
): AIAction {
  switch (aiState.awareness) {
    case 'engaged':
      return decideCombatAction(enemy, aiState, playerUnits, allEnemies, grid, turrets, drones);
    case 'alerted':
    case 'suspicious':
      return decideInvestigateAction(enemy, aiState, grid);
    case 'unaware':
    default:
      return decidePatrolAction(enemy, aiState, grid);
  }
}

function decideCombatAction(
  enemy: Unit,
  aiState: AIState,
  playerUnits: Unit[],
  allEnemies: Unit[],
  grid: TileData[][],
  turrets: DeployedTurret[] = [],
  drones: DeployedDrone[] = []
): AIAction {
  const aliveTargets = playerUnits.filter(p => p.alive);
  if (aliveTargets.length === 0) return { type: 'idle' };

  // #10: Priority target — attack nearby turrets and drones first
  const weapon = WEAPONS[enemy.weaponId];
  if (weapon) {
    // Check turrets
    for (const turret of turrets) {
      const turretDist = getDistance(enemy.position, turret.position);
      if (turretDist <= weapon.range && turretDist <= 4 && hasLineOfSight(enemy.position, turret.position, grid)) {
        return { type: 'attack', targetPosition: turret.position, targetUnitId: `turret:${turret.id}` };
      }
    }
    // #7: Check drones
    for (const drone of drones) {
      const droneDist = getDistance(enemy.position, drone.position);
      if (droneDist <= weapon.range && droneDist <= 4 && hasLineOfSight(enemy.position, drone.position, grid)) {
        return { type: 'attack', targetPosition: drone.position, targetUnitId: `drone:${drone.id}` };
      }
    }
  }

  // Select target: lowest health → closest → last attacker
  const target = selectTarget(enemy, aliveTargets);

  // Check if should retreat (health < 25%)
  if (enemy.stats.health < enemy.stats.maxHealth * 0.25) {
    const safeCover = findBestCover(enemy, aliveTargets, grid, true);
    if (safeCover) {
      const path = findPath(enemy.position, safeCover, grid, enemy.actionPoints);
      if (path) return { type: 'move', targetPosition: safeCover, path };
    }
  }

  // Check ability usage
  const abilityAction = evaluateAbilityUsage(enemy, aliveTargets, allEnemies, grid);
  if (abilityAction) return abilityAction;

  // Can attack?
  const distToTarget = getDistance(enemy.position, target.position);
  if (weapon && distToTarget <= weapon.range && hasLineOfSight(enemy.position, target.position, grid)) {
    return { type: 'attack', targetUnitId: target.id };
  }

  // Try to flank
  const flankPos = findFlankPosition(enemy, target, grid);
  if (flankPos) {
    const path = findPath(enemy.position, flankPos, grid, enemy.actionPoints);
    if (path) return { type: 'move', targetPosition: flankPos, path };
  }

  // Move to best cover near target
  const coverPos = findBestCover(enemy, aliveTargets, grid, false);
  if (coverPos) {
    const path = findPath(enemy.position, coverPos, grid, enemy.actionPoints);
    if (path) return { type: 'move', targetPosition: coverPos, path };
  }

  // Move toward target (allow occupied dest since we truncate the path)
  const path = findPath(enemy.position, target.position, grid, enemy.actionPoints, true);
  if (path && path.length > 1) {
    const moveTarget = path[Math.min(path.length - 1, enemy.actionPoints)];
    return { type: 'move', targetPosition: moveTarget, path: path.slice(0, enemy.actionPoints + 1) };
  }

  return { type: 'idle' };
}

function decideInvestigateAction(
  enemy: Unit,
  aiState: AIState,
  grid: TileData[][]
): AIAction {
  const target = aiState.noiseSource || aiState.lastKnownPlayerPosition;
  if (!target) return decidePatrolAction(enemy, aiState, grid);

  if (enemy.position.x === target.x && enemy.position.y === target.y) {
    return { type: 'idle' }; // Reached investigation point
  }

  const path = findPath(enemy.position, target, grid, enemy.actionPoints, true);
  if (path && path.length > 1) {
    const moveTarget = path[Math.min(path.length - 1, enemy.actionPoints)];
    return { type: 'move', targetPosition: moveTarget, path: path.slice(0, enemy.actionPoints + 1) };
  }

  return { type: 'idle' };
}

function decidePatrolAction(
  enemy: Unit,
  aiState: AIState,
  grid: TileData[][]
): AIAction {
  if (aiState.patrolPath.length === 0) return { type: 'idle' };

  const target = aiState.patrolPath[aiState.patrolIndex % aiState.patrolPath.length];
  if (enemy.position.x === target.x && enemy.position.y === target.y) {
    return { type: 'idle' }; // Will advance patrol index on turn end
  }

  const path = findPath(enemy.position, target, grid, enemy.actionPoints, true);
  if (path && path.length > 1) {
    const moveTarget = path[Math.min(path.length - 1, enemy.actionPoints)];
    return { type: 'move', targetPosition: moveTarget, path: path.slice(0, enemy.actionPoints + 1) };
  }

  return { type: 'idle' };
}

// --- Target Selection ---
function selectTarget(enemy: Unit, targets: Unit[]): Unit {
  return targets.sort((a, b) => {
    // Priority 1: lowest health
    const healthDiff = (a.stats.health / a.stats.maxHealth) - (b.stats.health / b.stats.maxHealth);
    if (Math.abs(healthDiff) > 0.1) return healthDiff;
    // Priority 2: closest
    return getDistance(enemy.position, a.position) - getDistance(enemy.position, b.position);
  })[0];
}

// --- Cover Evaluation ---
function findBestCover(
  enemy: Unit,
  threats: Unit[],
  grid: TileData[][],
  retreating: boolean
): Position | null {
  const hasDebuffSpeed = enemy.statusEffects.some(e => e.type === 'debuff_speed');
  const effectiveAP = hasDebuffSpeed ? Math.floor(enemy.actionPoints * 0.6) : enemy.actionPoints;
  const reachable = getReachableTiles(enemy.position, effectiveAP, grid);
  if (reachable.length === 0) return null;

  let bestPos: Position | null = null;
  let bestScore = -Infinity;

  for (const pos of reachable) {
    const tile = grid[pos.y][pos.x];
    let score = 0;

    // Cover value
    if (tile.coverValue === 'full') score += 30;
    else if (tile.coverValue === 'half') score += 15;

    // Distance to nearest threat
    const nearestDist = Math.min(...threats.map(t => getDistance(pos, t.position)));
    if (retreating) {
      score += nearestDist * 5; // prefer far from threats
    } else {
      // Prefer within weapon range but not too close
      const weapon = WEAPONS[enemy.weaponId];
      if (weapon && nearestDist <= weapon.range && nearestDist >= 2) {
        score += 20;
      }
    }

    // Check if we'd have line of sight to a target from this position
    if (!retreating) {
      const hasLOS = threats.some(t => hasLineOfSight(pos, t.position, grid));
      if (hasLOS) score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }

  return bestPos;
}

// --- Flanking ---
function findFlankPosition(
  enemy: Unit,
  target: Unit,
  grid: TileData[][]
): Position | null {
  const hasDebuffSpeed = enemy.statusEffects.some(e => e.type === 'debuff_speed');
  const effectiveAP = hasDebuffSpeed ? Math.floor(enemy.actionPoints * 0.6) : enemy.actionPoints;
  const reachable = getReachableTiles(enemy.position, effectiveAP, grid);

  for (const pos of reachable) {
    if (isFlanking(pos, target.position, grid) && hasLineOfSight(pos, target.position, grid)) {
      const weapon = WEAPONS[enemy.weaponId];
      if (weapon && getDistance(pos, target.position) <= weapon.range) {
        return pos;
      }
    }
  }

  return null;
}

// --- Ability Usage ---
function evaluateAbilityUsage(
  enemy: Unit,
  targets: Unit[],
  allies: Unit[],
  grid: TileData[][]
): AIAction | null {
  for (const abilityId of enemy.abilityIds) {
    const ability = ABILITIES[abilityId];
    if (!ability) continue;
    if ((enemy.abilityCooldowns[abilityId] || 0) > 0) continue;

    // Suppression: use when 2+ visible enemies
    if (abilityId === 'suppression') {
      const visibleTargets = targets.filter(
        t => getDistance(enemy.position, t.position) <= (ability.range || 5) &&
        hasLineOfSight(enemy.position, t.position, grid)
      );
      if (visibleTargets.length >= 2) {
        return { type: 'ability', abilityId, targetUnitId: visibleTargets[0].id };
      }
    }

    // Rally: use when allies nearby
    if (abilityId === 'rally') {
      const nearbyAllies = allies.filter(
        a => a.id !== enemy.id && a.alive && getDistance(enemy.position, a.position) <= (ability.radius || 3)
      );
      if (nearbyAllies.length >= 1) {
        return { type: 'ability', abilityId };
      }
    }

    // Frag grenade: use when target in cover
    if (abilityId === 'frag_grenade') {
      const coverTarget = targets.find(
        t => getCoverBetween(enemy.position, t.position, grid) !== 'none' &&
        getDistance(enemy.position, t.position) <= (ability.range || 5)
      );
      if (coverTarget) {
        return { type: 'ability', abilityId, targetUnitId: coverTarget.id, targetPosition: coverTarget.position };
      }
    }
  }

  return null;
}

// Alert nearby enemies
export function alertNearbyEnemies(
  source: Unit,
  enemies: Unit[],
  aiStates: Map<string, AIState>
): void {
  for (const enemy of enemies) {
    if (enemy.id === source.id || !enemy.alive) continue;
    const dist = getDistance(source.position, enemy.position);
    const state = aiStates.get(enemy.id);
    if (!state) continue;

    if (dist <= 3) {
      // Instant alert
      state.awareness = 'alerted';
      state.lastKnownPlayerPosition = source.position;
      state.alertCooldown = 5;
    } else if (dist <= 6) {
      // Delayed alert - suspicious
      if (state.awareness === 'unaware') {
        state.awareness = 'suspicious';
        state.noiseSource = source.position;
        state.alertCooldown = 3;
      }
    }
  }
}
