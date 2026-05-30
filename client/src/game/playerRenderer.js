import { TILE_SIZE } from './maps.js';

export function getPlayerColor(playerClass, race) {
  const base = playerClass === 'WARRIOR' ? 0xff4444 : 0x4488ff;
  if (race === 'HUMAN') return base;
  return playerClass === 'WARRIOR' ? 0xcc2222 : 0x2266cc;
}

export function createPlayerSprite(scene, player) {
  const color = getPlayerColor(player.class, player.race);
  const size = 28;
  const half = size / 2;
  const container = scene.add.container(0, 0);

  const gfx = scene.add.graphics();
  gfx.fillStyle(color, 1);

  if (player.race === 'GNOME') {
    gfx.fillCircle(0, 0, half);
  } else {
    gfx.fillRoundedRect(-half, -half, size, size, 4);
  }

  container.add(gfx);

  const nameText = scene.add.text(0, -half - 4, player.name, {
    fontSize: '10px',
    fontFamily: 'monospace',
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: 3,
    align: 'center',
  }).setOrigin(0.5, 1);
  container.add(nameText);

  const hpBarBg = scene.add.graphics();
  hpBarBg.fillStyle(0x333333, 1);
  hpBarBg.fillRect(-half, half + 2, size, 3);
  container.add(hpBarBg);

  const hpBar = scene.add.graphics();
  container.add(hpBar);
  container.hpBar = hpBar;

  container.playerId = player.id;
  container.playerData = player;

  container.updateHp = (hp, maxHp) => {
    hpBar.clear();
    const ratio = Math.max(0, hp / maxHp);
    const barColor = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    hpBar.fillStyle(barColor, 1);
    hpBar.fillRect(-half, half + 2, size * ratio, 3);
  };

  if (player.hp !== undefined && player.maxHp) {
    container.updateHp(player.hp, player.maxHp);
  }

  const hitW = size;
  const hitH = size + 5;
  container.setSize(hitW, hitH);
  container.setInteractive(new Phaser.Geom.Rectangle(-hitW / 2, -hitH / 2, hitW, hitH), Phaser.Geom.Rectangle.Contains);

  const bubble = scene.add.text(0, -half - 18, '', {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: 3,
    align: 'center',
    wordWrap: { width: 150 },
  }).setOrigin(0.5, 1).setAlpha(0);
  container.add(bubble);
  container.bubble = bubble;

  container.showBubble = (text) => {
    bubble.setText(text).setAlpha(1);
    scene.tweens.add({
      targets: bubble,
      alpha: 0,
      delay: 3000,
      duration: 500,
    });
  };

  container.currentTileX = player.x;
  container.currentTileY = player.y;
  container.confirmedTileX = player.x;
  container.confirmedTileY = player.y;
  container._targetPx = null;
  container._targetPy = null;
  container.moveTween = null;

  container.updatePosition = (x, y, instant = false) => {
    const targetPx = x * TILE_SIZE + TILE_SIZE / 2;
    const targetPy = y * TILE_SIZE + TILE_SIZE / 2;

    if (!instant && container._targetPx === targetPx && container._targetPy === targetPy) {
      return;
    }

    container.currentTileX = x;
    container.currentTileY = y;

    if (container.moveTween) {
      container.moveTween.stop();
      container.moveTween = null;
    }

    container._targetPx = targetPx;
    container._targetPy = targetPy;

    if (instant) {
      container.setPosition(targetPx, targetPy);
      return;
    }

    container.moveTween = scene.tweens.add({
      targets: container,
      x: targetPx,
      y: targetPy,
      duration: 150,
      ease: 'Linear',
      onComplete: () => {
        container.moveTween = null;
      },
    });
  };

  container.setPosition(player.x * TILE_SIZE + TILE_SIZE / 2, player.y * TILE_SIZE + TILE_SIZE / 2);

  return container;
}
