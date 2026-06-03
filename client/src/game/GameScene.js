import Phaser from 'phaser';
import { MAPS, TILE_SIZE, TILE_AIR, TILE_SOLID, TILE_PLATFORM, MAP_COLS, MAP_ROWS, checkMapTransition } from './maps.js';
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

      gameSocket.send('cast_spell', { targetId });
      gameSocket.selectedSpell = null;
    });
  }

  loadMap(mapName) {
    if (this.solidGroup) this.solidGroup.destroy(true, true);
    if (this.boundaryGroup) this.boundaryGroup.destroy(true, true);
    if (this.mapGraphics) this.mapGraphics.destroy();
    this.clearGroundItems();
    this.clearNpcs();
    this.clearEnemies();

    this.solidGroup = this.physics.add.staticGroup();
    this.boundaryGroup = this.physics.add.staticGroup();

    this.mapGraphics = this.add.graphics();
    const mapData = MAPS[mapName];
    if (!mapData) return;

    const isCity = mapName === 'city';
    const skyColor = isCity ? 0x1a1a3e : 0x0a1a0a;
    const solidColor = isCity ? 0x556666 : 0x3a2a1a;
    const solidColor2 = isCity ? 0x445555 : 0x2a1a0a;
    const platColor = isCity ? 0x7788aa : 0x4a6a3a;
    const platColor2 = isCity ? 0x667799 : 0x3a5a2a;

    this.cameras.main.setBackgroundColor(skyColor);

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (tile === TILE_SOLID) {
          const shade = (x + y) % 2 === 0 ? solidColor : solidColor2;
          this.mapGraphics.fillStyle(shade, 1);
          this.mapGraphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);

          const block = this.add.rectangle(
            px + TILE_SIZE / 2, py + TILE_SIZE / 2,
            TILE_SIZE, TILE_SIZE
          );
          this.solidGroup.add(block);
          block.visible = false;
        } else if (tile === TILE_PLATFORM) {
          const shade = (x + y) % 2 === 0 ? platColor : platColor2;
          this.mapGraphics.fillStyle(shade, isCity ? 0.7 : 0.8);
          this.mapGraphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.mapGraphics.lineStyle(2, 0xffffff, 0.4);
          this.mapGraphics.lineBetween(px, py + 2, px + TILE_SIZE, py + 2);
          this.mapGraphics.lineStyle(1, shade, 1);
          this.mapGraphics.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

          const plat = this.add.rectangle(
            px + TILE_SIZE / 2, py + TILE_SIZE / 2,
            TILE_SIZE, TILE_SIZE
          );
          this.solidGroup.add(plat);
          plat.visible = false;
        }
      }
    }

    this.currentMap = mapName;
    const mapPixelW = mapData.width * TILE_SIZE;
    const mapPixelH = mapData.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapPixelW, mapPixelH);

    if (isCity) {
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
    this._solidCollider = this.physics.add.collider(player, this.solidGroup);
    this.physics.add.collider(player, this.enemyBodyGroup);
    const isSafe = MAPS[this.currentMap]?.safe ?? true;
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
    const gfx = this.add.graphics();
    gfx.fillStyle(0x8844cc, 1);
    gfx.fillRect(-16, -16, 32, 32);
    gfx.lineStyle(1, 0xaa66ff, 0.6);
    gfx.strokeRect(-16, -16, 32, 32);
    gfx.setPosition(enemy.px, enemy.py);
    gfx.setDepth(5);

    const hpBg = this.add.graphics().setDepth(20);
    hpBg.fillStyle(0x333333, 1);
    hpBg.fillRect(-16, -20, 32, 3);
    hpBg.setPosition(enemy.px, enemy.py);

    const hpBar = this.add.graphics().setDepth(20);
    const ratio = (enemy.hp ?? 10) / (enemy.maxHp ?? 10);
    const hpColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    hpBar.fillStyle(hpColor, 1);
    hpBar.fillRect(-16, -20, 32 * Math.max(0, ratio), 3);
    hpBar.setPosition(enemy.px, enemy.py);

    const body = this.add.rectangle(enemy.px, enemy.py, 48, 48);
    this.enemyBodyGroup.add(body);
    body.visible = false;

    this.enemySprites.set(enemy.id, { gfx, hpBg, hpBar, body, data: enemy, _targetX: enemy.px, _targetY: enemy.py });
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
            entry.data = e;
            entry._targetX = e.px;
            entry._targetY = e.py;
            entry.hpBar.clear();
            const ratio = (e.hp ?? 10) / (e.maxHp ?? 10);
            const hpColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
            entry.hpBar.fillStyle(hpColor, 1);
            entry.hpBar.fillRect(-16, -20, 32 * Math.max(0, ratio), 3);
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
        break;
      }
      case 'enemy_hit': {
        const entry = this.enemySprites.get(msg.enemyId);
        if (entry && entry.data) {
          entry.data.hp = msg.hp;
        }
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
      for (const [id, entry] of this.groundItemSprites) {
        const dx = Math.abs(entry.data.px - player.x);
        const dy = Math.abs(entry.data.py - player.y);
        if (dx < 48 && dy < 64) {
          gameSocket.send('pickup_item', { groundItemId: id });
          break;
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.tKey)) {
      if (gameSocket.selectedSlot != null && this._onDropRequest) {
        this._onDropRequest();
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.uKey)) {
      if (gameSocket.selectedSlot != null) {
        gameSocket.send('use_item', { slot: gameSocket.selectedSlot });
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
      player.crouch();
    } else {
      if (player.isCrouching) player.standUp();
    }

    player.updateAnimation();

    const mapData = MAPS[this.currentMap];
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

      const mapData = MAPS[this.currentMap];
      const tileType = mapData && tileX >= 0 && tileX < mapData.width && tileY >= 0 && tileY < mapData.height
        ? mapData.tiles[tileY][tileX] : '?';
      const typeNames = { 0: 'AIR', 1: 'SOLID', 2: 'PLATFORM' };

      this._rulerText.setPosition(wx + 12, wy - 12);
      this._rulerText.setText([
        `Tile: (${tileX}, ${tileY})  ${typeNames[tileType] || tileType}`,
        `Pixel: (${Math.round(wx)}, ${Math.round(wy)})`,
      ].join('\n'));
    }
  }
}