import Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS, checkMapTransition } from './maps.js';
import Player from './Player.js';
import { preloadSpritesheets, createAnimations } from './animations.js';
import { gameSocket } from '../network/websocket.js';

const PLAYER_W = 32;
const PLAYER_H = 64;
const SYNC_INTERVAL = 80;
const SYNC_MIN_DIST = 3;

const ITEM_COLORS = {
  apple: 0xff4444,
  water: 0x4444ff,
  gold_pile: 0xffcc00,
};

const ENEMY_VISUALS = {
  rat:      { color: 0x888888, stroke: 0xaaaaaa, shape: 'rect', w: 16, h: 14 },
  bat:      { color: 0x664488, stroke: 0x8866aa, shape: 'circle', radius: 10, h: 20 },
  snake:    { color: 0x44aa44, stroke: 0x66cc66, shape: 'rect', w: 32, h: 14 },
  scorpion: { color: 0xcc8844, stroke: 0xeeaa66, shape: 'rect', w: 24, h: 18 },
  wolf:     { color: 0x886644, stroke: 0xaa8866, shape: 'rect', w: 32, h: 24 },
  goblin:   { color: 0x44aa22, stroke: 0x66cc44, shape: 'rect', w: 22, h: 36 },
};

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.playerSprites = new Map();
    this.myId = null;
    this.currentMap = null;
    this.currentLayer = null;
    this.currentMapData = null;
    this.cursors = null;
    this.ctrlKey = null;
    this.shiftKey = null;
    this.onError = null;
    this.solidGroup = null;
    this.boundaryGroup = null;
    this._solidCollider = null;
    this._lastSyncTime = 0;
    this._lastSentX = 0;
    this._lastSentY = 0;
    this._lastSentAnim = 'walk';
    this._movePending = null;
    this._transitioning = false;
    this.groundItemSprites = new Map();
    this.npcSprites = new Map();
    this._lastNpcClick = { id: null, time: 0 };
    this._npcClickTimer = null;
    this._onOpenShop = null;
    this._localStamina = 20;
    this._lastRunTick = 0;
    this._audioCtx = null;
    this._isDead = false;
    this._onDied = null;
    this._onDropRequest = null;
    this._lastCursorSpell = null;
    this._isMeditating = false;
    this.enemySprites = new Map();
    this._bgImage = null;
    this.thinGroup = null;
    this._sWasDown = false;
    this._parallaxLayers = [];
    this._parallaxTweens = [];
  }

  setMyId(id) {
    this.myId = id;
  }

  setOnErrorCallback(fn) {
    this.onError = fn;
  }

  setOnOpenShop(fn) {
    this._onOpenShop = fn;
  }

  setOnDied(fn) {
    this._onDied = fn;
  }

  setOnDropRequest(fn) {
    this._onDropRequest = fn;
  }

  preload() {
    preloadSpritesheets(this);
    this.load.tilemapTiledJSON('city', 'maps/city.json');
    this.load.tilemapTiledJSON('forest', 'maps/forest.json');
    this.load.image('tiles_city', 'maps/tiles_city2.png');
    this.load.image('tiles_city3', 'maps/tiles_city3.png');
    this.load.image('tiles_forest', 'maps/tiles_forest.png');
  }

  create() {
    createAnimations(this);
    this._generateParallaxTextures();

    const KEY_W = Phaser.Input.Keyboard.KeyCodes.W;
    const KEY_A = Phaser.Input.Keyboard.KeyCodes.A;
    const KEY_S = Phaser.Input.Keyboard.KeyCodes.S;
    const KEY_D = Phaser.Input.Keyboard.KeyCodes.D;
    this.cursors = this.input.keyboard.addKeys({
      w: KEY_W, a: KEY_A, s: KEY_S, d: KEY_D,
    }, false);
    this.ctrlKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL, false);
    this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false);
    this.fKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.tKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.uKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
    this.qKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.numKeys = [
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SEVEN),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.EIGHT),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NINE),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO),
    ];
    this.input.keyboard.clearCaptures();

    this.remoteGroup = this.add.group();
    this.enemyBodyGroup = this.physics.add.staticGroup();

    this._showRuler = false;
    this._rulerKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this._rulerText = this.add.text(0, 0, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 1).setDepth(200);
    this._rulerGfx = this.add.graphics().setDepth(199);

    this.input.on('pointerdown', (pointer) => {
      const clickPx = pointer.worldX;
      const clickPy = pointer.worldY;

      for (const [id, npc] of this.npcSprites) {
        const dx = Math.abs(npc.data.px - clickPx);
        const dy = Math.abs(npc.data.py - clickPy);
        if (dx < 24 && dy < 48) {
          if (this._npcClickTimer) clearTimeout(this._npcClickTimer);
          const now = Date.now();
          if (this._lastNpcClick.id === id && now - this._lastNpcClick.time < 400) {
            this._lastNpcClick = { id: null, time: 0 };
            if (this._onOpenShop) this._onOpenShop();
          } else {
            this._lastNpcClick = { id, time: now };
            this._npcClickTimer = setTimeout(() => {
              if (this.npcSprites.has(id)) {
                this.showNpcBubble(id, 'Hola hazme doble click para comprar objetos', 10000);
              }
            }, 400);
          }
          return;
        }
      }

      if (!gameSocket.selectedSpell) return;

      let targetId = null;
      for (const [id, sprite] of this.playerSprites) {
        if (id === this.myId) continue;
        const dx = Math.abs(sprite.x - clickPx);
        const dy = Math.abs(sprite.y - clickPy);
        if (dx < 24 && dy < 40) { targetId = id; break; }
      }
      if (!targetId) {
        for (const [id, entry] of this.enemySprites) {
          const dx = Math.abs(entry.data.px - clickPx);
          const dy = Math.abs(entry.data.py - clickPy);
          if (dx < 22 && dy < 22) { targetId = id; break; }
        }
      }

      if (!targetId) {
        if (this.onError) this.onError('Objetivo invalido');
        return;
      }

      gameSocket.send('cast_spell', { targetId, spellKey: gameSocket.selectedSpell });
      gameSocket.selectedSpell = null;
    });
  }

  _generateParallaxTextures() {
    const W = 1600, H = 960;

    function createCanvas(scene, key) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
      return scene.textures.createCanvas(key, W, H);
    }

    function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    // 1 — background: night sky gradient with stars
    {
      const canvas = createCanvas(this, 'parallax_background');
      const ctx = canvas.getContext();
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0a0a1a');
      grad.addColorStop(0.4, '#12102a');
      grad.addColorStop(0.7, '#1a1030');
      grad.addColorStop(1, '#100820');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < 300; i++) {
        const sx = rnd(0, W), sy = rnd(0, H * 0.7);
        const r = Math.random() * 1.8 + 0.2;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.6 + 0.2})`;
        ctx.fill();
      }
      canvas.refresh();
    }

    // 2 — sun: large neon circle with glow
    {
      const canvas = createCanvas(this, 'parallax_sun');
      const ctx = canvas.getContext();
      const cx = W - 240, cy = 160;
      const rad = 100;
      const glow = ctx.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad * 2.8);
      glow.addColorStop(0, 'rgba(255,180,60,0.95)');
      glow.addColorStop(0.2, 'rgba(255,120,30,0.7)');
      glow.addColorStop(0.5, 'rgba(200,40,80,0.25)');
      glow.addColorStop(0.8, 'rgba(60,10,40,0.05)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - rad * 3, cy - rad * 3, rad * 6, rad * 6);

      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      core.addColorStop(0, '#fff8e0');
      core.addColorStop(0.4, '#ffcc40');
      core.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      canvas.refresh();
    }

    // 3 — light: soft rays from top-right
    {
      const canvas = createCanvas(this, 'parallax_light');
      const ctx = canvas.getContext();
      const cx = W - 200, cy = 120;
      ctx.globalAlpha = 0.12;
      for (let i = -4; i <= 4; i++) {
        const angle = (Math.PI / 3) + i * 0.08;
        const len = 1400 + i * 80;
        const ex = cx + Math.cos(angle) * len;
        const ey = cy + Math.sin(angle) * len;
        const grad = ctx.createLinearGradient(cx, cy, ex, ey);
        grad.addColorStop(0, 'rgba(255,200,100,0.6)');
        grad.addColorStop(0.3, 'rgba(255,150,60,0.3)');
        grad.addColorStop(1, 'rgba(255,80,30,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 20 + Math.abs(i) * 8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      canvas.refresh();
    }

    // 4 — smog1: scattered dark clouds (far)
    {
      const canvas = createCanvas(this, 'parallax_smog1');
      const ctx = canvas.getContext();
      for (let i = 0; i < 60; i++) {
        const ex = rnd(0, W + 200), ey = rnd(H * 0.55, H * 0.95);
        const rx = rnd(60, 220), ry = rnd(20, 50);
        ctx.beginPath();
        ctx.ellipse(ex, ey, rx, ry, Math.random() * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(20,15,25,${Math.random() * 0.25 + 0.05})`;
        ctx.fill();
      }
      canvas.refresh();
    }

    // 5 — smog2: lighter fog layer (near)
    {
      const canvas = createCanvas(this, 'parallax_smog2');
      const ctx = canvas.getContext();
      for (let i = 0; i < 40; i++) {
        const ex = rnd(0, W + 300), ey = rnd(H * 0.6, H * 0.98);
        const rx = rnd(80, 300), ry = rnd(25, 70);
        ctx.beginPath();
        ctx.ellipse(ex, ey, rx, ry, Math.random() * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(30,20,40,${Math.random() * 0.2 + 0.04})`;
        ctx.fill();
      }
      canvas.refresh();
    }

    // 6-9 — city silhouettes: atmospheric perspective, width 192-352, per-layer density
    const cityDefs = [
      { key: 'parallax_city4plan',   count: 22, wMin: 100, wMax: 150, hMin: 160, hMax: 300, body: '#1a1a1a', noGaps: true },
      { key: 'parallax_city3plan',   count: 7,  wMin: 110, wMax: 170, hMin: 240, hMax: 400, body: '#0f0f0f' },
      { key: 'parallax_city2plan',   count: 5,  wMin: 130, wMax: 200, hMin: 300, hMax: 480, body: '#070707' },
      { key: 'parallax_city1plan',   count: 4,  wMin: 160, wMax: 240, hMin: 360, hMax: 620, body: '#010101' },
    ];

    for (const cd of cityDefs) {
      const buildings = [];

      if (cd.noGaps) {
        let cx = 0;
        while (cx < W) {
          const bw = rnd(cd.wMin, cd.wMax);
          const bh = rnd(cd.hMin, cd.hMax);
          buildings.push({ w: bw, h: bh, x: cx });
          cx += rnd(Math.floor(bw * 0.5), Math.floor(bw * 0.75));
        }
      } else {
        const slotW = W / cd.count;
        for (let i = 0; i < cd.count; i++) {
          const bw = rnd(cd.wMin, cd.wMax);
          const bh = rnd(cd.hMin, cd.hMax);
          const slotStart = slotW * i;
          const maxOffset = Math.max(0, slotW - bw);
          const x = Math.round(slotStart + rnd(0, maxOffset));
          buildings.push({ w: bw, h: bh, x });
        }
      }
      buildings.sort((a, b) => a.x - b.x);

      const WIN_COLOR = '#ffcc44';
      const FLOOR_H = 28, WIN_W = 4, WIN_H = 5, WIN_GAP_X = 20, PAD = 12;

      function forEachWindow(b, fn) {
        const startY = H - b.h + PAD + 6;
        const endY = H - PAD;
        for (let wy = startY; wy + WIN_H <= endY; wy += FLOOR_H) {
          for (let wx = b.x + PAD; wx + WIN_W <= b.x + b.w - PAD; wx += WIN_GAP_X) {
            fn(Math.floor(wx), Math.floor(wy));
          }
        }
      }

      // --- Base: buildings + ~60% static windows ---
      {
        const canvas = createCanvas(this, cd.key);
        const ctx = canvas.getContext();
        for (const b of buildings) {
          ctx.fillStyle = cd.body;
          ctx.fillRect(b.x, H - b.h, b.w, b.h + 2);
          forEachWindow(b, (wx, wy) => {
            if (Math.random() < 0.55) {
              ctx.save();
              ctx.globalAlpha = 0.5 + Math.random() * 0.5;
              ctx.fillStyle = WIN_COLOR;
              ctx.fillRect(wx, wy, WIN_W, WIN_H);
              ctx.restore();
            }
          });
        }
        canvas.refresh();
      }

      // --- Flicker A ---
      {
        const key = cd.key + '_flicker_a';
        const canvas = createCanvas(this, key);
        const ctx = canvas.getContext();
        for (const b of buildings) {
          forEachWindow(b, (wx, wy) => {
            if (Math.random() < 0.22) {
              ctx.save();
              ctx.globalAlpha = 0.5 + Math.random() * 0.5;
              ctx.fillStyle = WIN_COLOR;
              ctx.fillRect(wx, wy, WIN_W, WIN_H);
              ctx.restore();
            }
          });
        }
        canvas.refresh();
      }

      // --- Flicker B ---
      {
        const key = cd.key + '_flicker_b';
        const canvas = createCanvas(this, key);
        const ctx = canvas.getContext();
        for (const b of buildings) {
          forEachWindow(b, (wx, wy) => {
            if (Math.random() < 0.14) {
              ctx.save();
              ctx.globalAlpha = 0.5 + Math.random() * 0.5;
              ctx.fillStyle = WIN_COLOR;
              ctx.fillRect(wx, wy, WIN_W, WIN_H);
              ctx.restore();
            }
          });
        }
        canvas.refresh();
      }
    }
  }

  loadMap(mapName) {
    if (this.solidGroup) this.solidGroup.destroy(true, true);
    if (this.boundaryGroup) this.boundaryGroup.destroy(true, true);
    if (this.mapGraphics) this.mapGraphics.destroy();
    if (this.currentLayer) { this.currentLayer.destroy(); this.currentLayer = null; }
    if (this.currentMapData) { this.currentMapData.destroy(); this.currentMapData = null; }
    this.clearGroundItems();
    this.clearNpcs();
    this.clearEnemies();

    this.currentMap = mapName;
    this.currentMapData = this.make.tilemap({ key: mapName });

    for (const img of this._parallaxLayers) img.destroy();
    for (const t of this._parallaxTweens) t.stop();
    this._parallaxLayers = [];
    this._parallaxTweens = [];

    if (this._bgImage) { this._bgImage.destroy(); this._bgImage = null; }

    const mapW = this.currentMapData.width * TILE_SIZE;
    const mapH = this.currentMapData.height * TILE_SIZE;
    const hasParallax = this.textures.exists('parallax_background');

    if (hasParallax) {
      const defs = [
        { key: 'parallax_background', sx: 0.0 },
        { key: 'parallax_sun',        sx: 0.0 },
        { key: 'parallax_light',      sx: 0.0 },
        { key: 'parallax_smog1',      sx: 0.15, alpha: 0.45, drift: 30,  driftMs: 8000 },
        { key: 'parallax_smog2',      sx: 0.25, alpha: 0.35, drift: -25, driftMs: 6000 },
        { key: 'parallax_city4plan',  sx: 0.4 },
        { key: 'parallax_city4plan_flicker_a', sx: 0.4,  flicker: true, flickerMs: 1000, flickerMin: 0.02, flickerMax: 0.8 },
        { key: 'parallax_city4plan_flicker_b', sx: 0.4,  flicker: true, flickerMs: 1700, flickerMin: 0.03, flickerMax: 0.7 },
        { key: 'parallax_city3plan',  sx: 0.55 },
        { key: 'parallax_city3plan_flicker_a', sx: 0.55, flicker: true, flickerMs: 1200, flickerMin: 0.02, flickerMax: 0.75 },
        { key: 'parallax_city3plan_flicker_b', sx: 0.55, flicker: true, flickerMs: 2000, flickerMin: 0.03, flickerMax: 0.65 },
        { key: 'parallax_city2plan',  sx: 0.7 },
        { key: 'parallax_city2plan_flicker_a', sx: 0.7,  flicker: true, flickerMs: 1400, flickerMin: 0.02, flickerMax: 0.7 },
        { key: 'parallax_city2plan_flicker_b', sx: 0.7,  flicker: true, flickerMs: 2300, flickerMin: 0.03, flickerMax: 0.6 },
        { key: 'parallax_city1plan',  sx: 0.85 },
        { key: 'parallax_city1plan_flicker_a', sx: 0.85, flicker: true, flickerMs: 1600, flickerMin: 0.02, flickerMax: 0.65 },
        { key: 'parallax_city1plan_flicker_b', sx: 0.85, flicker: true, flickerMs: 2600, flickerMin: 0.03, flickerMax: 0.55 },
      ];

      for (const d of defs) {
        if (!this.textures.exists(d.key)) continue;
        const img = this.add.image(0, 0, d.key)
          .setOrigin(0, 0)
          .setDisplaySize(mapW, mapH)
          .setDepth(0)
          .setScrollFactor(d.sx, 1);
        if (d.alpha !== undefined) img.setAlpha(d.alpha);
        if (d.drift) {
          const t = this.tweens.add({
            targets: img,
            x: img.x + d.drift,
            duration: d.driftMs,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
          this._parallaxTweens.push(t);
        }
        if (d.flicker) {
          img.setAlpha(d.flickerMax);
          const t = this.tweens.add({
            targets: img,
            alpha: d.flickerMin,
            duration: d.flickerMs,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
          this._parallaxTweens.push(t);
        }
        this._parallaxLayers.push(img);
      }
    } else {
      const bgKey = `bg_${mapName}`;
      if (this.textures.exists(bgKey)) {
        this._bgImage = this.add.image(0, 0, bgKey)
          .setOrigin(0, 0)
          .setDisplaySize(mapW, mapH)
          .setDepth(0);
      }
    }

    const tilesets = [];
    for (const ts of this.currentMapData.tilesets) {
      const tsObj = this.currentMapData.addTilesetImage(ts.name, ts.name);
      if (tsObj) tilesets.push(tsObj);
    }
    this.currentLayer = this.currentMapData.createLayer('ground', tilesets);
    this.currentLayer.setDepth(1);
    this.currentLayer.setCollisionByProperty({ type: 'solid' });
    this.currentLayer.setCollisionByProperty({ type: 'platform' });

    const forestTs = this.currentMapData.getTileset('tiles_forest');
    if (forestTs) {
      this.currentLayer.setCollision([1]);
      this.currentLayer.setCollision([2]);
    }

    this.physics.world.setBounds(0, 0,
      this.currentMapData.width * TILE_SIZE,
      this.currentMapData.height * TILE_SIZE);

    this.cameras.main.setBackgroundColor(mapName === 'city' ? 0x1a1a3e : 0x0a1a0a);

    const mapPixelW = this.currentMapData.width * TILE_SIZE;
    const mapPixelH = this.currentMapData.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapPixelW, mapPixelH);

    this.solidGroup = this.physics.add.staticGroup();

    if (mapName === 'forest' || mapName === 'city') {
      const mapPixelW = this.currentMapData.width * TILE_SIZE;
      const mapPixelH = this.currentMapData.height * TILE_SIZE;
      const groundH = 4 * TILE_SIZE;
      const groundY = mapPixelH - groundH / 2;
      const groundBody = this.add.rectangle(mapPixelW / 2, groundY, mapPixelW, groundH);
      groundBody.visible = false;
      this.solidGroup.add(groundBody);
    }
    this.boundaryGroup = this.physics.add.staticGroup();
    if (this.thinGroup) this.thinGroup.destroy(true, true);
    this.thinGroup = this.physics.add.staticGroup();

    for (let y = 0; y < this.currentLayer.height; y++) {
      for (let x = 0; x < this.currentLayer.width; x++) {
        const tile = this.currentLayer.getTileAt(x, y);
        if (tile?.properties?.type === 'thin_platform') {
          const px = tile.pixelX + TILE_SIZE / 2;
          const py = tile.pixelY + 32 - 2.5;
          const rect = this.add.rectangle(px, py, 24, 5);
          rect.visible = false;
          this.thinGroup.add(rect);
        }
      }
    }

    if (mapName === 'city') {
      const wall = this.add.rectangle(mapPixelW + 2, mapPixelH / 2, 4, mapPixelH);
      this.boundaryGroup.add(wall);
      wall.visible = false;
    } else {
      const wall = this.add.rectangle(-2, mapPixelH / 2, 4, mapPixelH);
      this.boundaryGroup.add(wall);
      wall.visible = false;
    }

    if (this.myId && this.playerSprites.has(this.myId)) {
      this._addPlayerColliders(this.playerSprites.get(this.myId));
    }
  }

  _addPlayerColliders(player) {
    if (!player.hasPhysics) return;
    if (this.currentLayer) {
      this._solidCollider = this.physics.add.collider(player, this.currentLayer,
        null,
        (p, tile) => {
        if (tile.properties?.type === 'platform') {
          if (p.body.velocity.y < 0 || p.y + 32 > tile.pixelY + 32) return false;
        }
        return true;
      });
    }
    if (this.thinGroup) {
      this.physics.add.collider(player, this.thinGroup, null, (p, rect) => {
        if (p.droppingThrough) return false;
        if (p.body.velocity.y < 0) return false;
        return true;
      });
    }
    if (this.solidGroup) {
      this.physics.add.collider(player, this.solidGroup);
    }
    this.physics.add.collider(player, this.enemyBodyGroup);

    const isSafe = this.currentMapData
      ? this.currentMapData.properties?.find(p => p.name === 'safe')?.value ?? true
      : true;
    if (this._remoteCollider) {
      this.physics.world.removeCollider(this._remoteCollider);
    }
    this._remoteCollider = this.physics.add.collider(player, this.remoteGroup);
    if (isSafe) this._remoteCollider.active = false;
    if (this.boundaryGroup) {
      this.physics.add.collider(player, this.boundaryGroup,
        () => {
          if (this._transitioning) return;
          const transition = checkMapTransition(this.currentMap, player.x, player.y);
          if (transition) {
            this._transitioning = true;
            gameSocket.send('move', { px: transition.spawnX, py: transition.spawnY, transitionTo: transition.map });
          }
        }
      );
    }
  }

  renderGroundItem(item) {
    const gfx = this.add.graphics();
    const color = ITEM_COLORS[item.itemType] || 0xffffff;
    const size = 20;
    gfx.fillStyle(color, 1);
    gfx.fillRect(item.px - size / 2, item.py - size / 2, size, size);
    gfx.lineStyle(1, 0xffffff, 0.3);
    gfx.strokeRect(item.px - size / 2, item.py - size / 2, size, size);
    gfx.setDepth(2);

    let textObj = null;
    if (item.amount && item.amount > 1) {
      textObj = this.add.text(item.px, item.py - size / 2 - 8, `${item.amount}g`, {
        fontSize: '10px', fontFamily: 'monospace', color: '#ffcc00',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5, 1).setDepth(3);
    }

    this.groundItemSprites.set(item.id, { gfx, text: textObj, data: item });
  }

  removeGroundItem(id) {
    const entry = this.groundItemSprites.get(id);
    if (entry) {
      entry.gfx.destroy();
      if (entry.text) entry.text.destroy();
      this.groundItemSprites.delete(id);
    }
  }

  clearGroundItems() {
    for (const [, entry] of this.groundItemSprites) {
      entry.gfx.destroy();
      if (entry.text) entry.text.destroy();
    }
    this.groundItemSprites.clear();
  }

  renderNpc(npc) {
    const gfx = this.add.graphics();
    gfx.fillStyle(npc.color || 0x44cc44, 1);
    gfx.fillRect(npc.px - 16, npc.py - 32, 32, 64);
    gfx.lineStyle(1, 0x000000, 0.5);
    gfx.strokeRect(npc.px - 16, npc.py - 32, 32, 64);
    gfx.setDepth(5);

    const nameText = this.add.text(npc.px, npc.py - 40, npc.name || 'NPC', {
      fontSize: '10px', fontFamily: 'monospace', color: '#44ff44',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(20);

    const bubble = this.add.text(npc.px, npc.py - 50, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3, align: 'center',
      wordWrap: { width: 200 },
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(20);

    this.npcSprites.set(npc.id, { gfx, nameText, bubble, data: npc });
  }

  clearNpcs() {
    for (const [, entry] of this.npcSprites) {
      entry.gfx.destroy();
      entry.nameText.destroy();
      entry.bubble.destroy();
    }
    this.npcSprites.clear();
  }

  renderEnemy(enemy) {
    const type = enemy.type || 'rat';
    const visual = ENEMY_VISUALS[type] || ENEMY_VISUALS['rat'];
    const gfx = this.add.graphics();
    gfx.fillStyle(visual.color, 1);
    if (visual.shape === 'circle') {
      gfx.fillCircle(0, 0, visual.radius);
      gfx.lineStyle(1, visual.stroke, 0.6);
      gfx.strokeCircle(0, 0, visual.radius);
    } else {
      gfx.fillRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);
      gfx.lineStyle(1, visual.stroke, 0.6);
      gfx.strokeRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);
    }
    gfx.setPosition(enemy.px, enemy.py);
    gfx.setDepth(5);

    const barW = visual.w || 32;
    const hpBg = this.add.graphics().setDepth(20);
    hpBg.fillStyle(0x333333, 1);
    hpBg.fillRect(-barW / 2, -visual.h / 2 - 4, barW, 3);
    hpBg.setPosition(enemy.px, enemy.py);

    const hpBar = this.add.graphics().setDepth(20);
    const ratio = (enemy.hp ?? 10) / (enemy.maxHp ?? 10);
    const hpColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    hpBar.fillStyle(hpColor, 1);
    hpBar.fillRect(-barW / 2, -visual.h / 2 - 4, barW * Math.max(0, ratio), 3);
    hpBar.setPosition(enemy.px, enemy.py);

    const body = this.add.rectangle(enemy.px, enemy.py, 48, 48);
    this.enemyBodyGroup.add(body);
    body.visible = false;

    this.enemySprites.set(enemy.id, { gfx, hpBg, hpBar, body, data: { ...enemy, type }, _targetX: enemy.px, _targetY: enemy.py });
  }

  clearEnemies() {
    for (const [, entry] of this.enemySprites) {
      entry.gfx.destroy();
      entry.hpBg.destroy();
      entry.hpBar.destroy();
      entry.body.destroy();
    }
    this.enemySprites.clear();
  }

  showNpcBubble(id, text, duration) {
    const npc = this.npcSprites.get(id);
    if (!npc) return;
    npc.bubble.setText(text).setAlpha(1);
    this.tweens.add({
      targets: npc.bubble,
      alpha: 0,
      delay: duration,
      duration: 500,
    });
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'world_state': {
        if (msg.map && msg.map !== this.currentMap) this.loadMap(msg.map);
        if (msg.yourId) this.myId = msg.yourId;
        if (msg.players) {
          const currentIds = new Set(this.playerSprites.keys());
          const newIds = new Set();
          for (const p of msg.players) {
            newIds.add(p.id);
            if (this.playerSprites.has(p.id)) {
              const sprite = this.playerSprites.get(p.id);
              sprite.playerData = p;
              sprite.confirmedPx = p.px;
              sprite.confirmedPy = p.py;
              sprite.updatePosition(p.px, p.py);
              if (p.hp !== undefined && p.maxHp) sprite.updateHp(p.hp, p.maxHp);
            } else if (p.id === this.myId) {
              const newPlayer = new Player(this, p.px, p.py, p, true);
              this.playerSprites.set(p.id, newPlayer);
              this._addPlayerColliders(newPlayer);
              this._lastSentX = p.px;
              this._lastSentY = p.py;
            } else {
              const newPlayer = new Player(this, p.px, p.py, p, false);
              this.playerSprites.set(p.id, newPlayer);
              this.remoteGroup.add(newPlayer);
              newPlayer.updateRemoteState(p.direction, p.animState, p.isCrouching);
            }
          }
          for (const id of currentIds) {
            if (!newIds.has(id) && id !== this.myId) {
              this.playerSprites.get(id).destroy();
              this.playerSprites.delete(id);
            }
          }
        }
        if (this.myId && !this.playerSprites.has(this.myId) && msg.stats) {
          const s = msg.stats;
          const spx = s.px ?? 80;
          const spy = s.py ?? 800;
          const localPlayer = new Player(this, spx, spy, {
            id: this.myId,
            name: s.name || 'You',
            class: s.class || 'WARRIOR',
            race: s.race || 'human',
            sex: s.sex || 'man',
            px: spx,
            py: spy,
            hp: s.hp,
            maxHp: s.maxHp,
            headVariant: s.headVariant,
          }, true);
          this.playerSprites.set(this.myId, localPlayer);
          this._addPlayerColliders(localPlayer);
          this._lastSentX = spx;
          this._lastSentY = spy;
        }
        this.bringMyPlayerToTop();

        if (msg.groundItems) {
          this.clearGroundItems();
          for (const item of msg.groundItems) this.renderGroundItem(item);
        }

        if (msg.npcs) {
          this.clearNpcs();
          for (const npc of msg.npcs) this.renderNpc(npc);
        }

        if (msg.enemies) {
          this.clearEnemies();
          for (const e of msg.enemies) this.renderEnemy(e);
        }
        break;
      }
      case 'player_joined': {
        const p = msg.player;
        if (!this.playerSprites.has(p.id)) {
          const newPlayer = new Player(this, p.px, p.py, p, false);
          this.playerSprites.set(p.id, newPlayer);
          this.remoteGroup.add(newPlayer);
          newPlayer.updateRemoteState(p.direction, p.animState, p.isCrouching);
          this.bringMyPlayerToTop();
        }
        break;
      }
      case 'player_left': {
        if (this.playerSprites.has(msg.id)) {
          this.playerSprites.get(msg.id).destroy();
          this.playerSprites.delete(msg.id);
        }
        break;
      }
      case 'player_moved': {
        if (this.playerSprites.has(msg.id)) {
          const sprite = this.playerSprites.get(msg.id);
          sprite.confirmedPx = msg.px;
          sprite.confirmedPy = msg.py;
          if (msg.id === this.myId) {
            if (this._movePending) {
              const dx = Math.abs(msg.px - sprite.x);
              const dy = Math.abs(msg.py - sprite.y);
              if (dx > 20 || dy > 20) {
                sprite.updatePosition(msg.px, msg.py, true);
              }
              this._movePending = null;
            }
          } else {
            sprite.updatePosition(msg.px, msg.py);
            sprite.updateRemoteState(msg.direction, msg.animState, msg.isCrouching);
          }
        }
        break;
      }
      case 'player_attacked': {
        if (this.playerSprites.has(msg.targetId)) {
          const sprite = this.playerSprites.get(msg.targetId);
          if (msg.targetHp !== undefined && sprite.playerData?.maxHp) {
            sprite.playerData.hp = msg.targetHp;
            sprite.updateHp(msg.targetHp, sprite.playerData.maxHp);
          }
          this.showFloatingText(sprite.x, sprite.y - 30, `-${msg.damage}`, '#ff4444');
        }
        this.playHitSound();
        break;
      }
      case 'player_died': {
        if (this.playerSprites.has(msg.id)) {
          const sprite = this.playerSprites.get(msg.id);
          if (sprite._visual) sprite._visual.setVisible(false);
          if (sprite._head) sprite._head.setVisible(false);
          if (sprite.nameText) sprite.nameText.setVisible(false);
          if (sprite.hpBarBg) sprite.hpBarBg.setVisible(false);
          if (sprite.hpBar) sprite.hpBar.setVisible(false);
          if (!sprite._deathGfx) {
            sprite._deathGfx = this.add.graphics();
            sprite._deathGfx.fillStyle(0x000000, 1);
            sprite._deathGfx.fillRect(-16, -32, 32, 64);
            sprite._deathGfx.lineStyle(1, 0x333333, 0.5);
            sprite._deathGfx.strokeRect(-16, -32, 32, 64);
            sprite._deathGfx.setDepth(5);
          }
          sprite._deathGfx.setPosition(sprite.x, sprite.y);
          sprite._deathGfx.setVisible(true);
          if (msg.id === this.myId) {
            this._isDead = true;
            if (this._onDied) this._onDied();
          }
        }
        break;
      }
      case 'error': {
        if (this.onError) this.onError(msg.msg);
        break;
      }
      case 'meditate_started': {
        this._isMeditating = true;
        if (this.onError) this.onError('Empezaste a meditar');
        if (this.myId && this.playerSprites.has(this.myId)) {
          this.playerSprites.get(this.myId).showMeditate();
        }
        break;
      }
      case 'meditate_stopped': {
        this._isMeditating = false;
        if (this.onError) this.onError('Dejaste de meditar');
        if (this.myId && this.playerSprites.has(this.myId)) {
          this.playerSprites.get(this.myId).hideMeditate();
        }
        break;
      }
      case 'player_meditating': {
        if (this.playerSprites.has(msg.id) && msg.id !== this.myId) {
          const s = this.playerSprites.get(msg.id);
          if (msg.meditating) s.showMeditate();
          else s.hideMeditate();
        }
        break;
      }
      case 'enemies_state': {
        for (const e of msg.enemies) {
          const entry = this.enemySprites.get(e.id);
          if (entry) {
            entry.data = { ...e, type: entry.data.type };
            entry._targetX = e.px;
            entry._targetY = e.py;
            const visual = ENEMY_VISUALS[entry.data.type] || ENEMY_VISUALS['rat'];
            const barW = visual.w || visual.radius * 2 || 32;
            const barH = (visual.shape === 'circle' ? visual.radius : visual.h / 2);
            entry.hpBar.clear();
            const ratio = (e.hp ?? 10) / (e.maxHp ?? 10);
            const hpColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
            entry.hpBar.fillStyle(hpColor, 1);
            entry.hpBar.fillRect(-barW / 2, -barH - 4, barW * Math.max(0, ratio), 3);
            entry.hpBar.setPosition(entry.gfx.x, entry.gfx.y);
          } else {
            this.renderEnemy(e);
          }
        }
        break;
      }
      case 'enemy_died': {
        const entry = this.enemySprites.get(msg.id);
        if (entry) {
          entry.gfx.destroy();
          entry.hpBg.destroy();
          entry.hpBar.destroy();
          entry.body.destroy();
          this.enemySprites.delete(msg.id);
        }
        this.playEnemyDeathSound();
        break;
      }
      case 'enemy_hit': {
        const entry = this.enemySprites.get(msg.enemyId);
        if (entry && entry.data) {
          entry.data.hp = msg.hp;
          const visual = ENEMY_VISUALS[entry.data.type] || ENEMY_VISUALS['rat'];
          const barW = visual.w || visual.radius * 2 || 32;
          const barH = (visual.shape === 'circle' ? visual.radius : visual.h / 2);
          const ratio = (msg.hp ?? 10) / (entry.data.maxHp ?? 10);
          entry.hpBar.clear();
          const hpColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
          entry.hpBar.fillStyle(hpColor, 1);
          entry.hpBar.fillRect(-barW / 2, -barH - 4, barW * Math.max(0, ratio), 3);
          entry.hpBar.setPosition(entry.gfx.x, entry.gfx.y);
          if (msg.damage) {
            this.showFloatingText(entry.data.px, entry.data.py - 20, `-${msg.damage}`, '#ff6644');
          }
        }
        this.playEnemyHitSound();
        break;
      }
      case 'enemy_attack': {
        if (this.playerSprites.has(msg.targetId)) {
          const sprite = this.playerSprites.get(msg.targetId);
          if (msg.targetHp !== undefined && sprite.playerData?.maxHp) {
            sprite.playerData.hp = msg.targetHp;
            sprite.updateHp(msg.targetHp, sprite.playerData.maxHp);
          }
          this.showFloatingText(sprite.x, sprite.y - 30, `-${msg.damage}`, '#cc44cc');
        }
        this.playEnemyAttackSound();
        break;
      }
      case 'spell_cast': {
        if (this.playerSprites.has(msg.targetId)) {
          const sprite = this.playerSprites.get(msg.targetId);
          if (msg.targetHp !== undefined && sprite.playerData?.maxHp) {
            sprite.playerData.hp = msg.targetHp;
            sprite.updateHp(msg.targetHp, sprite.playerData.maxHp);
          }
          this.showFloatingText(sprite.x, sprite.y - 30, `-${msg.damage}`, '#8844ff');
        }
        this.playSpellSound();
        break;
      }
      case 'player_respawned': {
        if (this.playerSprites.has(msg.id)) {
          const sprite = this.playerSprites.get(msg.id);
          sprite.confirmedPx = msg.px;
          sprite.confirmedPy = msg.py;
          sprite.updatePosition(msg.px, msg.py);
          sprite.updateRemoteState(msg.direction, msg.animState, msg.isCrouching);
          if (msg.hp !== undefined && sprite.playerData?.maxHp) {
            sprite.playerData.hp = msg.hp;
            sprite.updateHp(msg.hp, sprite.playerData.maxHp);
          }
          this.showFloatingText(sprite.x, sprite.y - 30, 'Respawned', '#44ff44');
        }
        break;
      }
      case 'chat_message': {
        if (this.playerSprites.has(msg.playerId)) {
          this.playerSprites.get(msg.playerId).showBubble(msg.text);
        }
        break;
      }
      case 'stats_update': {
        this._localStamina = msg.stamina ?? 0;
        break;
      }
      case 'level_up': {
        if (this.myId && this.playerSprites.has(this.myId)) {
          const s = this.playerSprites.get(this.myId);
          this.showFloatingText(s.x, s.y - 50, `LEVEL UP! Lv.${msg.level}`, '#ffcc44');
        }
        if (this.onError) this.onError(`Subiste a nivel ${msg.level}!`);
        break;
      }
      case 'player_level_up': {
        if (this.playerSprites.has(msg.id) && msg.id !== this.myId) {
          const s = this.playerSprites.get(msg.id);
          this.showFloatingText(s.x, s.y - 50, `Lv.${msg.level}!`, '#ffcc44');
        }
        break;
      }
      case 'ground_item_added': {
        this.renderGroundItem(msg);
        break;
      }
      case 'ground_item_removed': {
        this.removeGroundItem(msg.id);
        break;
      }
      case 'attack_miss': {
        this.playMissSound();
        break;
      }
      case 'map_change': {
        this._transitioning = false;
        this._isDead = false;
        this._isMeditating = false;
        this.loadMap(msg.map);
        for (const [, sprite] of this.playerSprites) sprite.destroy();
        this.playerSprites.clear();
        this._movePending = null;
        break;
      }
    }
  }

  bringMyPlayerToTop() {
    if (this.myId && this.playerSprites.has(this.myId)) {
      this.playerSprites.get(this.myId).bringToTop();
    }
  }

  showFloatingText(x, y, text, color = '#ffffff') {
    const t = this.add.text(x, y, text, {
      fontSize: '12px',
      fontFamily: 'monospace',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(100);

    this.tweens.add({
      targets: t,
      y: y - 30,
      alpha: 0,
      duration: 1500,
      onComplete: () => t.destroy(),
    });
  }

  playMissSound() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const duration = 0.15;
      const sampleRate = ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize;
        data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.3;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 600 + Math.random() * 400;
      filter.Q.value = 0.5;

      source.connect(filter);
      filter.connect(ctx.destination);
      source.start();
    } catch {}
  }

  playHitSound() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const duration = 0.12;
      const sampleRate = ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize;
        data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.5
          + Math.sin(2 * Math.PI * 120 * t) * (1 - t) * 0.3;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;

      source.connect(filter);
      filter.connect(ctx.destination);
      source.start();
    } catch {}
  }

  playSpellSound() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const duration = 0.25;
      const sampleRate = ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize;
        const env = Math.sin(Math.PI * t) * 0.6;
        data[i] = (Math.random() * 2 - 1) * env * 0.15
          + Math.sin(2 * Math.PI * 800 * t * (1 + t)) * env * 0.2
          + Math.sin(2 * Math.PI * 300 * t) * env * 0.1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 1 + Math.random() * 0.3;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 200;

      source.connect(filter);
      filter.connect(ctx.destination);
      source.start();
    } catch {}
  }

  playEnemyAttackSound() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const duration = 0.2;
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(sr * duration), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = (Math.random() * 2 - 1) * (1 - t) * 0.4 + Math.sin(2 * Math.PI * 60 * t) * (1 - t) * 0.3;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      src.connect(f);
      f.connect(ctx.destination);
      src.start();
    } catch {}
  }

  playEnemyDeathSound() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const duration = 0.35;
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(sr * duration), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        const env = Math.max(0, 1 - t * 3);
        d[i] = (Math.random() * 2 - 1) * env * 0.35 + Math.sin(2 * Math.PI * 200 * t * (t + 0.5)) * env * 0.2;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(1, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      src.connect(g);
      g.connect(ctx.destination);
      src.start();
    } catch {}
  }

  playEnemyHitSound() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const duration = 0.1;
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(sr * duration), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = (Math.random() * 2 - 1) * (1 - t) * 0.3 + Math.sin(2 * Math.PI * 400 * t) * (1 - t * 8) * 0.4;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 600;
      f.Q.value = 1;
      src.connect(f);
      f.connect(ctx.destination);
      src.start();
    } catch {}
  }

  playPickupSound() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const duration = 0.15;
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(sr * duration), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = Math.sin(2 * Math.PI * 800 * t * (1 + t * 2)) * (1 - t) * 0.25;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
    } catch {}
  }

  playUseSound() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const duration = 0.2;
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(sr * duration), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = Math.sin(2 * Math.PI * 500 * t) * Math.sin(Math.PI * t) * 0.25
          + Math.sin(2 * Math.PI * 700 * t) * Math.sin(Math.PI * t) * 0.15;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
    } catch {}
  }

  update(time, delta) {
    if (!this.myId) return;

    const player = this.playerSprites.get(this.myId);
    if (!player || !player.hasPhysics) return;

    if (gameSocket.selectedSpell !== this._lastCursorSpell) {
      this.input.setDefaultCursor(gameSocket.selectedSpell ? 'crosshair' : 'default');
      this._lastCursorSpell = gameSocket.selectedSpell;
    }

    for (const [, entry] of this.enemySprites) {
      if (entry._targetX != null && delta > 0) {
        const f = 1 - Math.exp(-delta / 30);
        entry.data.px += (entry._targetX - entry.data.px) * f;
        entry.data.py += (entry._targetY - entry.data.py) * f;
        entry.gfx.setPosition(entry.data.px, entry.data.py);
        entry.hpBg.setPosition(entry.data.px, entry.data.py);
        entry.hpBar.setPosition(entry.data.px, entry.data.py);
        entry.body.setPosition(entry.data.px, entry.data.py);
        entry.body.body.updateFromGameObject();
      }
    }
    this.enemyBodyGroup.refresh();

    if (!this._isDead && player) {
      for (const [, entry] of this.enemySprites) {
        const dx = player.x - entry.data.px;
        const dy = player.y - entry.data.py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30 && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          player.x += nx * (30 - dist);
          if (player.hasPhysics) {
            player.body.setVelocityX(0);
            player.body.setVelocityY(Math.min(player.body.velocity.y, 0));
            player.body.updateFromGameObject();
          }
        }
      }
    }

    if (this._isDead) return;

    if (Phaser.Input.Keyboard.JustDown(this._rulerKey)) {
      this._showRuler = !this._showRuler;
      if (!this._showRuler) {
        this._rulerGfx.clear();
        this._rulerText.setText('');
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.ctrlKey)) {
      if (this._isMeditating) gameSocket.send('meditate_stop');
      gameSocket.send('attack');
    }

    if (Phaser.Input.Keyboard.JustDown(this.fKey)) {
      let found = false;
      for (const [id, entry] of this.groundItemSprites) {
        const dx = Math.abs(entry.data.px - player.x);
        const dy = Math.abs(entry.data.py - player.y);
        if (dx < 48 && dy < 64) {
          gameSocket.send('pickup_item', { groundItemId: id });
          found = true;
          break;
        }
      }
      if (found) this.playPickupSound();
    }

    if (Phaser.Input.Keyboard.JustDown(this.tKey)) {
      if (gameSocket.selectedSlot != null && this._onDropRequest) {
        this._onDropRequest();
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.uKey)) {
      if (gameSocket.selectedSlot != null) {
        gameSocket.send('use_item', { slot: gameSocket.selectedSlot });
        this.playUseSound();
      }
    }

    for (let i = 0; i < 10; i++) {
      if (Phaser.Input.Keyboard.JustDown(this.numKeys[i])) {
        gameSocket.send('use_item', { slot: i });
        this.playUseSound();
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
      if (this._isMeditating) {
        gameSocket.send('meditate_stop');
      } else {
        gameSocket.send('meditate_start');
      }
    }

    for (let i = 0; i < 10; i++) {
      if (Phaser.Input.Keyboard.JustDown(this.numKeys[i])) {
        gameSocket.send('use_item', { slot: i });
      }
    }

    player.isRunning = this.shiftKey.isDown && this._localStamina > 0;

    if (this.shiftKey.isDown && this._localStamina > 0) {
      if (time - this._lastRunTick > 100) {
        this._lastRunTick = time;
        gameSocket.send('run');
      }
    }

    if (this.cursors.a.isDown) {
      player.moveLeft();
    } else if (this.cursors.d.isDown) {
      player.moveRight();
    } else {
      player.stopX();
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.w)) {
      if (this.cursors.s.isDown) {
        player.dropThrough();
      } else {
        player.jump();
      }
    }

    if (this.cursors.s.isDown) {
      if (!this._sWasDown) {
        const tileX = Math.floor(player.x / TILE_SIZE);
        const tileY = Math.floor((player.y + 32) / TILE_SIZE);
        const tile = this.currentLayer?.getTileAt(tileX, tileY);
        if (tile?.properties?.type === 'thin_platform') {
          player.dropThrough();
        }
      }
      player.crouch();
      this._sWasDown = true;
    } else {
      this._sWasDown = false;
      if (player.isCrouching) player.standUp();
    }

    player.updateAnimation();

    const mapData = this.currentMapData;
    if (mapData) {
      const mapW = mapData.width * TILE_SIZE;
      const mapH = mapData.height * TILE_SIZE;
      const px = player.x;
      const py = player.y;

      if (this.currentMap !== 'forest' && px < PLAYER_W / 2) {
        player.x = PLAYER_W / 2;
        if (player.hasPhysics) player.body.setVelocityX(0);
      }
      if (this.currentMap !== 'city' && px > mapW - PLAYER_W / 2) {
        player.x = mapW - PLAYER_W / 2;
        if (player.hasPhysics) player.body.setVelocityX(0);
      }
      if (py < PLAYER_H / 2) {
        player.y = PLAYER_H / 2;
        if (player.hasPhysics) player.body.setVelocityY(0);
      }
      if (py > mapH - PLAYER_H / 2) {
        player.y = mapH - PLAYER_H / 2;
        if (player.hasPhysics) player.body.setVelocityY(0);
      }
    }

    const now = Date.now();
    if (now - this._lastSyncTime > SYNC_INTERVAL) {
      const px = Math.round(player.x);
      const py = Math.round(player.y);
      const dx = Math.abs(px - this._lastSentX);
      const dy = Math.abs(py - this._lastSentY);
      const animNow = player.animState;
      if (dx > SYNC_MIN_DIST || dy > SYNC_MIN_DIST || animNow !== this._lastSentAnim) {
        gameSocket.send('move', {
          px, py,
          direction: player.direction,
          animState: animNow,
          isCrouching: player.isCrouching,
        });
        this._lastSentX = px;
        this._lastSentY = py;
        this._lastSentAnim = animNow;
      }
      this._lastSyncTime = now;
    }

    if (this._movePending && Date.now() - this._movePending.time > 500) {
      const s = this.playerSprites.get(this.myId);
      if (s) s.updatePosition(s.confirmedPx, s.confirmedPy, true);
      this._movePending = null;
    }

    this.cameras.main.startFollow(player, true, 0.08, 0.08);
    this.cameras.main.setFollowOffset(0, 32);

    if (this._showRuler) {
      const pointer = this.input.activePointer;
      const wx = pointer.worldX;
      const wy = pointer.worldY;
      const tileX = Math.floor(wx / TILE_SIZE);
      const tileY = Math.floor(wy / TILE_SIZE);
      const localX = wx - tileX * TILE_SIZE;
      const localY = wy - tileY * TILE_SIZE;

      this._rulerGfx.clear();
      this._rulerGfx.lineStyle(1, 0xffff00, 0.25);
      for (let gx = 0; gx < 32; gx += 4) {
        this._rulerGfx.lineBetween(
          tileX * TILE_SIZE + gx, tileY * TILE_SIZE,
          tileX * TILE_SIZE + gx, tileY * TILE_SIZE + TILE_SIZE,
        );
        this._rulerGfx.lineBetween(
          tileX * TILE_SIZE, tileY * TILE_SIZE + gx,
          tileX * TILE_SIZE + TILE_SIZE, tileY * TILE_SIZE + gx,
        );
      }
      this._rulerGfx.lineStyle(2, 0xffff00, 0.6);
      this._rulerGfx.strokeRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      const mapData = this.currentMapData;
      if (mapData && tileX >= 0 && tileX < mapData.width && tileY >= 0 && tileY < mapData.height) {
        const tile = this.currentLayer.getTileAt(tileX, tileY);
        const tileProps = tile?.properties;
        const type = tileProps?.type || (tile ? `GID ${tile.index}` : 'empty');
        this._rulerText.setPosition(wx + 12, wy - 12);
        this._rulerText.setText([
          `Tile: (${tileX}, ${tileY})  ${type}`,
          `Pixel: (${Math.round(wx)}, ${Math.round(wy)})`,
        ].join('\n'));
      }
    }
  }
}