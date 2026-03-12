// ============================================================
// Shadow Protocol - Combat Rules Engine
// ============================================================
import {
  Unit, TileData, AttackResult, HitCalculation,
  Position, CoverType, Weapon, StatusEffect
} from '@/engine/types';
import { WEAPONS } from '@/engine/data/weapons';
import { eventBus } from '@/engine/events';

// --- Distance ---
export function getDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // Manhattan
}

export function getEuclideanDistance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// --- Cover Evaluation ---
export function getCoverBetween(
  attacker: Position,
  defender: Position,
  grid: TileData[][]
): CoverType {
  const defTile = grid[defender.y]?.[defender.x];
  if (!defTile) return 'none';
  if (defTile.coverValue === 'none' || defTile.coverValue === 'wall') return defTile.coverValue;

  // Check if attacker direction aligns with a cover direction
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;

  let attackDir: string;
  if (Math.abs(dx) >= Math.abs(dy)) {
    attackDir = dx > 0 ? 'east' : 'west';
  } else {
    attackDir = dy > 0 ? 'south' : 'north';
  }

  // If the tile provides cover in the attack direction, it applies
  if (defTile.coverDirections.includes(attackDir as any)) {
    return defTile.coverValue;
  }

  // Check adjacent tiles for cover in the right direction
  const adjacentTiles = getAdjacentCoverTiles(defender, grid);
  for (const adj of adjacentTiles) {
    const adjDir = getDirectionFromTo(defender, adj.position);
    // Cover applies if the adjacent cover is between defender and attacker
    if (adjDir === attackDir && adj.coverValue !== 'none') {
      return adj.coverValue;
    }
  }

  return 'none';
}

function getAdjacentCoverTiles(pos: Position, grid: TileData[][]): TileData[] {
  const results: TileData[] = [];
  const neighbors = [
    { x: pos.x - 1, y: pos.y },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x, y: pos.y + 1 },
  ];
  for (const n of neighbors) {
    const tile = grid[n.y]?.[n.x];
    if (tile && tile.coverValue !== 'none') {
      results.push(tile);
    }
  }
  return results;
}

function getDirectionFromTo(from: Position, to: Position): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'east' : 'west';
  }
  return dy > 0 ? 'south' : 'north';
}

// --- Flanking ---
export function isFlanking(
  attacker: Position,
  defender: Position,
  grid: TileData[][]
): boolean {
  const cover = getCoverBetween(attacker, defender, grid);
  // Flanking = attacker has an angle that bypasses cover
  if (cover === 'none') return false; // no cover to flank
  // Check if there's an uncovered angle
  const defTile = grid[defender.y]?.[defender.x];
  if (!defTile) return false;

  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  let attackDir: string;
  if (Math.abs(dx) >= Math.abs(dy)) {
    attackDir = dx > 0 ? 'east' : 'west';
  } else {
    attackDir = dy > 0 ? 'south' : 'north';
  }

  // If the tile doesn't provide cover in the attack direction, attacker flanks
  return !defTile.coverDirections.includes(attackDir as any);
}

// --- Hit Chance ---
export function calculateHitChance(
  attacker: Unit,
  defender: Unit,
  grid: TileData[][]
): HitCalculation {
  const weapon = WEAPONS[attacker.weaponId];
  if (!weapon) {
    return { baseAccuracy: 0, weaponAccuracy: 0, flankBonus: 0, heightBonus: 0, coverPenalty: 0, distancePenalty: 0, total: 0 };
  }

  const distance = getDistance(attacker.position, defender.position);
  const cover = getCoverBetween(attacker.position, defender.position, grid);
  const flanking = isFlanking(attacker.position, defender.position, grid);
  const attackerTile = grid[attacker.position.y]?.[attacker.position.x];
  const defenderTile = grid[defender.position.y]?.[defender.position.x];
  const heightAdv = (attackerTile?.elevation || 0) > (defenderTile?.elevation || 0);

  const baseAccuracy = attacker.stats.accuracy;
  const weaponAccuracy = weapon.accuracy;
  const flankBonus = flanking ? 15 : 0;
  const heightBonus = heightAdv ? 10 : 0;

  let coverPenalty = 0;
  if (!flanking) {
    if (cover === 'half') coverPenalty = 30;
    else if (cover === 'full') coverPenalty = 60;
  }

  // Distance penalty: 5% per tile beyond optimal range
  const distancePenalty = Math.max(0, (distance - weapon.optimalRange) * 5);

  // Status effect modifiers
  const suppressionEffect = attacker.statusEffects.find(e => e.type === 'suppression');
  const accuracyBuff = attacker.statusEffects.find(e => e.type === 'buff_accuracy');
  const debuffAccuracy = attacker.statusEffects.find(e => e.type === 'debuff_accuracy');
  const suppPenalty = suppressionEffect ? 20 : 0;
  const accuracyBonus = accuracyBuff ? 10 : 0;
  const debuffAccuracyPenalty = debuffAccuracy ? 40 : 0;

  const total = Math.min(95, Math.max(5,
    baseAccuracy + weaponAccuracy + flankBonus + heightBonus + accuracyBonus
    - coverPenalty - distancePenalty - suppPenalty - debuffAccuracyPenalty
  ));

  return { baseAccuracy, weaponAccuracy, flankBonus, heightBonus, coverPenalty, distancePenalty, total };
}

