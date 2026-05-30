import Phaser from 'phaser';

const PLAYER_W = 32;
const PLAYER_H = 64;
const CROUCH_H = 32;
const MOVE_SPEED = 200;
const JUMP_VEL = -420;
const DRAG_X = 800;
const MAX_VEL_Y = 800;
const DROP_THROUGH_MS = 250;

export default class Player {
  constructor(scene, x, y, playerData, hasPhysics = false) {
    this.scene = scene;
    this.playerId = playerData.id;
    this.playerClass = playerData.class || 'WARRIOR';
    this.playerData = playerData;
    this.hasPhysics = hasPhysics;
    this.isCrouching = false;
    this.droppingThrough = false;

    this.confirmedPx = playerData.px ?? x;
    this.confirmedPy = playerData.py ?? y;

    const color = hasPhysics ? 0xff0000 : 0xff6644;
    this.rect = scene.add.rectangle(x, y, PLAYER_W, PLAYER_H, color);
    this.rect.setDepth(5);

    if (hasPhysics) {
      scene.physics.add.existing(this.rect);
      this.rect.body.setSize(PLAYER_W, PLAYER_H);
      this.rect.body.setMaxVelocityX(300);
      this.rect.body.setMaxVelocityY(MAX_VEL_Y);
      this.rect.body.setDragX(DRAG_X);
      this.rect.body.setAllowGravity(true);
      this.rect.body.setCollideWorldBounds(false);
      this.rect.body.updateFromGameObject();
    }

    const fontStyle = {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    };

    this.nameText = scene.add.text(x, y - PLAYER_H / 2 - 6, playerData.name || '???', fontStyle)
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.hpBarBg = scene.add.graphics().setDepth(20);
    this.hpBar = scene.add.graphics().setDepth(20);
    this._drawHpBarBg();

    this.bubbleText = scene.add.text(x, y - PLAYER_H / 2 - 14, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: 150 },
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(20);

    if (playerData.hp !== undefined && playerData.maxHp) {
      this.updateHp(playerData.hp, playerData.maxHp);
    }
  }

  get x() { return this.rect.x; }
  set x(v) { this.rect.x = v; }
  get y() { return this.rect.y; }
  set y(v) { this.rect.y = v; }

  setDepth(d) { this.rect.setDepth(d); }

  moveLeft() {
    if (this.hasPhysics) this.rect.body.setVelocityX(-MOVE_SPEED);
  }

  moveRight() {
    if (this.hasPhysics) this.rect.body.setVelocityX(MOVE_SPEED);
  }

  stopX() {
    if (this.hasPhysics) this.rect.body.setVelocityX(0);
  }

  jump() {
    if (!this.hasPhysics) return;
    if (this.rect.body.touching.down || this.rect.body.blocked.down) {
      this.rect.body.setVelocityY(JUMP_VEL);
    }
  }

  dropThrough() {
    if (!this.rect.body.touching.down && !this.rect.body.blocked.down) return;
    this.droppingThrough = true;
    this.rect.y += 2;
    this.rect.body.setVelocityY(150);
    if (this.scene._solidCollider) {
      this.scene._solidCollider.active = false;
      this.scene.time.delayedCall(DROP_THROUGH_MS, () => {
        this.droppingThrough = false;
        if (this.scene._solidCollider) this.scene._solidCollider.active = true;
      });
    } else {
      this.scene.time.delayedCall(DROP_THROUGH_MS, () => { this.droppingThrough = false; });
    }
  }

  crouch() {
    if (this.isCrouching) return;
    this.isCrouching = true;
    this.rect.setSize(PLAYER_W, CROUCH_H);
    this.rect.setFillStyle(0xcc0000);
    if (this.hasPhysics) {
      this.rect.body.setSize(PLAYER_W, CROUCH_H);
      this.rect.body.updateFromGameObject();
    }
  }

  standUp() {
    if (!this.isCrouching) return;
    this.isCrouching = false;
    this.rect.setSize(PLAYER_W, PLAYER_H);
    this.rect.setFillStyle(0xff0000);
    if (this.hasPhysics) {
      this.rect.body.setSize(PLAYER_W, PLAYER_H);
      this.rect.body.updateFromGameObject();
    }
  }

  canStandUp() {
    if (!this.isCrouching) return true;
    if (!this.hasPhysics) return true;
    const headY = this.rect.y - this.rect.body.height / 2;
    const tileAbove = Math.floor(headY / 32);
    const tileX = Math.floor(this.rect.x / 32);
    return true;
  }

  updatePosition(px, py, instant = false) {
    this.confirmedPx = px;
    this.confirmedPy = py;
    if (!this.hasPhysics || instant) {
      this.rect.x = px;
      this.rect.y = py;
      if (this.hasPhysics) {
        this.rect.body.setVelocity(0, 0);
        this.rect.body.updateFromGameObject();
      }
    }
  }

  updateHp(hp, maxHp) {
    const ratio = Math.max(0, hp / maxHp);
    this.hpBar.clear();
    const barColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    this.hpBar.fillStyle(barColor, 1);
    this.hpBar.fillRect(-PLAYER_W / 2, 0, PLAYER_W * ratio, 3);
  }

  _drawHpBarBg() {
    this.hpBarBg.fillStyle(0x333333, 1);
    this.hpBarBg.fillRect(-PLAYER_W / 2, 0, PLAYER_W, 3);
  }

  showBubble(text) {
    this.bubbleText.setText(text).setAlpha(1);
    this.scene.tweens.add({
      targets: this.bubbleText,
      alpha: 0,
      delay: 3000,
      duration: 500,
    });
  }

  preUpdate() {
    const px = this.rect.x;
    const py = this.rect.y;
    const h = this.isCrouching ? CROUCH_H : PLAYER_H;

    this.nameText.setPosition(px, py - h / 2 - 6);

    const barY = py + h / 2 + 4;
    this.hpBarBg.setPosition(px, barY);
    this.hpBar.clear();
    const ratio = this.playerData.hp && this.playerData.maxHp
      ? Math.max(0, this.playerData.hp / this.playerData.maxHp) : 1;
    const barColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    this.hpBar.fillStyle(barColor, 1);
    this.hpBar.fillRect(px - PLAYER_W / 2, barY, PLAYER_W * ratio, 3);

    this.bubbleText.setPosition(px, py - h / 2 - 14);
  }

  destroy() {
    if (this.rect) {
      if (this.hasPhysics && this.rect.body) {
        this.rect.body.enable = false;
      }
      this.rect.destroy();
    }
    if (this.nameText) this.nameText.destroy();
    if (this.hpBarBg) this.hpBarBg.destroy();
    if (this.hpBar) this.hpBar.destroy();
    if (this.bubbleText) this.bubbleText.destroy();
  }
}