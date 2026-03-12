# Shadow Protocol

**A turn-based tactical combat game built with React, TypeScript, and Web Audio API.**

[Play Now](https://JusAlec.github.io/shadow-protocol/) | [Report Bug](https://github.com/JusAlec/shadow-protocol/issues)

---

## Overview

Shadow Protocol is a squad-based tactical combat game where you command a team of elite operatives against hostile forces on a grid-based battlefield. Featuring deep combat mechanics, environmental destruction, fog of war, and a momentum-driven combo system.

---

## Features

### Squad Operatives

Six unique playable operatives, each with distinct classes, weapons, and abilities:

| Operative | Class | Weapon | HP | Signature Abilities |
|-----------|-------|--------|----|---------------------|
| **Specter** | Sniper | SR-7 Longbow | 90 | Headshot (+40% crit), Recon Drone (area reveal) |
| **Bulldog** | Assault | AR-15 Phantom | 120 | Frag Grenade (AoE), Adrenal Boost (speed buff) |
| **Circuit** | Engineer | VX-9 Whisper | 100 | Turret Deploy, Smoke Screen (blocks LOS) |
| **Phantom** | Infiltrator | VX-9 Whisper | 85 | Flashbang (AoE stun), Adrenal Boost |
| **Reina** | Assault | Desert Eagle | 100 | Golden Eagle (multi-shot burst), Rally (AoE AP buff) |
| **Hydrabad** | Engineer | Macbook Air | 75 | Hack: IT / Security / Payroll / Great Firewall |

### Elite Operative Animations

Reina and Hydrabad feature custom 3-phase elite ability animations:
- **Scale up** from idle sprite
- **Custom sprite animation** (typing on macbook, shooting, rally poses)
- **Crossfade back** to idle sprite with scale down

### Combat System

- **Action Points (AP)** — each action costs AP; manage your budget per turn
- **Hit Calculation** — base accuracy + weapon bonus, modified by cover, flanking, elevation, range, and status effects
- **Critical Hits** — base crit chance boosted by flanking and abilities
- **Flanking** — attack from an uncovered angle to bypass cover and gain +15% hit/crit
- **Elevation** — higher ground grants +10% accuracy
- **Armor System** — damage reduces armor before HP
- **Ammo Management** — reload costs AP; Golden Eagle dumps entire magazine
- **Overwatch** — opportunity attacks on enemy movement

### Momentum and Combos

Earn momentum through tactical play:
| Action | Momentum |
|--------|----------|
| Flank | +2 |
| Critical Hit | +2 |
| Kill | +3 |
| Destroy Cover | +1 |
| Combo | +2 |
| Miss | -1 |
| Operative Lost | -3 |

At 10 momentum, unlock powerful combo abilities: Tactical Barrage, Breach Assault, or Coordinated Strike.

### Terrain and Environment

12x12 grid battlefield with interactive terrain:

- **Cover** — half cover (-30% incoming damage) and full cover (-60%, blocks vision)
- **Destructible Objects** — crates (40 HP), barriers (60 HP), vehicles (100 HP, explode on destruction)
- **Environmental Hazards** — explosive barrels, gas canisters (spawn poison clouds), electric/fire/poison tiles
- **Smoke** — blocks line of sight for all units
- **Elevation** — elevated tiles grant accuracy and vision bonuses
- **Chain Reactions** — destroying explosive objects damages and destroys nearby destructibles

### Fog of War

- Three visibility states: **visible**, **detected**, **hidden**
- Line of sight calculated via Bresenham algorithm
- Smoke clouds block all vision
- Recon abilities reveal hidden areas

### Enemy AI

Three enemy types with tactical AI:

| Enemy | Class | HP | Special |
|-------|-------|----|---------|
| **Grunt** | Assault | 80 | Standard infantry |
| **Heavy Trooper** | Heavy | 140 | Suppression fire (AoE accuracy debuff) |
| **Commander** | Assault | 100 | Rally (buff allies), Frag Grenade |

AI features awareness states (unaware, suspicious, alerted, engaged), patrol paths, noise detection, and tactical decision-making.

### Status Effects

Stun, Poison, Burn, Shock, Suppression, Intimidate, Speed/Accuracy buffs and debuffs — each with turn-based duration tracking.

### Audio

- **Procedural sounds** via Web Audio API — gunshots, explosions, flashbangs, footsteps, construction, drones, stimulants
- **MP3 audio** for elite abilities — Hydrabad's hacking sequence, Golden Eagle shots (synced per-projectile to animation progress), Reina's rally call

### UI

- **Tactical Map** — SVG renderer with 8-directional sprites, fog of war filters, movement/attack range overlays, hover damage previews
- **HUD Panel** — squad portraits, active unit stats, action buttons with keyboard shortcuts (M/S/R/O), ability list with number keys (1-4)
- **Initiative Timeline** — turn order bar showing next 12 units
- **Combat Log** — color-coded event log with turn markers

---

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** (build tooling)
- **Tailwind CSS** + **shadcn/ui**
- **Web Audio API** (procedural + MP3 audio)
- **SVG** (tactical map rendering)
- **GitHub Actions** (CI/CD to GitHub Pages)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22+
- npm

### Local Development

```sh
# Clone the repository
git clone https://github.com/JusAlec/shadow-protocol.git

# Navigate to the project directory
cd shadow-protocol

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Build

```sh
npm run build
```

### Test

```sh
npm test
```

---

## Deployment

The project auto-deploys to GitHub Pages via GitHub Actions on push to `main`.

Live at: **https://JusAlec.github.io/shadow-protocol/**

---

## Controls

| Key | Action |
|-----|--------|
| **M** | Move mode |
| **S** | Shoot mode |
| **R** | Reload |
| **O** | Overwatch |
| **1-4** | Activate ability |
| **Click** | Select unit / Confirm action |

---

## License

All rights reserved.