// --- Damage ---
export function calculateDamage(
  attacker: Unit,
  defender: Unit,
  critical: boolean,
  grid: TileData[][]
): number {
  const weapon = WEAPONS[attacker.weaponId];
  if (!weapon) return 0;

  const critMult = critical ? 1.5 : 1.0;
  const cover = getCoverBetween(attacker.position, defender.position, grid);
  const flanking = isFlanking(attacker.position, defender.position, grid);

  let coverReduction = 0;
  if (!flanking) {
    if (cover === 'half') coverReduction = weapon.damage * 0.15;
    else if (cover === 'full') coverReduction = weapon.damage * 0.3;
  }

  const rawDamage = weapon.damage * critMult;
  const finalDamage = Math.max(1, Math.round(rawDamage - defender.stats.armor - coverReduction));
  return finalDamage;
}

// --- Crit Chance ---
export function calculateCritChance(
  attacker: Unit,
  defender: Unit,
  grid: TileData[][],
  abilityBonus: number = 0
): number {
  const flanking = isFlanking(attacker.position, defender.position, grid);
  const flankBonus = flanking ? 15 : 0;
  return Math.min(100, Math.max(0, attacker.stats.critChance + flankBonus + abilityBonus));
}

// --- Resolve Attack ---
export function resolveAttack(
  attacker: Unit,
  defender: Unit,
  grid: TileData[][],
  abilityBonus: number = 0,
  roll?: number // 0-100, undefined = random
): AttackResult {
  const hitCalc = calculateHitChance(attacker, defender, grid);
  const critChance = calculateCritChance(attacker, defender, grid, abilityBonus);
  const flanking = isFlanking(attacker.position, defender.position, grid);

  const hitRoll = roll ?? Math.random() * 100;
  const critRoll = Math.random() * 100;

  const hit = hitRoll <= hitCalc.total;
  const critical = hit && critRoll <= critChance;
  const damage = hit ? calculateDamage(attacker, defender, critical, grid) : 0;

  return {
    hit,
    critical,
    damage,
    hitChance: hitCalc.total,
    critChance,
    flanking,
    coverNegated: flanking,
  };
}

// --- Apply Damage ---
export function applyDamage(unit: Unit, damage: number): boolean {
  // Damage to armor first, then health
  const armorDamage = Math.min(unit.stats.armor, damage);
  const healthDamage = damage - armorDamage;

  unit.stats.armor = Math.max(0, unit.stats.armor - armorDamage);
  unit.stats.health = Math.max(0, unit.stats.health - healthDamage);

  if (unit.stats.health <= 0) {
    unit.alive = false;
    eventBus.emit('unit_killed', { unitId: unit.id, faction: unit.faction });
    return true; // killed
  }

  eventBus.emit('unit_damaged', { unitId: unit.id, damage, remainingHealth: unit.stats.health });
  return false;
}

// --- Apply Status Effect ---
export function applyStatusEffect(unit: Unit, effect: StatusEffect): void {
  const existing = unit.statusEffects.find(e => e.type === effect.type);
  if (existing) {
    existing.duration = Math.max(existing.duration, effect.duration);
  } else {
    unit.statusEffects.push({ ...effect });
  }
  eventBus.emit('status_applied', { unitId: unit.id, effect: effect.type, duration: effect.duration });
}

// --- Tick Status Effects ---
export function tickStatusEffects(unit: Unit): void {
  const expired: string[] = [];
  unit.statusEffects = unit.statusEffects.filter(effect => {
    // Apply per-turn damage
    if (effect.damagePerTurn && effect.damagePerTurn > 0) {
      unit.stats.health = Math.max(0, unit.stats.health - effect.damagePerTurn);
      if (unit.stats.health <= 0) {
        unit.alive = false;
        eventBus.emit('unit_killed', { unitId: unit.id, faction: unit.faction, cause: effect.type });
      }
    }
    effect.duration--;
    if (effect.duration <= 0) {
      expired.push(effect.type);
      return false;
    }
    return true;
  });
  expired.forEach(type => {
    eventBus.emit('status_expired', { unitId: unit.id, effect: type });
  });
}
