// ============================================================
// Shadow Protocol - Core Game Types
// ============================================================

// --- Positions & Grid ---
export interface Position {
  x: number;
  y: number;
}

export type CoverType = 'none' | 'half' | 'full' | 'wall';
export type CoverDirection = 'north' | 'south' | 'east' | 'west';

export type TileType =
  | 'floor'
  | 'half_cover'
  | 'full_cover'
  | 'wall'
  | 'elevated'
  | 'hazard_electric'
  | 'hazard_fire'
  | 'hazard_poison'
  | 'destructible_crate'
  | 'destructible_barrier'
  | 'destructible_vehicle'
  | 'explosive_barrel'
  | 'gas_canister';

export interface TileData {
  type: TileType;
  position: Position;
  blocksMovement: boolean;
  blocksVision: boolean;
  coverValue: CoverType;
  coverDirections: CoverDirection[];
  elevation: number; // 0 = ground, 1+ = elevated
  destructible: boolean;
  health: number;
  maxHealth: number;
  onDestroy?: DestructionEvent;
  hazardEffect?: StatusEffectType;
  hazardDamage?: number;
  occupied: boolean;
  occupantId?: string;
  smoke?: number; // turns remaining for smoke cloud, undefined = no smoke
}

export type DestructionEvent =
  | 'spawn_poison_cloud'
  | 'spawn_fire'
  | 'spawn_electric_field'
  | 'explode'
  | 'collapse';

// --- Visibility ---
export type VisibilityState = 'visible' | 'detected' | 'hidden';

export interface VisibilityMap {
  [key: string]: VisibilityState; // key = `${x},${y}`
}

// --- Status Effects ---
export type StatusEffectType = 'stun' | 'poison' | 'suppression' | 'burn' | 'shock' | 'buff_speed' | 'buff_accuracy' | 'intimidate' | 'rally_ap' | 'debuff_speed' | 'debuff_accuracy';

export interface StatusEffect {
  type: StatusEffectType;
  duration: number; // turns remaining
  damagePerTurn?: number;
  source?: string;
}

// --- Facing & Direction ---
export type FacingDirection = 'south' | 'south-west' | 'west' | 'north-west' | 'north' | 'north-east' | 'east' | 'south-east';

// --- Operatives & Units ---
export type OperativeClass = 'sniper' | 'assault' | 'engineer' | 'infiltrator' | 'heavy' | 'medic';
export type Faction = 'player' | 'enemy';

export interface UnitStats {
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  speed: number;
  vision: number;
  movement: number; // tiles per move action
  accuracy: number;
  critChance: number;
}

export interface Unit {
  id: string;
  templateId: string;
  name: string;
  class: OperativeClass;
  faction: Faction;
  stats: UnitStats;
  position: Position;
  weaponId: string;
  abilityIds: string[];
  abilityCooldowns: Record<string, number>;
  statusEffects: StatusEffect[];
  timelinePosition: number;
  alive: boolean;
  actionPoints: number;
  maxActionPoints: number;
  ammo: number;
  maxAmmo: number;
  overwatching: boolean;
  facing: FacingDirection;
  lastKnownPositions: Record<string, Position>; // enemy id → last seen pos
}

// --- Weapons ---
export interface Weapon {
  id: string;
  name: string;
  damage: number;
  accuracy: number;
  critBonus: number;
  range: number;
  optimalRange: number;
  ammoCapacity: number;
}

// --- Abilities ---
export type AbilityType = 'attack' | 'gadget' | 'buff' | 'heal';
export type TargetType = 'single' | 'area' | 'self' | 'line';

export interface AbilityDefinition {
  id: string;
  name: string;
  type: AbilityType;
  cost: number; // action points
  timelineCost: number; // initiative cost
  cooldown: number;
  targetType: TargetType;
  range?: number;
  radius?: number;
  damage?: number;
  healing?: number;
  critBonus?: number;
  effects?: { status: StatusEffectType; duration: number; chance?: number }[];
  description: string;
}

// --- Momentum ---
export interface MomentumState {
  current: number;
  threshold: number;
  comboAvailable: boolean;
}

