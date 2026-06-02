import Phaser from 'phaser';

const PLAYER_W = 32;
const PLAYER_H = 64;
const DISPLAY_W = 32;
const DISPLAY_H = 64;
const DISPLAY_CROUCH_H = 32;
const MOVE_SPEED = 200;
const RUN_SPEED = 400;
const JUMP_VEL = -420;
const DRAG_X = 800;
const MAX_VEL_Y = 800;
const DROP_THROUGH_MS = 250;

export default class Player extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y, playerData, hasPhysics = false) {
    const race = (playerData.race || 'human').toLowerCase();
    const sex = (playerData.sex || 'male').toLowerCase();
    const direction = 'right';
    const spriteKey = `${race}_${sex}_walk_${direction}`;

    super(scene, x, y, spriteKey);

    scene.add.existing(this);
    this.setVisible(false);

    this.playerId = playerData.id;
    this.playerData = playerData;
    this.hasPhysics = hasPhysics;
    this.isCrouching = false;
    this.isRunning = false;
    this.droppingThrough = false;
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

    const headStaticKey = `${race}_${sex}_head_static_${direction}`;
    if (scene.textures.exists(headStaticKey)) {
      this._head = scene.add.sprite(x, y, headStaticKey);
      this._head.setDepth(6);
      this._head.setDisplaySize(DISPLAY_W, DISPLAY_H);
    } else {
      this._head = null;
    }

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

    if (this._visual.anims && scene.anims.exists(spriteKey)) {
      this._visual.play(spriteKey);
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

  bringToTop() {
    this.setDepth(10);
    if (this._visual) this._visual.setDepth(10);
    if (this._head) this._head.setDepth(11);
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

    const isMoving = this.body && Math.abs(this.body.velocity.x) > 0;

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

    if (this._head) {
      if (isMoving) {
        const headKey = `${this.race}_${this.sex}_head_static_${this.direction}`;
        if (this.scene.textures.exists(headKey)) {
          this._head.setTexture(headKey);
          this._head.setVisible(true);
        } else {
          this._head.setVisible(false);
        }
      } else {
        const headIdleKey = `${this.race}_${this.sex}_head_idle_${this.lastDirection}`;
        if (this.scene.anims.exists(headIdleKey)) {
          if (!this._head.anims.currentAnim || this._head.anims.currentAnim.key !== headIdleKey) {
            this._head.play(headIdleKey);
          }
          this._head.setVisible(true);
        } else {
          this._head.setVisible(false);
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

  updateRemoteState(direction, animState, isCrouching) {
    if (this._visual) {
      if (direction) {
        this.direction = direction;
        this.lastDirection = direction;
        this.animState = animState || 'walk';

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

        if (this._head) {
          if (animState === 'idle') {
            const headIdleKey = `${this.race}_${this.sex}_head_idle_${direction}`;
            if (this.scene.anims.exists(headIdleKey)) {
              if (!this._head.anims.currentAnim || this._head.anims.currentAnim.key !== headIdleKey) {
                this._head.play(headIdleKey);
              }
              this._head.setVisible(true);
            } else {
              this._head.setVisible(false);
            }
          } else {
            const headKey = `${this.race}_${this.sex}_head_static_${direction}`;
            if (this.scene.textures.exists(headKey)) {
              this._head.setTexture(headKey);
              this._head.setVisible(true);
            } else {
              this._head.setVisible(false);
            }
          }
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

    this._visual.x = this.x;
    this._visual.y = this.y;
    if (this._head) {
      this._head.x = this.x;
      this._head.y = this.y;
    }

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
      this._hitboxGfx.lineStyle(1, 0xff0000, 0.8);
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
    if (this._head) this._head.destroy();
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
