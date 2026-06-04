export const TILE_SIZE = 32;
export const MAP_COLS = 100;
export const MAP_ROWS = 60;

export function checkMapTransition(mapName, px) {
  if (mapName === 'city' && px > (MAP_COLS - 1) * TILE_SIZE) {
    return { map: 'forest', spawnX: TILE_SIZE, spawnY: 800 };
  }
  if (mapName === 'forest' && px < TILE_SIZE) {
    return { map: 'city', spawnX: (MAP_COLS - 1) * TILE_SIZE, spawnY: 800 };
  }
  return null;
}