export type MomentumEvent = 'flank' | 'critical_hit' | 'kill' | 'destroy_cover' | 'combo' | 'miss' | 'wasted_turn' | 'operative_lost';

export const MOMENTUM_VALUES: Record<MomentumEvent, number> = {
  flank: 2,
  critical_hit: 2,
  kill: 3,
  destroy_cover: 1,
  combo: 2,
  miss: -1,
  wasted_turn: -1,
  operative_lost: -3,
};

// --- AI ---
export type AwarenessState = 'unaware' | 'suspicious' | 'alerted' | 'engaged';

export interface AIState {
  awareness: AwarenessState;
  lastKnownPlayerPosition?: Position;
  noiseSource?: Position;
  patrolPath: Position[];
  patrolIndex: number;
  alertCooldown: number;
}

// --- Initiative Timeline ---
export interface TimelineEntry {
  unitId: string;
  position: number; // lower = sooner
}

export const ACTION_COSTS: Record<string, number> = {
  move: 30,
  shoot: 40,
  ability: 50,
  heavy_attack: 60,
  reload: 25,
  overwatch: 35,
  end_turn: 20,
};

// --- Combat Animation ---
export interface CombatAnimation {
  type: 'projectile' | 'ability' | 'buff' | 'flashbang' | 'construction' | 'drone' | 'stimulant' | 'typing' | 'golden_eagle' | 'reina_rally';
  from: Position;
  to: Position;
  hit: boolean;
  damage: number;
  critical: boolean;
  duration: number; // ms
  radius?: number; // blast radius for AoE abilities
  shotCount?: number; // number of individual shots (Golden Eagle)
  perShotDamages?: number[]; // damage per shot (Golden Eagle)
  casterFacing?: FacingDirection; // facing direction of the caster (for directional animations)
}

// --- Smoke Cloud ---
export interface SmokeCloud {
  center: Position;
  radius: number;
  turnsRemaining: number;
}

// --- Deployed Drone ---
export interface DeployedDrone {
  id: string;
  position: Position;
  ownerId: string;
  radius: number;
  health: number;
  maxHealth: number;
  turnsRemaining: number;
}

// --- Deployed Turret ---
export interface DeployedTurret {
  id: string;
  position: Position;
  ownerId: string;
  damage: number;
  range: number;
  health: number;
  maxHealth: number;
  turnsRemaining: number;
}

// --- Game State ---
export type GamePhase = 'deployment' | 'player_turn' | 'enemy_turn' | 'resolution' | 'victory' | 'defeat';

export interface GameState {
  phase: GamePhase;
  turn: number;
  units: Unit[];
  grid: TileData[][];
  timeline: TimelineEntry[];
  activeUnitId: string | null;
  momentum: MomentumState;
  visibility: Record<string, VisibilityMap>; // unitId → visibility
  squadVisibility: VisibilityMap; // combined player squad vision
  selectedAction: string | null;
  targetingMode: boolean;
  hoveredTile: Position | null;
  movementRange: Position[];
  attackRange: Position[];
  combatLog: CombatLogEntry[];
  pendingPath: { unitId: string; path: Position[] } | null;
  pendingCombatAnimation: CombatAnimation | null;
  turrets: DeployedTurret[];
  drones: DeployedDrone[];
  smokeClouds: SmokeCloud[];
  pendingCombo: string | null;
  mapWidth: number;
  mapHeight: number;
}

export interface CombatLogEntry {
  turn: number;
  timestamp: number;
  message: string;
  type: 'damage' | 'kill' | 'ability' | 'movement' | 'status' | 'environment' | 'momentum' | 'info';
}

// --- Combat Resolution ---
export interface AttackResult {
  hit: boolean;
  critical: boolean;
  damage: number;
  hitChance: number;
  critChance: number;
  flanking: boolean;
  coverNegated: boolean;
}

export interface HitCalculation {
  baseAccuracy: number;
  weaponAccuracy: number;
  flankBonus: number;
  heightBonus: number;
  coverPenalty: number;
  distancePenalty: number;
  total: number;
}
