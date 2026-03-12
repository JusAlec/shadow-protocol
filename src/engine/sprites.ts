// ============================================================
// Shadow Protocol - Sprite Loading & Path Utilities
// ============================================================
import { FacingDirection } from '@/engine/types';

// Base URL for asset paths (set by Vite's `base` config)
const BASE = import.meta.env.BASE_URL;

// Maps unit template identifiers to their asset folder names
// Characters with hasWalkAnim: true have walk animation frames
const SPRITE_MAP: Record<string, { folder: string; hasWalkAnim: boolean }> = {
  specter: { folder: 'specter', hasWalkAnim: true },
  bulldog: { folder: 'bulldog', hasWalkAnim: true },
  circuit: { folder: 'circuit', hasWalkAnim: true },
  phantom: { folder: 'phantom', hasWalkAnim: true },
  grunt: { folder: 'grunt', hasWalkAnim: true },
  heavy_trooper: { folder: 'heavy_trooper', hasWalkAnim: true },
  commander: { folder: 'commander', hasWalkAnim: true },
  reina: { folder: 'reina', hasWalkAnim: true },
  hydrabad: { folder: 'hydrabad', hasWalkAnim: true },
};

function frameName(frame: number): string {
  return `frame_${String(frame).padStart(3, '0')}`;
}

// Typing animation constants
export const TYPING_FRAME_COUNT = 4;

// Reina shooting animation constants
export const SHOOT_FRAME_COUNT = 4;

/**
 * Returns the URL for a Hydrabad typing-on-macbook animation frame.
 */
export function getTypingAnimationUrl(frame: number): string {
  return `${BASE}assets/characters/hydrabad/animations/custom-typing on his macbook/south/${frameName(frame)}.png`;
}

/**
 * Returns the URL for a Reina shooting animation frame in the given facing direction.
 */
export function getShootAnimationUrl(facing: FacingDirection, frame: number): string {
  return `${BASE}assets/characters/reina/animations/custom-shoot gun/${facing}/${frameName(frame)}.png`;
}

// Reina rally animation constants
export const RALLY_FRAME_COUNT = 4;

/**
 * Returns the URL for a Reina rally animation frame.
 */
export function getRallyAnimationUrl(frame: number): string {
  return `${BASE}assets/characters/reina/animations/rally/south/${frameName(frame)}.png`;
}

/**
 * Returns the correct PNG path for a unit's sprite.
 * Returns null if the unit has no sprite assets (fallback to SVG circle).
 */
export function getSpriteUrl(
  templateId: string,
  facing: FacingDirection,
  animating: boolean,
  frame: number
): string | null {
  const entry = SPRITE_MAP[templateId];
  if (!entry) return null;

  if (animating && entry.hasWalkAnim) {
    return `${BASE}assets/characters/${entry.folder}/animations/walk/${facing}/${frameName(frame)}.png`;
  }
  return `${BASE}assets/characters/${entry.folder}/rotations/${facing}.png`;
}

/**
 * Checks if a character template has sprite assets registered.
 */
export function hasSprite(templateId: string): boolean {
  return templateId in SPRITE_MAP;
}

/**
 * Checks if a character template has walk animation frames.
 */
export function hasWalkAnimation(templateId: string): boolean {
  return SPRITE_MAP[templateId]?.hasWalkAnim ?? false;
}

/**
 * Converts a movement delta (dx, dy) to the corresponding FacingDirection.
 * For 4-directional movement (no diagonals), only cardinal directions are returned.
 * Returns 'south' for (0, 0) as a safe default.
 */
export function deltaToFacing(dx: number, dy: number): FacingDirection {
  if (dx === 0 && dy === 0) return 'south';

  // Normalize to determine primary direction
  if (dx === 0) {
    return dy > 0 ? 'south' : 'north';
  }
  if (dy === 0) {
    return dx > 0 ? 'east' : 'west';
  }

  // Diagonal cases
  if (dx > 0 && dy > 0) return 'south-east';
  if (dx < 0 && dy > 0) return 'south-west';
  if (dx > 0 && dy < 0) return 'north-east';
  return 'north-west';
}

/**
 * Preloads sprite images into browser cache for the given character template IDs.
 */
export function preloadSprites(templateIds: string[]): Promise<void> {
  const facings: FacingDirection[] = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
  const promises: Promise<void>[] = [];

  for (const id of templateIds) {
    const entry = SPRITE_MAP[id];
    if (!entry) continue;

    // Preload idle rotations
    for (const facing of facings) {
      const url = `${BASE}assets/characters/${entry.folder}/rotations/${facing}.png`;
      promises.push(preloadImage(url));
    }

    // Preload walk frames
    if (entry.hasWalkAnim) {
      for (const facing of facings) {
        for (let frame = 0; frame < 6; frame++) {
          const url = `${BASE}assets/characters/${entry.folder}/animations/walk/${facing}/${frameName(frame)}.png`;
          promises.push(preloadImage(url));
        }
      }
    }

    // Preload typing animation frames for hydrabad
    if (id === 'hydrabad') {
      for (let frame = 0; frame < TYPING_FRAME_COUNT; frame++) {
        promises.push(preloadImage(getTypingAnimationUrl(frame)));
      }
    }

    // Preload shooting and rally animation frames for reina
    if (id === 'reina') {
      for (const facing of facings) {
        for (let frame = 0; frame < SHOOT_FRAME_COUNT; frame++) {
          promises.push(preloadImage(getShootAnimationUrl(facing, frame)));
        }
      }
      for (let frame = 0; frame < RALLY_FRAME_COUNT; frame++) {
        promises.push(preloadImage(getRallyAnimationUrl(frame)));
      }
    }
  }

  return Promise.all(promises).then(() => {});
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve(); // Don't fail on missing assets
    img.src = url;
  });
}
