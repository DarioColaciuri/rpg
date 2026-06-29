export const TILE_SIZE = 32;
export const TILE_AIR = 0;
export const TILE_SOLID = 1;
export const MAP_COLS = 30;
export const MAP_ROWS = 20;

function buildCityTiles() {
  const W = MAP_COLS;
  const H = MAP_ROWS;
  const t = Array.from({ length: H }, () => Array(W).fill(TILE_AIR));

  for (let x = 0; x < W; x++) {
    t[0][x] = TILE_SOLID;
    t[H - 1][x] = TILE_SOLID;
  }
  for (let y = 0; y < H; y++) {
    t[y][0] = TILE_SOLID;
  }

  // buildings
  for (let x = 2; x <= 5; x++) { for (let y = 2; y <= 5; y++) t[y][x] = TILE_SOLID; }
  for (let x = 2; x <= 5; x++) { for (let y = 8; y <= 11; y++) t[y][x] = TILE_SOLID; }

  for (let x = 9; x <= 13; x++) { for (let y = 3; y <= 6; y++) t[y][x] = TILE_SOLID; }

  for (let x = 17; x <= 20; x++) { for (let y = 2; y <= 5; y++) t[y][x] = TILE_SOLID; }
  for (let x = 17; x <= 20; x++) { for (let y = 9; y <= 12; y++) t[y][x] = TILE_SOLID; }

  for (let x = 24; x <= 27; x++) { for (let y = 4; y <= 8; y++) t[y][x] = TILE_SOLID; }

  // fountain in center
  t[10][14] = TILE_SOLID;
  t[10][15] = TILE_SOLID;
  t[9][14] = TILE_SOLID;
  t[9][15] = TILE_SOLID;

  return t;
}

function buildForestTiles() {
  const W = MAP_COLS;
  const H = MAP_ROWS;
  const t = Array.from({ length: H }, () => Array(W).fill(TILE_AIR));

  for (let x = 0; x < W; x++) {
    t[0][x] = TILE_SOLID;
    t[H - 1][x] = TILE_SOLID;
  }
  for (let y = 0; y < H; y++) {
    t[y][W - 1] = TILE_SOLID;
  }

  // tree clusters
  const trees = [
    [3, 3], [4, 3], [3, 4],
    [7, 7], [7, 8], [8, 7],
    [12, 4], [13, 4], [12, 5], [13, 5],
    [18, 10], [18, 11], [19, 10],
    [22, 6], [23, 6], [22, 7], [23, 7],
    [26, 13], [27, 13], [26, 14],
    [5, 14], [5, 15], [6, 14],
    [14, 15], [15, 15], [14, 16], [15, 16], [16, 15],
    [21, 3], [21, 4],
  ];
  for (const [tx, ty] of trees) {
    if (ty >= 0 && ty < H && tx >= 0 && tx < W) {
      t[ty][tx] = TILE_SOLID;
    }
  }

  // rock formations
  t[16][9] = TILE_SOLID;
  t[16][10] = TILE_SOLID;

  return t;
}

function buildMap(name, safe, spawnTx, spawnTy, tiles) {
  return {
    name,
    safe,
    width: MAP_COLS,
    height: MAP_ROWS,
    spawn: { x: spawnTx, y: spawnTy },
    tiles,
    transitions: [],
  };
}

const cityTiles = buildCityTiles();
const forestTiles = buildForestTiles();

export const MAPS = {
  city: buildMap('city', true, 3, 18, cityTiles),
  forest: buildMap('forest', false, 28, 10, forestTiles),
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
  const map = MAPS[mapName];
  if (!map) return null;

  const mapRight = map.width * TILE_SIZE;
  const mapLeft = 0;

  if (mapName === 'city' && px >= mapRight) {
    const targetPy = py;
    const targetPx = TILE_SIZE;
    return { map: 'forest', spawnX: targetPx, spawnY: targetPy };
  }

  if (mapName === 'forest' && px <= mapLeft) {
    const targetPy = py;
    const targetPx = MAPS.city.width * TILE_SIZE - TILE_SIZE;
    return { map: 'city', spawnX: targetPx, spawnY: targetPy };
  }

  return null;
}
