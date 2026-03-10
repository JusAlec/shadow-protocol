

# Shadow Protocol – Tactical Combat Vertical Slice

## Overview
A fully playable turn-based tactical combat prototype built as a web app with SVG-rendered 12×12 grid maps, featuring dynamic initiative combat, fog of war, AI behavior trees, destructible environments, and momentum combos. Supabase backend for persistence and simulation data.

---

## Phase 1: Engine Core & Data Layer

### Game Data System
- Define TypeScript types/interfaces for all game entities: Operatives, Enemies, Weapons, Abilities, Tiles, Gadgets
- Create JSON data files for all entity definitions (from the uploaded schemas)
- Build a data registry that loads and indexes all game data at startup

### Event System
- Publish/subscribe event bus for decoupled communication between systems (damage dealt, unit moved, cover destroyed, etc.)

### Supabase Setup
- **Tables**: `game_sessions`, `simulation_runs`, `simulation_results`, `balance_logs`
- Auth for saving/loading games and viewing simulation dashboards
- Edge functions for running batch simulations server-side

---

## Phase 2: Tactical Map & Tile System

### SVG Grid Renderer
- 12×12 interactive SVG grid with pan/zoom support
- Tile rendering with visual distinction: floor, half cover, full cover, walls, hazards, elevation
- Click-to-select and hover highlighting
- Movement range overlay (highlighted reachable tiles)
- Attack range and line-of-sight overlays

### Tile Logic
- Tile data: movement blocking, vision blocking, cover value, destructibility, health, destruction events
- Elevation system: +1 vision, +10% accuracy for elevated units
- Pathfinding (A* or BFS) respecting movement-blocking tiles

---

## Phase 3: Combat Systems

### Initiative Timeline
- Continuous timeline model: units ordered by timeline position
- After each action, next turn = current position + (action cost / speed)
- Visual timeline bar showing upcoming turn order
- Action costs: Move(30), Shoot(40), Ability(50), Heavy(60), Reload(25)

### Combat Rules Engine
- **Hit calculation**: BaseAccuracy + WeaponAccuracy + FlankBonus + HeightBonus - CoverPenalty - DistancePenalty
- **Damage calculation**: (WeaponDamage × CritMultiplier) - Armor - CoverReduction
- **Critical hits**: BaseCrit + FlankBonus + AbilityBonus
- Deterministic formulas with optional random roll

### Cover System
- None (0%), Half Cover (30%), Full Cover (60%), Wall (blocks LOS)
- Flanking detection: if attacker bypasses cover direction, cover bonus removed
- Flanking grants +hit chance and +crit chance

### Fog of War
- Per-tile visibility states: Visible, Detected (last known), Hidden
- Vision range per class (Melee:1 → Sniper:5-6)
- Line-of-sight raycasting blocked by full cover/walls
- Shared squad vision — all operatives contribute to visible area
- Updates after every move or destruction event

### Momentum System
- Shared squad momentum meter (threshold: 10)
- Gains: Flank(+2), Crit(+2), Kill(+3), Destroy Cover(+1), Combo(+2)
- Decay on misses, wasted turns, lost operatives
- Unlockable squad combos: Tactical Barrage, Breach Assault, Coordinated Strike

### Ability System
- Data-driven ability definitions (cost, cooldown, target rules, effects)
- Ability types: attack, gadget, buff
- Execution flow: validate → deduct cost → apply effects → update timeline → apply cooldown
- Status effects: stun, poison, suppression with duration tracking

### Environment & Destruction
- Destructible objects: Crate, Barrier, Vehicle, Explosive Barrel
- Objects have health, destruction triggers, and status effects
- Example: destroy gas canister → spawn poison cloud on nearby tiles
- Environmental hazards: electric fields, fire, poison clouds

---

## Phase 4: Enemy AI

### Awareness System
- Four states: Unaware → Suspicious → Alerted → Engaged
- State transitions based on: line of sight, noise events, allied alerts
- Communication radius: 3 tiles (instant), 6 tiles (delayed)

### Behavior Tree Engine
- Tree nodes: Selector, Sequence, Condition, Action
- **Combat tree**: Evaluate Threat → Seek Cover → Use Ability → Attack → Reposition
- **Investigation tree**: Move to noise source → Scan nearby → Return to patrol
- **Retreat behavior**: Health < 25% → Seek safe cover → Call for backup

### Target Selection
- Priority: lowest health → closest → last attacker

### Tactical Evaluation
- Cover scoring: cover value + distance to target + flanking potential
- Flanking logic: attempt flank if path available, else best cover
- Ability usage rules per enemy type (e.g., Heavy Trooper uses Suppression when 2+ visible enemies)

---

## Phase 5: Game UI

### Tactical HUD
- Squad portraits with health/armor bars and status icons
- Selected unit detail panel (stats, abilities, ammo)
- Action buttons: Move, Shoot, Ability, Reload, Overwatch, End Turn
- Hit chance indicator on hover over enemies
- Momentum meter with combo ability buttons

### Initiative Timeline Bar
- Horizontal timeline showing all units in turn order
- Current unit highlighted, upcoming turns visible
- Preview of timeline shift when hovering actions

### Targeting Overlay
- Line-of-sight indicator from selected unit to target
- Hit chance percentage display
- Cover indicator on target
- Area-of-effect preview for abilities

### Game Flow UI
- Mission briefing screen
- Squad selection (pick 4 operatives)
- Victory/defeat screen with stats summary
- Save/load game via Supabase

---

## Phase 6: Simulation & Balance

### Combat Simulator
- Automated combat runner: random encounters with configurable parameters
- Run batches of simulations (100-10,000 fights)
- Collect metrics: turns to win, damage taken, kill rate, ability usage frequency

### Balance Dashboard
- Recharts-powered analytics dashboard
- Win rate by operative composition
- Ability usage frequency and correlation with win rate
- Auto-detection of imbalance: flag abilities with >60% usage and >70% win rate
- Class performance comparison charts

### Auto-Balance Loop
- Iterative simulation passes adjusting ability values
- Target: ~55% player win rate
- Log all adjustments to Supabase for tracking

---

## Phase 7: Demo Scenario

### Playable Mission
- One hand-crafted 12×12 map with varied terrain (cover, elevation, hazards, destructibles)
- 4 player operatives: Sniper, Assault, Engineer, Infiltrator
- Enemy squad: mix of Grunts, Heavy Troopers, and a Commander
- Objective: eliminate all enemies
- Full fog of war, AI awareness, destructible environment, and momentum mechanics active

