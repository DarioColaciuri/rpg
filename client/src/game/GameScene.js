import Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS, checkMapTransition, getMapTiles, TILE_SOLID } from './maps.js';
import Player from './Player.js';
import { preloadSpritesheets, createAnimations } from './animations.js';
import { gameSocket } from '../network/websocket.js';

const PLAYER_W = 32;
const PLAYER_H = 32;
const SYNC_INTERVAL = 80;
const SYNC_MIN_DIST = 3;

const SPELL_TYPES = {
  hechizo_1: 'damage',
  curar: 'heal',
  tormenta: 'aoe',
};

const ITEM_COLORS = {
  apple: 0xff4444,
  water: 0x4444ff,
  gold_pile: 0xffcc00,
  wooden_sword: 0xcc8844,
  iron_sword: 0x888888,
  cloth_armor: 0xcccccc,
  leather_armor: 0xccaa44,
  wooden_shield: 0x886644,
  leather_helm: 0xcc8844,
};

const ENEMY_VISUALS = {
  rat:      { color: 0x888888, stroke: 0xaaaaaa, shape: 'rect', w: 16, h: 14 },
  bat:      { color: 0x664488, stroke: 0x8866aa, shape: 'circle', radius: 10, h: 20 },
  snake:    { color: 0x44aa44, stroke: 0x66cc66, shape: 'rect', w: 32, h: 14 },
  scorpion: { color: 0xcc8844, stroke: 0xeeaa66, shape: 'rect', w: 24, h: 18 },
  wolf:     { color: 0x886644, stroke: 0xaa8866, shape: 'rect', w: 32, h: 24 },
  goblin:   { color: 0x44aa22, stroke: 0x66cc44, shape: 'rect', w: 22, h: 36 },
  dummy:    { color: 0xcccc88, stroke: 0xeeeeaa, shape: 'rect', w: 32, h: 32 },
};

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.playerSprites = new Map();
    this.myId = null;
    this.currentMap = null;
    this.cursors = null;
    this.ctrlKey = null;
    this.shiftKey = null;
    this.onError = null;
    this.solidGroup = null;
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
    this.enemyBodyGroup = null;
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
  }

  create() {
    createAnimations(this);

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
        if (dx < 24 && dy < 24) {
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

      const spellType = SPELL_TYPES[gameSocket.selectedSpell] || 'damage';
      let targetId = null;

      for (const [id, sprite] of this.playerSprites) {
        if (id === this.myId) continue;
        const dx = Math.abs(sprite.x - clickPx);
        const dy = Math.abs(sprite.y - clickPy);
        if (dx < 20 && dy < 20) { targetId = id; break; }
      }
      if (!targetId) {
        for (const [id, entry] of this.enemySprites) {
          const dx = Math.abs(entry.data.px - clickPx);
          const dy = Math.abs(entry.data.py - clickPy);
          if (dx < 22 && dy < 22) { targetId = id; break; }
        }
      }

      if (spellType === 'heal') {
        gameSocket.send('cast_spell', { targetId, spellKey: gameSocket.selectedSpell });
        gameSocket.selectedSpell = null;
        return;
      }

      if (!targetId) {
        if (this.onError) this.onError('Objetivo invalido');
        return;
      }

      gameSocket.send('cast_spell', { targetId, spellKey: gameSocket.selectedSpell });
      gameSocket.selectedSpell = null;
    });
  }

  loadMap(mapName) {
    if (this.solidGroup) this.solidGroup.destroy(true, true);
    if (this.mapGraphics) this.mapGraphics.destroy();
    this.clearGroundItems();
    this.clearNpcs();
    this.clearEnemies();

    this.currentMap = mapName;

    const tiles = getMapTiles(mapName);
    const mapPixelW = MAP_COLS * TILE_SIZE;
    const mapPixelH = MAP_ROWS * TILE_SIZE;

    this.physics.world.setBounds(0, 0, mapPixelW, mapPixelH);
    this.cameras.main.setBounds(0, 0, mapPixelW, mapPixelH);
    this.cameras.main.setBackgroundColor(mapName === 'city' ? 0x2a2a1a : 0x1a2a1a);

    this.mapGraphics = this.add.graphics().setDepth(0);

    if (tiles) {
      // draw floor
      this.mapGraphics.fillStyle(mapName === 'city' ? 0x4a4a3a : 0x2a4a2a, 1);
      this.mapGraphics.fillRect(0, 0, mapPixelW, mapPixelH);

      // draw walls
      this.mapGraphics.fillStyle(mapName === 'city' ? 0x6a6a5a : 0x3a5a3a, 1);
      this.mapGraphics.lineStyle(1, mapName === 'city' ? 0x8a8a7a : 0x4a7a4a, 0.5);
      for (let y = 0; y < MAP_ROWS; y++) {
        for (let x = 0; x < MAP_COLS; x++) {
          if (tiles[y][x] === TILE_SOLID) {
            this.mapGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            this.mapGraphics.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // ground/cobblestone pattern on walkable areas
    this.mapGraphics.fillStyle(mapName === 'city' ? 0x555540 : 0x355535, 0.3);
    for (let y = 0; y < MAP_ROWS; y++) {
      for (let x = 0; x < MAP_COLS; x++) {
        if (tiles && tiles[y][x] !== TILE_SOLID && (x + y) % 2 === 0) {
          this.mapGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // solid physics group
    this.solidGroup = this.physics.add.staticGroup();
    if (tiles) {
      for (let y = 0; y < MAP_ROWS; y++) {
        for (let x = 0; x < MAP_COLS; x++) {
          if (tiles[y][x] === TILE_SOLID) {
            const rect = this.add.rectangle(
              x * TILE_SIZE + TILE_SIZE / 2,
              y * TILE_SIZE + TILE_SIZE / 2,
              TILE_SIZE, TILE_SIZE
            );
            rect.visible = false;
            this.solidGroup.add(rect);
          }
        }
      }
    }

    // invisible boundary walls at non-transition edges
    if (mapName === 'city') {
      // left wall
      const leftWall = this.add.rectangle(-8, mapPixelH / 2, 16, mapPixelH);
      leftWall.visible = false;
      this.solidGroup.add(leftWall);
      // top wall
      const topWall = this.add.rectangle(mapPixelW / 2, -8, mapPixelW, 16);
      topWall.visible = false;
      this.solidGroup.add(topWall);
      // bottom wall
      const bottomWall = this.add.rectangle(mapPixelW / 2, mapPixelH + 8, mapPixelW, 16);
      bottomWall.visible = false;
      this.solidGroup.add(bottomWall);
    } else {
      // top wall
      const topWall = this.add.rectangle(mapPixelW / 2, -8, mapPixelW, 16);
      topWall.visible = false;
      this.solidGroup.add(topWall);
      // bottom wall
      const bottomWall = this.add.rectangle(mapPixelW / 2, mapPixelH + 8, mapPixelW, 16);
      bottomWall.visible = false;
      this.solidGroup.add(bottomWall);
      // right wall
      const rightWall = this.add.rectangle(mapPixelW + 8, mapPixelH / 2, 16, mapPixelH);
      rightWall.visible = false;
      this.solidGroup.add(rightWall);
    }

    if (this.myId && this.playerSprites.has(this.myId)) {
      this._addPlayerColliders(this.playerSprites.get(this.myId));
    }
  }

  _addPlayerColliders(player) {
    if (!player.hasPhysics) return;

    if (this.solidGroup) {
      this.physics.add.collider(player, this.solidGroup);
    }
    this.physics.add.collider(player, this.enemyBodyGroup);

    if (this._remoteCollider) {
      this.physics.world.removeCollider(this._remoteCollider);
    }
    this._remoteCollider = this.physics.add.collider(player, this.remoteGroup);
    const isSafe = this.currentMap === 'city';
    if (isSafe) this._remoteCollider.active = false;
  }

  renderGroundItem(item) {
    const gfx = this.add.graphics();
    const color = ITEM_COLORS[item.itemType] || 0xffffff;
    const size = 16;
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
    gfx.fillRect(npc.px - 16, npc.py - 16, 32, 32);
    gfx.lineStyle(1, 0x000000, 0.5);
    gfx.strokeRect(npc.px - 16, npc.py - 16, 32, 32);
    gfx.setDepth(5);

    const nameText = this.add.text(npc.px, npc.py - 22, npc.name || 'NPC', {
      fontSize: '10px', fontFamily: 'monospace', color: '#44ff44',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(20);

    const bubble = this.add.text(npc.px, npc.py - 30, '', {
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
      const h = type === 'dummy' ? 32 : visual.h;
      gfx.fillRect(-visual.w / 2, -h / 2, visual.w, h);
      gfx.lineStyle(1, visual.stroke, 0.6);
      gfx.strokeRect(-visual.w / 2, -h / 2, visual.w, h);
    }
    gfx.setPosition(enemy.px, enemy.py);
    gfx.setDepth(5);

    const displayH = type === 'dummy' ? 32 : visual.h;
    const barW = visual.w || visual.radius * 2 || 32;
    const hpBg = this.add.graphics().setDepth(20);
    hpBg.fillStyle(0x333333, 1);
    hpBg.fillRect(-barW / 2, -displayH / 2 - 4, barW, 3);
    hpBg.setPosition(enemy.px, enemy.py);

    const hpBar = this.add.graphics().setDepth(20);
    const ratio = (enemy.hp ?? 10) / (enemy.maxHp ?? 10);
    const hpColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    hpBar.fillStyle(hpColor, 1);
    hpBar.fillRect(-barW / 2, -displayH / 2 - 4, barW * Math.max(0, ratio), 3);
    hpBar.setPosition(enemy.px, enemy.py);

    const body = this.add.rectangle(enemy.px, enemy.py, 32, 32);
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
              newPlayer.updateRemoteState(p.direction, p.animState);
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
          const spy = s.py ?? 320;
          const localPlayer = new Player(this, spx, spy, {
            id: this.myId,
            name: s.name || 'You',
            class: s.class || 'WARRIOR',
            race: s.race || 'human',
            sex: s.sex || 'male',
            px: spx,
            py: spy,
            hp: s.hp,
            maxHp: s.maxHp,
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
          newPlayer.updateRemoteState(p.direction, p.animState);
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
            sprite.updateRemoteState(msg.direction, msg.animState);
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
          this.showFloatingText(sprite.x, sprite.y - 20, `-${msg.damage}`, '#ff4444');
        }
        this.playHitSound();
        break;
      }
      case 'player_died': {
        if (this.playerSprites.has(msg.id)) {
          const sprite = this.playerSprites.get(msg.id);
          if (sprite._visual) sprite._visual.setVisible(false);
          if (sprite.nameText) sprite.nameText.setVisible(false);
          if (sprite.hpBarBg) sprite.hpBarBg.setVisible(false);
          if (sprite.hpBar) sprite.hpBar.setVisible(false);
          if (!sprite._deathGfx) {
            sprite._deathGfx = this.add.graphics();
            sprite._deathGfx.fillStyle(0x000000, 1);
            sprite._deathGfx.fillRect(-16, -16, 32, 32);
            sprite._deathGfx.lineStyle(1, 0x333333, 0.5);
            sprite._deathGfx.strokeRect(-16, -16, 32, 32);
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
      case 'player_alignment': {
        if (this.playerSprites.has(msg.id)) {
          const sprite = this.playerSprites.get(msg.id);
          sprite.setAlignment(msg.alignment);
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
            const displayH = entry.data.type === 'dummy' ? 32 : visual.h;
            const barH = (visual.shape === 'circle' ? visual.radius : displayH / 2);
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
          this.updateEnemySprite(entry);
          if (msg.damage) {
            this.showFloatingText(entry.data.px, entry.data.py - 16, `-${msg.damage}`, '#ff6644');
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
          this.showFloatingText(sprite.x, sprite.y - 20, `-${msg.damage}`, '#cc44cc');
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
          this.showFloatingText(sprite.x, sprite.y - 20, `-${msg.damage}`, '#8844ff');
        }
        this.playSpellSound();
        break;
      }
      case 'spell_heal': {
        if (this.playerSprites.has(msg.targetId)) {
          const sprite = this.playerSprites.get(msg.targetId);
          if (msg.targetHp !== undefined && sprite.playerData?.maxHp) {
            sprite.playerData.hp = msg.targetHp;
            sprite.updateHp(msg.targetHp, sprite.playerData.maxHp);
          }
          this.showFloatingText(sprite.x, sprite.y - 20, `+${msg.healAmount}`, '#44ff44');
        }
        break;
      }
      case 'spell_aoe': {
        let originX = null, originY = null;
        if (msg.targetId) {
          const targetSprite = this.playerSprites.get(msg.targetId);
          if (targetSprite) { originX = targetSprite.x; originY = targetSprite.y; }
          const targetEnemy = this.enemySprites.get(msg.targetId);
          if (!originX && targetEnemy) { originX = targetEnemy.data.px; originY = targetEnemy.data.py; }
        }
        if (originX != null) {
          const radius = 3 * 32;
          const gfx = this.add.graphics().setDepth(150);
          gfx.fillStyle(0xccaaff, 0.25);
          gfx.fillCircle(originX, originY, radius);
          gfx.lineStyle(2, 0x8844cc, 0.7);
          gfx.strokeCircle(originX, originY, radius);
          this.tweens.add({
            targets: gfx,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => gfx.destroy(),
          });
        }
        for (const aff of (msg.affected || [])) {
          if (aff.type === 'player' && this.playerSprites.has(aff.id)) {
            const sprite = this.playerSprites.get(aff.id);
            if (aff.hp !== undefined && sprite.playerData?.maxHp) {
              sprite.playerData.hp = aff.hp;
              sprite.updateHp(aff.hp, sprite.playerData.maxHp);
            }
            this.showFloatingText(sprite.x, sprite.y - 20, `-${msg.damage}`, '#ccaa44');
          } else if (aff.type === 'enemy' && this.enemySprites.has(aff.id)) {
            const entry = this.enemySprites.get(aff.id);
            entry.data.hp = aff.hp;
            this.updateEnemySprite(entry);
            this.showFloatingText(entry.data.px, entry.data.py - 16, `-${msg.damage}`, '#ccaa44');
          }
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
          sprite.updateRemoteState(msg.direction, msg.animState);
          if (msg.hp !== undefined && sprite.playerData?.maxHp) {
            sprite.playerData.hp = msg.hp;
            sprite.updateHp(msg.hp, sprite.playerData.maxHp);
          }
          this.showFloatingText(sprite.x, sprite.y - 20, 'Respawned', '#44ff44');
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
        if (msg.alignment && this.myId && this.playerSprites.has(this.myId)) {
          const local = this.playerSprites.get(this.myId);
          local.setAlignment(msg.alignment);
        }
        break;
      }
      case 'level_up': {
        if (this.myId && this.playerSprites.has(this.myId)) {
          const s = this.playerSprites.get(this.myId);
          this.showFloatingText(s.x, s.y - 30, `LEVEL UP! Lv.${msg.level}`, '#ffcc44');
        }
        if (this.onError) this.onError(`Subiste a nivel ${msg.level}!`);
        break;
      }
      case 'player_level_up': {
        if (this.playerSprites.has(msg.id) && msg.id !== this.myId) {
          const s = this.playerSprites.get(msg.id);
          this.showFloatingText(s.x, s.y - 30, `Lv.${msg.level}!`, '#ffcc44');
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

  updateEnemySprite(entry) {
    const visual = ENEMY_VISUALS[entry.data.type] || ENEMY_VISUALS['rat'];
    const barW = visual.w || visual.radius * 2 || 32;
    const displayH = entry.data.type === 'dummy' ? 32 : visual.h;
    const barH = (visual.shape === 'circle' ? visual.radius : displayH / 2);
    const ratio = (entry.data.hp ?? 10) / (entry.data.maxHp ?? 10);
    entry.hpBar.clear();
    const hpColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    entry.hpBar.fillStyle(hpColor, 1);
    entry.hpBar.fillRect(-barW / 2, -barH - 4, barW * Math.max(0, ratio), 3);
    entry.hpBar.setPosition(entry.gfx.x, entry.gfx.y);
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

    // enemy lerp
    if (delta > 0) {
      const enemyLerpF = 1 - Math.exp(-delta / 30);
      for (const [, entry] of this.enemySprites) {
        if (entry._targetX != null) {
          entry.data.px += (entry._targetX - entry.data.px) * enemyLerpF;
          entry.data.py += (entry._targetY - entry.data.py) * enemyLerpF;
          entry.gfx.setPosition(entry.data.px, entry.data.py);
          entry.hpBg.setPosition(entry.data.px, entry.data.py);
          entry.hpBar.setPosition(entry.data.px, entry.data.py);
          entry.body.setPosition(entry.data.px, entry.data.py);
          entry.body.body.updateFromGameObject();
        }
      }
      this.enemyBodyGroup.refresh();
    }

    if (!this._isDead && player) {
      // push player away from enemies
      for (const [, entry] of this.enemySprites) {
        const dx = player.x - entry.data.px;
        const dy = player.y - entry.data.py;
        const distSq = dx * dx + dy * dy;
        if (distSq < 900 && distSq > 0) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          player.x += nx * (30 - dist);
          player.y += ny * (30 - dist);
          if (player.hasPhysics) {
            player.body.setVelocityX(0);
            player.body.setVelocityY(0);
            player.body.updateFromGameObject();
          }
        }
      }
    }

    if (this._isDead) return;

    if (Phaser.Input.Keyboard.JustDown(this._rulerKey)) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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
        if (dx < 48 && dy < 48) {
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

    player.isRunning = this.shiftKey.isDown && this._localStamina > 0;

    if (this.shiftKey.isDown && this._localStamina > 0) {
      if (time - this._lastRunTick > 100) {
        this._lastRunTick = time;
        gameSocket.send('run');
      }
    }

    // 4-directional movement
    let movedX = false;
    let movedY = false;

    if (this.cursors.w.isDown) {
      player.moveUp();
      movedY = true;
    } else if (this.cursors.s.isDown) {
      player.moveDown();
      movedY = true;
    } else {
      player.stopY();
    }

    if (this.cursors.a.isDown) {
      player.moveLeft();
      movedX = true;
    } else if (this.cursors.d.isDown) {
      player.moveRight();
      movedX = true;
    } else {
      player.stopX();
    }

    player.updateAnimation();

    // clamp to map bounds (allow crossing edges that have transitions)
    const mapPixelW = MAP_COLS * TILE_SIZE;
    const mapPixelH = MAP_ROWS * TILE_SIZE;

    if (player.y < PLAYER_H / 2) {
      player.y = PLAYER_H / 2;
      if (player.hasPhysics) player.body.setVelocityY(0);
    }
    if (player.y > mapPixelH - PLAYER_H / 2) {
      player.y = mapPixelH - PLAYER_H / 2;
      if (player.hasPhysics) player.body.setVelocityY(0);
    }

    if (this.currentMap === 'city') {
      if (player.x < PLAYER_W / 2) {
        player.x = PLAYER_W / 2;
        if (player.hasPhysics) player.body.setVelocityX(0);
      }
      // allow right edge crossing to forest
    } else if (this.currentMap === 'forest') {
      if (player.x > mapPixelW - PLAYER_W / 2) {
        player.x = mapPixelW - PLAYER_W / 2;
        if (player.hasPhysics) player.body.setVelocityX(0);
      }
      // allow left edge crossing to city
    }

    // check map transition
    if (!this._transitioning) {
      const transition = checkMapTransition(this.currentMap, player.x, player.y);
      if (transition) {
        this._transitioning = true;
        gameSocket.send('move', {
          px: transition.spawnX,
          py: transition.spawnY,
          transitionTo: transition.map,
          direction: player.direction,
          animState: player.animState,
        });
        return;
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

    if (this._showRuler) {
      const pointer = this.input.activePointer;
      const wx = pointer.worldX;
      const wy = pointer.worldY;
      const tileX = Math.floor(wx / TILE_SIZE);
      const tileY = Math.floor(wy / TILE_SIZE);

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

      const tiles = getMapTiles(this.currentMap);
      if (tiles && tileX >= 0 && tileX < MAP_COLS && tileY >= 0 && tileY < MAP_ROWS) {
        const tileVal = tiles[tileY][tileX];
        const tileType = tileVal === TILE_SOLID ? 'SOLID' : 'AIR';
        this._rulerText.setPosition(wx + 12, wy - 12);
        this._rulerText.setText([
          `Tile: (${tileX}, ${tileY})  ${tileType}`,
          `Pixel: (${Math.round(wx)}, ${Math.round(wy)})`,
        ].join('\n'));
      }
    }
  }
}
