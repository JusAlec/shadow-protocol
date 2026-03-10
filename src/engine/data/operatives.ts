import { Unit } from '../types';

export function createOperative(
  id: string,
  template: 'specter' | 'bulldog' | 'circuit' | 'phantom'
): Unit {
  const templates: Record<string, Omit<Unit, 'id' | 'position' | 'timelinePosition'>> = {
    specter: {
      name: 'Specter',
      class: 'sniper',
      faction: 'player',
      stats: { health: 90, maxHealth: 90, armor: 10, maxArmor: 10, speed: 80, vision: 6, movement: 4, accuracy: 75, critChance: 15 },
      weaponId: 'sniper_rifle',
      abilityIds: ['headshot', 'recon_drone'],
      abilityCooldowns: {},
      statusEffects: [],
      alive: true,
      actionPoints: 2,
      maxActionPoints: 2,
      ammo: 4,
      maxAmmo: 4,
      overwatching: false,
      lastKnownPositions: {},
    },
    bulldog: {
      name: 'Bulldog',
      class: 'assault',
      faction: 'player',
      stats: { health: 120, maxHealth: 120, armor: 20, maxArmor: 20, speed: 70, vision: 3, movement: 5, accuracy: 65, critChance: 10 },
      weaponId: 'assault_rifle',
      abilityIds: ['frag_grenade', 'adrenal_boost'],
      abilityCooldowns: {},
      statusEffects: [],
      alive: true,
      actionPoints: 2,
      maxActionPoints: 2,
      ammo: 8,
      maxAmmo: 8,
      overwatching: false,
      lastKnownPositions: {},
    },
    circuit: {
      name: 'Circuit',
      class: 'engineer',
      faction: 'player',
      stats: { health: 100, maxHealth: 100, armor: 15, maxArmor: 15, speed: 65, vision: 3, movement: 4, accuracy: 60, critChance: 10 },
      weaponId: 'smg',
      abilityIds: ['turret_deploy', 'smoke_screen'],
      abilityCooldowns: {},
      statusEffects: [],
      alive: true,
      actionPoints: 2,
      maxActionPoints: 2,
      ammo: 12,
      maxAmmo: 12,
      overwatching: false,
      lastKnownPositions: {},
    },
    phantom: {
      name: 'Phantom',
      class: 'infiltrator',
      faction: 'player',
      stats: { health: 85, maxHealth: 85, armor: 5, maxArmor: 5, speed: 90, vision: 4, movement: 6, accuracy: 70, critChance: 20 },
      weaponId: 'smg',
      abilityIds: ['flashbang', 'adrenal_boost'],
      abilityCooldowns: {},
      statusEffects: [],
      alive: true,
      actionPoints: 2,
      maxActionPoints: 2,
      ammo: 12,
      maxAmmo: 12,
      overwatching: false,
      lastKnownPositions: {},
    },
  };

  const t = templates[template];
  return {
    ...t,
    id,
    position: { x: 0, y: 0 },
    timelinePosition: 100 - t.stats.speed, // faster units start earlier
  };
}

export function createEnemy(
  id: string,
  template: 'grunt' | 'heavy_trooper' | 'commander'
): Unit {
  const templates: Record<string, Omit<Unit, 'id' | 'position' | 'timelinePosition'>> = {
    grunt: {
      name: 'Grunt',
      class: 'assault',
      faction: 'enemy',
      stats: { health: 80, maxHealth: 80, armor: 5, maxArmor: 5, speed: 60, vision: 3, movement: 4, accuracy: 55, critChance: 5 },
      weaponId: 'enemy_rifle',
      abilityIds: [],
      abilityCooldowns: {},
      statusEffects: [],
      alive: true,
      actionPoints: 2,
      maxActionPoints: 2,
      ammo: 10,
      maxAmmo: 10,
      overwatching: false,
      lastKnownPositions: {},
    },
    heavy_trooper: {
      name: 'Heavy Trooper',
      class: 'heavy',
      faction: 'enemy',
      stats: { health: 140, maxHealth: 140, armor: 25, maxArmor: 25, speed: 50, vision: 2, movement: 3, accuracy: 50, critChance: 5 },
      weaponId: 'enemy_heavy',
      abilityIds: ['suppression'],
      abilityCooldowns: {},
      statusEffects: [],
      alive: true,
      actionPoints: 2,
      maxActionPoints: 2,
      ammo: 15,
      maxAmmo: 15,
      overwatching: false,
      lastKnownPositions: {},
    },
    commander: {
      name: 'Commander',
      class: 'assault',
      faction: 'enemy',
      stats: { health: 100, maxHealth: 100, armor: 15, maxArmor: 15, speed: 70, vision: 4, movement: 5, accuracy: 70, critChance: 15 },
      weaponId: 'enemy_commander',
      abilityIds: ['rally', 'frag_grenade'],
      abilityCooldowns: {},
      statusEffects: [],
      alive: true,
      actionPoints: 2,
      maxActionPoints: 2,
      ammo: 8,
      maxAmmo: 8,
      overwatching: false,
      lastKnownPositions: {},
    },
  };

  const t = templates[template];
  return {
    ...t,
    id,
    position: { x: 0, y: 0 },
    timelinePosition: 100 - t.stats.speed,
  };
}
