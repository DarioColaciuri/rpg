import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = join(__dirname, '..', 'client', 'public', 'maps');

const OLD_W = 50;
const OLD_H = 30;
const NEW_W = 200;
const NEW_H = 120;

// GID 1 = air, GID 2 = solid, GID 3 = platform
const GID_AIR = 1;
const GID_SOLID = 2;

const NEW_GROUND = 4; // rows of solid ground at bottom
const NEW_SOLID_ROW_START = NEW_H - NEW_GROUND;

function expandMap(fileName) {
  const filePath = join(MAPS_DIR, fileName);
  const json = JSON.parse(readFileSync(filePath, 'utf8'));

  const groundLayer = json.layers.find(l => l.type === 'tilelayer');
  if (!groundLayer) {
    console.error(`No tilelayer found in ${fileName}`);
    return;
  }

  const oldData = groundLayer.data;
  const newData = [];

  for (let y = 0; y < NEW_H; y++) {
    for (let x = 0; x < NEW_W; x++) {
      if (y >= NEW_SOLID_ROW_START) {
        newData.push(GID_SOLID);
      } else if (y < OLD_H && x < OLD_W) {
        newData.push(oldData[y * OLD_W + x]);
      } else {
        newData.push(GID_AIR);
      }
    }
  }

  groundLayer.width = NEW_W;
  groundLayer.height = NEW_H;
  groundLayer.data = newData;

  json.width = NEW_W;
  json.height = NEW_H;

  const objectsLayer = json.layers.find(l => l.type === 'objectgroup');
  if (objectsLayer) {
    const newMapPixelH = NEW_H * 32;
    for (const obj of objectsLayer.objects) {
      obj.height = newMapPixelH;
      if (obj.properties) {
        const target = obj.properties.find(p => p.name === 'target');
        if (target) {
          if (target.value === 'forest') {
            obj.x = NEW_W * 32;
          }
        }
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
  console.log(`Expanded ${fileName}: ${OLD_W}x${OLD_H} -> ${NEW_W}x${NEW_H}`);
}

expandMap('city.json');
expandMap('forest.json');
console.log('Done.');
