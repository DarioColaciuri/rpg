import Phaser from 'phaser';

const PLAYER_W = 32;
const PLAYER_H = 32;
const DISPLAY_W = 32;
const DISPLAY_H = 32;
const MOVE_SPEED = 200;
const RUN_SPEED = 400;

export default class Player extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y, playerData, hasPhysics = false) {
    const race = (playerData.race || 'human').toLowerCase();
    const sex = (playerData.sex || 'male').toLowerCase();
    const direction = 'down';
    const spriteKey = `${race}_${sex}_walk_${direction}`;

    super(scene, x, y, spriteKey);

    scene.add.existing(this);
    this.setVisible(false);

    this.playerId = playerData.id;
    this.playerData = playerData;
    this.hasPhysics = hasPhysics;
    this.isRunning = false;
    this.race = race;
    this.sex = sex;
    this.direction = direction;
    this.lastDirection = direction;
    this.animState = 'walk';
    this._targetX = null;
    this._targetY = null;

    this._visual = scene.add.sprite(x, y, spriteKey);
    this._visual.setDepth(5);
    this._visual.setDisplaySize(DISPLAY_W, DISPLAY_H);

    this.confirmedPx = playerData.px ?? x;
    this.confirmedPy = playerData.py ?? y;

    if (hasPhysics) {
      scene.physics.add.existing(this);
      this.body.setSize(PLAYER_W, PLAYER_H);
      this.body.setMaxVelocityX(RUN_SPEED + 200);
      this.body.setMaxVelocityY(RUN_SPEED + 200);
      this.body.setDragX(800);
      this.body.setDragY(800);
      this.body.setAllowGravity(false);
      this.body.setCollideWorldBounds(false);
      this.body.updateFromGameObject();
    } else {
      scene.physics.add.existing(this, false);
      this.body.setSize(PLAYER_W, PLAYER_H);
      this.body.setImmovable(true);
      this.body.setAllowGravity(false);
      this.body.updateFromGameObject();
    }

    const fontStyle = {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: playerData.alignment === 'criminal' ? '#ff4444' : '#ffffff',
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

    this._meditateGfx = null;

    if (playerData.hp !== undefined && playerData.maxHp) {
      this.updateHp(playerData.hp, playerData.maxHp);
    }

    if (this._visual.anims && scene.anims.exists(spriteKey)) {
      this._visual.play(spriteKey);
    }
  }

  get x() { return super.x; }
  set x(v) { super.x = v; }
  get y() { return super.y; }
  set y(v) { super.y = v; }

  moveUp() {
    if (this.hasPhysics) {
      const speed = this.isRunning ? RUN_SPEED : MOVE_SPEED;
      this.body.setVelocityY(-speed);
      this.direction = 'up';
      this.lastDirection = 'up';
    }
  }

  moveDown() {
    if (this.hasPhysics) {
      const speed = this.isRunning ? RUN_SPEED : MOVE_SPEED;
      this.body.setVelocityY(speed);
      this.direction = 'down';
      this.lastDirection = 'down';
    }
  }

  moveLeft() {
    if (this.hasPhysics) {
      const speed = this.isRunning ? RUN_SPEED : MOVE_SPEED;
      this.body.setVelocityX(-speed);
      this.direction = 'left';
      this.lastDirection = 'left';
    }
  }

  moveRight() {
    if (this.hasPhysics) {
      const speed = this.isRunning ? RUN_SPEED : MOVE_SPEED;
      this.body.setVelocityX(speed);
      this.direction = 'right';
      this.lastDirection = 'right';
    }
  }

  stopX() {
    if (this.hasPhysics) this.body.setVelocityX(0);
  }

  stopY() {
    if (this.hasPhysics) this.body.setVelocityY(0);
  }

  bringToTop() {
    this.setDepth(10);
    if (this._visual) this._visual.setDepth(10);
  }

  updateAnimation() {
    if (!this.hasPhysics) return;
    if (!this._visual.anims) return;

    const isMoving = this.body && (Math.abs(this.body.velocity.x) > 10 || Math.abs(this.body.velocity.y) > 10);

    if (isMoving) {
      const key = `${this.race}_${this.sex}_walk_${this.direction}`;
      this.animState = 'walk';
      if (!this._visual.anims.currentAnim || this._visual.anims.currentAnim.key !== key) {
        this._visual.play(key);
      }
    } else {
      const idleKey = `${this.race}_${this.sex}_idle_${this.lastDirection}`;
      if (this.scene.anims.exists(idleKey)) {
        this.animState = 'idle';
        if (!this._visual.anims.currentAnim || this._visual.anims.currentAnim.key !== idleKey) {
          this._visual.play(idleKey);
        }
      }
    }
  }

