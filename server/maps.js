export const TILE_SIZE = 32;
export const TILE_AIR = 0;
export const TILE_SOLID = 1;
export const TILE_PLATFORM = 2;
export const MAP_COLS = 50;
export const MAP_ROWS = 30;
const PLAYER_H = 64;

function emptyMap() {
  return Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(TILE_AIR));
}

function fillRect(t, sx, sy, w, h, type) {
  for (let y = sy; y < sy + h && y < MAP_ROWS; y++)
    for (let x = sx; x < sx + w && x < MAP_COLS; x++)
      t[y][x] = type;
}

function fillRow(t, y, type, sx, ex) {
  for (let x = sx; x < ex && x < MAP_COLS; x++) t[y][x] = type;
}

function buildCity() {
  const t = emptyMap();

  for (let x = 0; x < MAP_COLS; x++) {
    t[26][x] = TILE_SOLID;
    t[27][x] = TILE_SOLID;
    t[28][x] = TILE_SOLID;
    t[29][x] = TILE_SOLID;
  }

  fillRect(t, 12, 24, 3, 2, TILE_SOLID);
  fillRect(t, 11, 23, 5, 1, TILE_SOLID);

  for (let x = 20; x < 29; x++) t[22][x] = TILE_PLATFORM;

  fillRect(t, 32, 24, 2, 2, TILE_SOLID);
  fillRect(t, 31, 23, 4, 1, TILE_SOLID);

  for (let x = 38; x < 46; x++) t[20][x] = TILE_PLATFORM;

  fillRect(t, 44, 24, 2, 2, TILE_SOLID);
  fillRect(t, 43, 23, 4, 1, TILE_SOLID);

  for (let x = 6; x < 12; x++) t[19][x] = TILE_PLATFORM;

  for (let x = 24; x < 32; x++) t[16][x] = TILE_PLATFORM;

  for (let x = 14; x < 20; x++) t[13][x] = TILE_PLATFORM;

  return t;
}

function buildForest() {
  const t = emptyMap();

  for (let x = 0; x < MAP_COLS; x++) {
    t[26][x] = TILE_SOLID;
    t[27][x] = TILE_SOLID;
    t[28][x] = TILE_SOLID;
    t[29][x] = TILE_SOLID;
  }

  for (let x = 12; x < 20; x++) t[26][x] = TILE_AIR;
  for (let x = 12; x < 20; x++) t[25][x] = TILE_AIR;

  fillRect(t, 5, 24, 2, 2, TILE_SOLID);
  fillRect(t, 4, 23, 4, 1, TILE_SOLID);

  for (let x = 14; x < 21; x++) t[21][x] = TILE_PLATFORM;

  fillRect(t, 24, 24, 2, 2, TILE_SOLID);
  fillRect(t, 23, 23, 4, 1, TILE_SOLID);

  for (let x = 28; x < 36; x++) t[19][x] = TILE_PLATFORM;

  fillRect(t, 39, 24, 2, 2, TILE_SOLID);
  fillRect(t, 38, 23, 4, 1, TILE_SOLID);

  for (let x = 43; x < 48; x++) t[21][x] = TILE_PLATFORM;

  for (let x = 8; x < 15; x++) t[16][x] = TILE_PLATFORM;

  for (let x = 30; x < 38; x++) t[15][x] = TILE_PLATFORM;

  for (let x = 18; x < 25; x++) t[12][x] = TILE_PLATFORM;

  return t;
}

export const MAPS = {
  city: {
    width: MAP_COLS,
    height: MAP_ROWS,
    name: 'City',
    safe: true,
    spawn: { x: 2, y: 25 },
    tiles: buildCity(),
  },
  forest: {
    width: MAP_COLS,
    height: MAP_ROWS,
    name: 'Forest',
    safe: false,
    spawn: { x: 47, y: 25 },
    tiles: buildForest(),
  },
};

export function isWalkable(mapName, x, y) {
  const map = MAPS[mapName];
  if (!map) return false;
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
  return map.tiles[y][x] !== TILE_SOLID;
}

export function isPixelWalkable(mapName, px, py, w, h) {
  const map = MAPS[mapName];
  if (!map) return false;

  const left = px - Math.floor(w / 2);
  const right = px + Math.ceil(w / 2) - 1;
  const top = py - Math.floor(h / 2);
  const bottom = py + Math.ceil(h / 2) - 1;

  const startTX = Math.floor(left / TILE_SIZE);
  const endTX = Math.floor(right / TILE_SIZE);
  const startTY = Math.floor(top / TILE_SIZE);
  const endTY = Math.floor(bottom / TILE_SIZE);

  for (let ty = startTY; ty <= endTY; ty++) {
    for (let tx = startTX; tx <= endTX; tx++) {
      if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return false;
      if (map.tiles[ty][tx] === TILE_SOLID) return false;
    }
  }
  return true;
}

export function checkMapTransition(mapName, px, py) {
  if (mapName === 'city' && px > (MAP_COLS - 1) * TILE_SIZE) {
    const spawnX = TILE_SIZE;
    const spawnY = findGroundY('forest', spawnX);
    return { map: 'forest', spawnX, spawnY };
  }
  if (mapName === 'forest' && px < TILE_SIZE) {
    const spawnX = MAP_COLS * TILE_SIZE - TILE_SIZE;
    const spawnY = findGroundY('city', spawnX);
    return { map: 'city', spawnX, spawnY };
  }
  return null;
}

export function findGroundY(mapName, px) {
  const map = MAPS[mapName];
  if (!map) return 800;
  const tx = Math.floor(px / TILE_SIZE);
  if (tx < 0 || tx >= map.width) return 800;
  for (let y = 1; y < map.height; y++) {
    if (map.tiles[y][tx] === TILE_SOLID && map.tiles[y - 1][tx] !== TILE_SOLID) {
      const groundTopY = y * TILE_SIZE;
      return groundTopY - PLAYER_H / 2;
    }
  }
  return 800;
}
