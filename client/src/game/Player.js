import Phaser from 'phaser';

const PLAYER_W = 32;
const PLAYER_H = 64;
const DISPLAY_W = 128;
const DISPLAY_H = 128;
const CROUCH_H = 32;
const DISPLAY_CROUCH_H = 64;
const MOVE_SPEED = 200;
const RUN_SPEED = 400;
const JUMP_VEL = -420;
const DRAG_X = 800;
const MAX_VEL_Y = 800;
const DROP_THROUGH_MS = 250;

const CLASS_VISUAL = {
  warrior: { offsetX: 32, offsetY: -32 },
  wizard:  { offsetX: 0, offsetY: -32, idleOffsetX: 16, jumpOffsetX: 16 },
};

export default class Player extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y, playerData, hasPhysics = false) {
    const className = (playerData.class === 'MAGE' || playerData.class === 'WIZARD') ? 'wizard' : 'warrior';
    const spriteKey = className + '_idle';

    super(scene, x, y, spriteKey);

    scene.add.existing(this);
    this.setVisible(false);

    this.playerId = playerData.id;
    this.playerClass = className;
    this.playerData = playerData;
    this.hasPhysics = hasPhysics;
    this.isCrouching = false;
    this.isRunning = false;
    this.droppingThrough = false;
    this.animPrefix = className;
    this.animState = 'idle';
    this._targetX = null;
    this._targetY = null;
    this._visualCfg = CLASS_VISUAL[className] || CLASS_VISUAL.warrior;

    this._visual = scene.add.sprite(x, y + this._visualCfg.offsetY, spriteKey);
    this._visual.setDepth(5);
    this._visual.setDisplaySize(DISPLAY_W, DISPLAY_H);

    this.confirmedPx = playerData.px ?? x;
    this.confirmedPy = playerData.py ?? y;

    if (hasPhysics) {
      scene.physics.add.existing(this);
      this.body.setSize(PLAYER_W, PLAYER_H);
      this.body.setMaxVelocityX(600);
      this.body.setMaxVelocityY(MAX_VEL_Y);
      this.body.setDragX(DRAG_X);
      this.body.setAllowGravity(true);
      this.body.setCollideWorldBounds(false);
      this.body.updateFromGameObject();

      this._hitboxGfx = scene.add.graphics().setDepth(15);
      this._hitboxLabel = scene.add.text(x, y, '', {
        fontSize: '8px',
        fontFamily: 'monospace',
        color: '#ff4444',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0, 1).setDepth(16);
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

  get x() { return super.x; }
  set x(v) { super.x = v; }
  get y() { return super.y; }
  set y(v) { super.y = v; }

  moveLeft() {
    if (this.hasPhysics) {
      const speed = this.isRunning ? RUN_SPEED : MOVE_SPEED;
      this.body.setVelocityX(-speed);
      this._visual.setFlipX(true);
    }
  }

  moveRight() {
    if (this.hasPhysics) {
      const speed = this.isRunning ? RUN_SPEED : MOVE_SPEED;
      this.body.setVelocityX(speed);
      this._visual.setFlipX(false);
    }
  }

  stopX() {
    if (this.hasPhysics) this.body.setVelocityX(0);
  }

  bringToTop() {
    this.setDepth(10);
    if (this._visual) this._visual.setDepth(10);
  }

  jump() {
    if (!this.hasPhysics) return;
    if (this.body.touching.down || this.body.blocked.down) {
      this.body.setVelocityY(JUMP_VEL);
    }
  }

  dropThrough() {
    if (!this.body.touching.down && !this.body.blocked.down) return;
    this.droppingThrough = true;
    this.y += 2;
    this.body.setVelocityY(150);
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
    this._visual.setDisplaySize(DISPLAY_W, DISPLAY_CROUCH_H);
  }

  standUp() {
    if (!this.isCrouching) return;
    this.isCrouching = false;
    this._visual.setDisplaySize(DISPLAY_W, DISPLAY_H);
  }

  updateAnimation() {
    if (!this.hasPhysics) return;
    if (!this._visual.anims) return;

    let state;
    const onGround = this.body.touching.down || this.body.blocked.down;

    if (!onGround) {
      state = 'jump';
    } else if (Math.abs(this.body.velocity.x) > 10) {
      state = this.isRunning ? 'run' : 'walk';
    } else {
      state = 'idle';
    }

    const key = this.animPrefix + '_' + state;
    this.animState = state;
    if (!this._visual.anims.currentAnim || this._visual.anims.currentAnim.key !== key) {
      this._visual.play(key);
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

  updateRemoteState(flipX, animState, isCrouching) {
    if (this._visual) {
      if (flipX !== undefined) this._visual.setFlipX(flipX);
      if (animState && animState !== this.animState) {
        this.animState = animState;
        const key = this.animPrefix + '_' + animState;
        if (!this._visual.anims.currentAnim || this._visual.anims.currentAnim.key !== key) {
          this._visual.play(key);
        }
      }
      if (isCrouching !== undefined && isCrouching !== this.isCrouching) {
        if (isCrouching) {
          this.crouch();
        } else {
          this.standUp();
        }
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

    const cfg = this._visualCfg;
    const visualOffsetY = this.isCrouching ? 0 : cfg.offsetY;
    const isIdle = this._visual.anims && this._visual.anims.currentAnim
      && this._visual.anims.currentAnim.key.endsWith('_idle');
    const isJump = this._visual.anims && this._visual.anims.currentAnim
      && this._visual.anims.currentAnim.key.endsWith('_jump');
    let offsetX = cfg.offsetX;
    if (isIdle && cfg.idleOffsetX != null) offsetX = cfg.idleOffsetX;
    if (isJump && cfg.jumpOffsetX != null) offsetX = cfg.jumpOffsetX;
    this._visual.x = this.x + (this._visual.flipX ? -offsetX : offsetX);
    this._visual.y = this.y + visualOffsetY;

    const px = this.x;
    const py = this.y;
    const h = this.isCrouching ? DISPLAY_CROUCH_H : DISPLAY_H;

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

    if (this._hitboxGfx && this.hasPhysics && this.body) {
      this._hitboxGfx.clear();
      this._hitboxGfx.fillStyle(0xff0000, 0.25);
      this._hitboxGfx.lineStyle(1, 0xff0000, 0.6);
      this._hitboxGfx.fillRect(
        this.x - PLAYER_W / 2, this.y - PLAYER_H / 2,
        PLAYER_W, PLAYER_H
      );
      this._hitboxGfx.strokeRect(
        this.x - PLAYER_W / 2, this.y - PLAYER_H / 2,
        PLAYER_W, PLAYER_H
      );

      this._hitboxLabel.setPosition(
        this.x + PLAYER_W / 2 + 3,
        this.y + PLAYER_H / 2
      );
      this._hitboxLabel.setText(`${PLAYER_W}x${PLAYER_H}`);
    }
  }

  destroy() {
    if (this._visual) this._visual.destroy();
    if (this._hitboxGfx) this._hitboxGfx.destroy();
    if (this._hitboxLabel) this._hitboxLabel.destroy();
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