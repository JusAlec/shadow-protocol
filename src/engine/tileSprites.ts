// ============================================================
// Shadow Protocol - Tile Sprite Loading & Path Utilities
// ============================================================
import { TileType } from '@/engine/types';

const BASE = import.meta.env.BASE_URL;

// Maps TileType to asset path relative to public/assets/tiles/
const TILE_SPRITE_MAP: Record<TileType, string> = {
  floor: 'terrain/floor.png',
  elevated: 'terrain/elevated.png',
  hazard_electric: 'terrain/hazard_electric.png',
  hazard_fire: 'terrain/hazard_fire.png',
  hazard_poison: 'terrain/hazard_poison.png',
  wall: 'structures/wall.png',
  half_cover: 'structures/half_cover.png',
  full_cover: 'structures/full_cover.png',
  destructible_crate: 'objects/destructible_crate.png',
  destructible_barrier: 'objects/destructible_barrier.png',
  destructible_vehicle: 'objects/destructible_vehicle.png',
  explosive_barrel: 'objects/explosive_barrel.png',
  gas_canister: 'objects/gas_canister.png',
};

// Track which sprites loaded successfully
const loadedSprites = new Set<TileType>();

export function getTileSpriteUrl(tileType: TileType): string {
  return `${BASE}assets/tiles/${TILE_SPRITE_MAP[tileType]}`;
}

export function hasTileSprite(tileType: TileType): boolean {
  return loadedSprites.has(tileType);
}

export function preloadTileSprites(): Promise<void> {
  const tileTypes = Object.keys(TILE_SPRITE_MAP) as TileType[];
  const promises = tileTypes.map((tileType) => {
    const url = getTileSpriteUrl(tileType);
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        loadedSprites.add(tileType);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  });
  return Promise.all(promises).then(() => {});
}
