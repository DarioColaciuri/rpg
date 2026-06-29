export const ALL_RACES = ['human', 'gnome', 'elf', 'drow', 'dwarf', 'orc'];
export const SEXES = ['male', 'female'];
export const DIRECTIONS = ['up', 'down', 'left', 'right'];

export const RACE_HEIGHT = {
  tall: ['human', 'elf', 'drow', 'orc'],
  short: ['gnome', 'dwarf'],
};

const RACE_FALLBACK_COLORS = {
  human: '#ddaa88',
  gnome: '#ddaa88',
  elf: '#88ddaa',
  drow: '#8844aa',
  dwarf: '#cc8844',
  orc: '#448844',
};

const SPRITE_W = 32;
const SPRITE_H = 32;

function drawTopDownSprite(ctx, color, direction) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SPRITE_W, SPRITE_H);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, SPRITE_W, SPRITE_H);

  // eyes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(6, 8, 4, 4);
  ctx.fillRect(16, 8, 4, 4);
  ctx.fillStyle = '#000000';
  ctx.fillRect(7, 9, 2, 2);
  ctx.fillRect(17, 9, 2, 2);

  // direction indicator
  const cx = SPRITE_W / 2;
  const cy = SPRITE_H / 2;
  ctx.fillStyle = '#000000';
  ctx.globalAlpha = 0.5;
  switch (direction) {
    case 'up':
      ctx.fillRect(cx - 2, cy - 8, 4, 4);
      break;
    case 'down':
      ctx.fillRect(cx - 2, cy + 4, 4, 4);
      break;
    case 'left':
      ctx.fillRect(cx - 8, cy - 2, 4, 4);
      break;
    case 'right':
      ctx.fillRect(cx + 4, cy - 2, 4, 4);
      break;
  }
  ctx.globalAlpha = 1;
}

export function preloadSpritesheets(scene) {
  for (const race of ALL_RACES) {
    for (const sex of SEXES) {
      for (const dir of DIRECTIONS) {
        const walkKey = `${race}_${sex}_walk_${dir}`;
        const idleKey = `${race}_${sex}_idle_${dir}`;

        if (!scene.textures.exists(walkKey)) {
          const canvas = scene.textures.createCanvas(walkKey, SPRITE_W, SPRITE_H);
          drawTopDownSprite(canvas.getContext(), RACE_FALLBACK_COLORS[race] || '#888888', dir);
          canvas.refresh();
        }

        if (!scene.textures.exists(idleKey)) {
          const canvas = scene.textures.createCanvas(idleKey, SPRITE_W, SPRITE_H);
          drawTopDownSprite(canvas.getContext(), RACE_FALLBACK_COLORS[race] || '#888888', dir);
          canvas.refresh();
        }
      }
    }
  }
}

export function createAnimations(scene) {
  for (const race of ALL_RACES) {
    for (const sex of SEXES) {
      for (const dir of DIRECTIONS) {
        const walkKey = `${race}_${sex}_walk_${dir}`;
        const idleKey = `${race}_${sex}_idle_${dir}`;

        if (!scene.anims.exists(walkKey)) {
          scene.anims.create({
            key: walkKey,
            frames: [{ key: walkKey, frame: 0 }],
            frameRate: 8,
            repeat: -1,
          });
        }

        if (!scene.anims.exists(idleKey)) {
          scene.anims.create({
            key: idleKey,
            frames: [{ key: idleKey, frame: 0 }],
            frameRate: 6,
            repeat: -1,
          });
        }
      }
    }
  }
}
