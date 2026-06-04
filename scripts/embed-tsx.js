const fs = require('fs');
const path = require('path');

const MAPS_DIR = path.join(__dirname, '..', 'client', 'public', 'maps');
const cityPath = path.join(MAPS_DIR, 'city.json');
const tsxPath = path.join(MAPS_DIR, 'tiles_city3.tsx');

const city = JSON.parse(fs.readFileSync(cityPath, 'utf8'));
const extIdx = city.tilesets.findIndex(ts => ts.source === 'tiles_city3.tsx');
if (extIdx === -1) { console.log('No external tileset found'); process.exit(0); }

const tsxRaw = fs.readFileSync(tsxPath, 'utf8');

const tsMatch = tsxRaw.match(/<tileset\s+([^>]+)>/);
const attrs = tsMatch[1];
const getAttr = (name) => { const m = attrs.match(new RegExp(name + '="([^"]+)"')); return m ? m[1] : null; };

const name = getAttr('name') || 'tiles_city3';
const tilewidth = parseInt(getAttr('tilewidth') || '32');
const tileheight = parseInt(getAttr('tileheight') || '32');
const tilecount = parseInt(getAttr('tilecount') || '1');
const columns = parseInt(getAttr('columns') || '0');

const imgMatch = tsxRaw.match(/<image\s+source="([^"]+)"\s+width="(\d+)"\s+height="(\d+)"/);
if (!imgMatch) { console.log('No image found in tsx'); process.exit(1); }
const image = imgMatch[1];
const imagewidth = parseInt(imgMatch[2]);
const imageheight = parseInt(imgMatch[3]);

const tiles = [];
const tileRegex = /<tile\s+id="(\d+)"[^>]*>([\s\S]*?)<\/tile>/g;
let m;
while ((m = tileRegex.exec(tsxRaw)) !== null) {
  const id = parseInt(m[1]);
  const inner = m[2];
  const props = [];
  const propRegex = /<property\s+name="([^"]+)"\s+value="([^"]+)"/g;
  let pm;
  while ((pm = propRegex.exec(inner)) !== null) {
    props.push({ name: pm[1], type: 'string', value: pm[2] });
  }
  if (props.length > 0) tiles.push({ id, properties: props });
}

city.tilesets[extIdx] = {
  firstgid: 53,
  name,
  image,
  imagewidth,
  imageheight,
  tilewidth,
  tileheight,
  tilecount,
  columns,
  tiles,
};

fs.writeFileSync(cityPath, JSON.stringify(city, null, 2) + '\n');
console.log('Embedded tiles_city3: ' + tiles.length + ' tiles with properties');