  updatePosition(px, py, instant = false) {
    this.confirmedPx = px;
    this.confirmedPy = py;
    if (instant || this.hasPhysics) {
      this.x = px;
      this.y = py;
      this._targetX = null;
      this._targetY = null;
      if (this.hasPhysics) {
        this.body.setVelocity(0, 0);
        this.body.updateFromGameObject();
      }
    } else {
      if (this._targetX === null) {
        this.x = px;
        this.y = py;
      }
      this._targetX = px;
      this._targetY = py;
    }
  }

  updateRemoteState(direction, animState) {
    if (!this._visual) return;

    const hasDir = !!direction;
    if (hasDir) {
      this.direction = direction;
      this.lastDirection = direction;
      this.animState = animState || 'walk';
    }

    if (!hasDir) return;

    let key;
    if (animState === 'idle') {
      key = `${this.race}_${this.sex}_idle_${direction}`;
      if (!this.scene.anims.exists(key)) {
        key = `${this.race}_${this.sex}_walk_${direction}`;
      }
    } else {
      key = `${this.race}_${this.sex}_walk_${direction}`;
    }

    if (!this._visual.anims.currentAnim || this._visual.anims.currentAnim.key !== key) {
      this._visual.play(key);
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
    this.hpBarBg.fillRect(0, 0, PLAYER_W, 3);
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

  setAlignment(alignment) {
    if (this.playerData) this.playerData.alignment = alignment;
    const color = alignment === 'criminal' ? '#ff4444' : '#ffffff';
    this.nameText.setColor(color);
  }

  showMeditate() {
    if (!this._meditateGfx) {
      this._meditateGfx = this.scene.add.graphics();
    }
    this._meditateGfx.clear();
    this._meditateGfx.fillStyle(0x2244cc, 0.35);
    this._meditateGfx.fillRect(-16, -16, 32, 32);
    this._meditateGfx.lineStyle(1, 0x4466ff, 0.6);
    this._meditateGfx.strokeRect(-16, -16, 32, 32);
    this._meditateGfx.setDepth(10);
    this._meditateGfx.setPosition(this.x, this.y);
    this._meditateGfx.setVisible(true);
  }

  hideMeditate() {
    if (this._meditateGfx) this._meditateGfx.setVisible(false);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (!this.hasPhysics && this._targetX !== null && delta > 0) {
      const f = 1 - Math.exp(-delta / 50);
      this.x += (this._targetX - this.x) * f;
      this.y += (this._targetY - this.y) * f;
    }

    if (!this.hasPhysics && this.body) {
      this.body.updateFromGameObject();
    }

    this._visual.x = this.x;
    this._visual.y = this.y;

    const px = this.x;
    const py = this.y;
    const h = DISPLAY_H;

    this.nameText.setPosition(px, py - h / 2 - 6);

    const barY = py + h / 2 + 4;
    const ratio = this.playerData.hp && this.playerData.maxHp
      ? Math.max(0, this.playerData.hp / this.playerData.maxHp) : 1;
    this.hpBarBg.setPosition(px - PLAYER_W / 2, barY);
    this.hpBar.clear();
    this.hpBar.setPosition(px - PLAYER_W / 2, barY);
    const barColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    this.hpBar.fillStyle(barColor, 1);
    this.hpBar.fillRect(0, 0, PLAYER_W * ratio, 3);

    this.bubbleText.setPosition(px, py - h / 2 - 14);

    if (this._deathGfx && this._deathGfx.visible) {
      this._deathGfx.setPosition(this.x, this.y);
    }

    if (this._meditateGfx && this._meditateGfx.visible) {
      this._meditateGfx.setPosition(this.x, this.y);
    }
  }

  destroy() {
    if (this._visual) this._visual.destroy();
    if (this._deathGfx) this._deathGfx.destroy();
    if (this._meditateGfx) this._meditateGfx.destroy();
    if (this.hasPhysics && this.body) {
      this.body.enable = false;
    }
    if (this.nameText) this.nameText.destroy();
    if (this.hpBarBg) this.hpBarBg.destroy();
    if (this.hpBar) this.hpBar.destroy();
    if (this.bubbleText) this.bubbleText.destroy();
    super.destroy();
  }
}
