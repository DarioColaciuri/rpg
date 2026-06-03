import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = join(__dirname, '..', 'client', 'public', 'maps');

export const TILE_SIZE = 32;
export const TILE_AIR = 0;
export const TILE_SOLID = 1;
export const TILE_PLATFORM = 2;
export const MAP_COLS = 50;
export const MAP_ROWS = 30;
const PLAYER_H = 64;

// GID to type mapping (GID 1=air, 2=solid, 3=platform)
function gidToType(gid) {
  if (gid === 2) return TILE_SOLID;
  if (gid === 3) return TILE_PLATFORM;
  return TILE_AIR;
}

function loadTiledMap(mapName) {
  try {
    const raw = readFileSync(join(MAPS_DIR, `${mapName}.json`), 'utf8');
    const json = JSON.parse(raw);

    // Build 2D tiles array from 1D data layer
    const w = json.width;
    const h = json.height;
    const tiles = Array.from({ length: h }, () => Array(w).fill(TILE_AIR));
    const groundLayer = json.layers.find(l => l.type === 'tilelayer');
    if (groundLayer) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const gid = groundLayer.data[y * w + x];
          tiles[y][x] = gidToType(gid);
        }
      }
    }

    // Properties
    const props = {};
    if (json.properties) {
      for (const p of json.properties) {
        props[p.name] = p.value;
      }
    }

    // Transitions from object layer
    const objectsLayer = json.layers.find(l => l.type === 'objectgroup');
    const transitions = [];
    if (objectsLayer) {
      for (const obj of objectsLayer.objects) {
        if (obj.type === 'transition' && obj.properties) {
          const target = obj.properties.find(p => p.name === 'target');
          if (target) {
            transitions.push({
              target: target.value,
              x: obj.x,
              y: obj.y,
              width: obj.width,
              height: obj.height,
            });
          }
        }
      }
    }

    return {
      width: w,
      height: h,
      name: props.name || mapName,
      safe: props.safe ?? true,
      spawn: { x: props.spawnX ?? 2, y: props.spawnY ?? 25 },
      tiles,
      transitions,
    };
  } catch (err) {
    console.error(`Failed to load map ${mapName}:`, err.message);
    return null;
  }
}

export const MAPS = {
  city: loadTiledMap('city'),
  forest: loadTiledMap('forest'),
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

  for (const t of map.transitions) {
    if (px >= t.x && px <= t.x + t.width && py >= t.y && py <= t.y + t.height) {
      const targetMap = MAPS[t.target];
      if (!targetMap) continue;
      const spawnX = t.target === 'city'
        ? (MAP_COLS - 1) * TILE_SIZE
        : TILE_SIZE;
      const spawnY = findGroundY(t.target, spawnX);
      return { map: t.target, spawnX, spawnY };
    }
  }

  // Legacy hardcoded for backwards compat
  if (mapName === 'city' && px > (MAP_COLS - 1) * TILE_SIZE) {
    return { map: 'forest', spawnX: TILE_SIZE, spawnY: findGroundY('forest', TILE_SIZE) };
  }
  if (mapName === 'forest' && px < TILE_SIZE) {
    return { map: 'city', spawnX: (MAP_COLS - 1) * TILE_SIZE, spawnY: findGroundY('city', (MAP_COLS - 1) * TILE_SIZE) };
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
      return y * TILE_SIZE - PLAYER_H / 2;
    }
  }
  return 800;
}
