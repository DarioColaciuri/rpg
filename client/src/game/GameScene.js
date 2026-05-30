import Phaser from 'phaser';
import { MAPS, TILE_SIZE, TILE_AIR, TILE_SOLID, TILE_PLATFORM, MAP_COLS, MAP_ROWS, checkMapTransition } from './maps.js';
import Player from './Player.js';
import { preloadSpritesheets, createAnimations } from './animations.js';
import { gameSocket } from '../network/websocket.js';

const PLAYER_W = 32;
const PLAYER_H = 64;
const SYNC_INTERVAL = 80;
const SYNC_MIN_DIST = 3;

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
    this._movePending = null;
    this._transitioning = false;
  }

  setMyId(id) {
    this.myId = id;
  }

  setOnErrorCallback(fn) {
    this.onError = fn;
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
    this.input.keyboard.clearCaptures();

    this.remoteGroup = this.add.group();

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
      if (!gameSocket.selectedSpell) return;
      const clickPx = pointer.worldX;
      const clickPy = pointer.worldY;

      let targetId = null;
      for (const [id, sprite] of this.playerSprites) {
        if (id === this.myId) continue;
        const dx = Math.abs(sprite.x - clickPx);
        const dy = Math.abs(sprite.y - clickPy);
        if (dx < 24 && dy < 40) {
          targetId = id;
          break;
        }
      }

      if (!targetId) {
        if (this.onError) this.onError('Only on characters');
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
    this.physics.add.collider(player, this.remoteGroup);
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
              newPlayer.updateRemoteState(p.flipX, p.animState, p.isCrouching);
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
            race: s.race || 'HUMAN',
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
        break;
      }
      case 'player_joined': {
        const p = msg.player;
        if (!this.playerSprites.has(p.id)) {
          const newPlayer = new Player(this, p.px, p.py, p, false);
          this.playerSprites.set(p.id, newPlayer);
          this.remoteGroup.add(newPlayer);
          newPlayer.updateRemoteState(p.flipX, p.animState, p.isCrouching);
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
            sprite.updateRemoteState(msg.flipX, msg.animState, msg.isCrouching);
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
        break;
      }
      case 'player_respawned': {
        if (this.playerSprites.has(msg.id)) {
          const sprite = this.playerSprites.get(msg.id);
          sprite.confirmedPx = msg.px;
          sprite.confirmedPy = msg.py;
          sprite.updatePosition(msg.px, msg.py);
          sprite.updateRemoteState(msg.flipX, msg.animState, msg.isCrouching);
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
      case 'map_change': {
        this._transitioning = false;
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

  update(time, delta) {
    if (!this.myId) return;

    const player = this.playerSprites.get(this.myId);
    if (!player || !player.hasPhysics) return;

    if (Phaser.Input.Keyboard.JustDown(this._rulerKey)) {
      this._showRuler = !this._showRuler;
      if (!this._showRuler) {
        this._rulerGfx.clear();
        this._rulerText.setText('');
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.ctrlKey)) {
      gameSocket.send('attack');
    }

    player.isRunning = this.shiftKey.isDown;

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
      if (dx > SYNC_MIN_DIST || dy > SYNC_MIN_DIST) {
        gameSocket.send('move', {
          px, py,
          flipX: player._visual.flipX,
          animState: player.animState,
          isCrouching: player.isCrouching,
        });
        this._lastSentX = px;
        this._lastSentY = py;
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