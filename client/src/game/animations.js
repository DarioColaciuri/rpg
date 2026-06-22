const RACES = ['human', 'gnome'];
const ALL_RACES = ['human', 'gnome', 'elf', 'drow', 'dwarf', 'orc'];
const SEXES = ['male', 'female'];
const HEAD_RACES = ['human'];
const HEAD_VARIANTS = [1, 2];
const DIRECTIONS = ['left', 'right'];
const CROUCH_RACES = ['human'];
const CROUCH_SEXES = ['male'];

const RACE_FALLBACK_COLORS = {
  elf: '#88ddaa',
  drow: '#8844aa',
  dwarf: '#cc8844',
  orc: '#448844',
};

export const RACE_HEIGHT = {
  tall: ['human', 'elf', 'drow', 'orc'],
  short: ['gnome', 'dwarf'],
};

const SHEETS = [];
for (const race of RACES) {
  for (const sex of SEXES) {
    for (const dir of DIRECTIONS) {
      SHEETS.push(`${race}_${sex}_walk_${dir}`);
    }
  }
}

const IDLE_SHEETS = [];
for (const race of RACES) {
  for (const sex of SEXES) {
    for (const dir of DIRECTIONS) {
      IDLE_SHEETS.push(`${race}_${sex}_idle_${dir}`);
    }
  }
}

const HEAD_IDLE_SHEETS = [];
for (const race of HEAD_RACES) {
  for (const sex of SEXES) {
    for (const dir of DIRECTIONS) {
      for (const v of HEAD_VARIANTS) {
        HEAD_IDLE_SHEETS.push(`${race}_${sex}_head_idle_${dir}_${v}`);
      }
    }
  }
}

const HEAD_STATIC_SHEETS = [];
for (const race of HEAD_RACES) {
  for (const sex of SEXES) {
    for (const dir of DIRECTIONS) {
      for (const v of HEAD_VARIANTS) {
        HEAD_STATIC_SHEETS.push(`${race}_${sex}_head_static_${dir}_${v}`);
      }
    }
  }
}

const CROUCH_MOVE_SHEETS = [];
for (const race of CROUCH_RACES) {
  for (const sex of CROUCH_SEXES) {
    for (const dir of DIRECTIONS) {
      CROUCH_MOVE_SHEETS.push(`${race}_${sex}_crouch_move_${dir}`);
    }
  }
}

const CROUCH_STATIC_SHEETS = [];
for (const race of CROUCH_RACES) {
  for (const sex of CROUCH_SEXES) {
    for (const dir of DIRECTIONS) {
      CROUCH_STATIC_SHEETS.push(`${race}_${sex}_crouch_static_${dir}`);
    }
  }
}

export function preloadSpritesheets(scene) {
  for (const key of SHEETS) {
    scene.load.spritesheet(key, `graphics/characters/${key}.png`, {
      frameWidth: 32,
      frameHeight: 64,
    });
  }
  for (const key of IDLE_SHEETS) {
    scene.load.spritesheet(key, `graphics/characters/${key}.png`, {
      frameWidth: 32,
      frameHeight: 64,
    });
  }
  for (const key of HEAD_IDLE_SHEETS) {
    scene.load.spritesheet(key, `graphics/characters/${key}.png`, {
      frameWidth: 32,
      frameHeight: 64,
    });
  }
  for (const key of HEAD_STATIC_SHEETS) {
    scene.load.spritesheet(key, `graphics/characters/${key}.png`, {
      frameWidth: 32,
      frameHeight: 64,
    });
  }
  for (const key of CROUCH_MOVE_SHEETS) {
    scene.load.spritesheet(key, `graphics/characters/${key}.png`, {
      frameWidth: 32,
      frameHeight: 64,
    });
  }
  for (const key of CROUCH_STATIC_SHEETS) {
    scene.load.spritesheet(key, `graphics/characters/${key}.png`, {
      frameWidth: 32,
      frameHeight: 64,
    });
  }
}

export function createAnimations(scene) {
  function getFrameCount(texture) {
    if (!texture) return 0;
    let count = 0;
    while (texture.has(count) && count < 50) count++;
    return count;
  }

  for (const key of SHEETS) {
    if (scene.anims.exists(key)) continue;
    const texture = scene.textures.get(key);
    const frameCount = getFrameCount(texture);
    if (frameCount > 0) {
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frameCount - 1 }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  for (const key of IDLE_SHEETS) {
    if (scene.anims.exists(key)) continue;
    const texture = scene.textures.get(key);
    const frameCount = getFrameCount(texture);
    if (frameCount > 0) {
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frameCount - 1 }),
        frameRate: 7,
        repeat: -1,
      });
    }
  }

  for (const key of HEAD_IDLE_SHEETS) {
    if (scene.anims.exists(key)) continue;
    const texture = scene.textures.get(key);
    const frameCount = getFrameCount(texture);
    if (frameCount > 0) {
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frameCount - 1 }),
        frameRate: 7,
        repeat: -1,
      });
    }
  }

  for (const key of CROUCH_MOVE_SHEETS) {
    if (scene.anims.exists(key)) continue;
    const texture = scene.textures.get(key);
    const frameCount = getFrameCount(texture);
    if (frameCount > 0) {
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frameCount - 1 }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  setupFallbackRaces(scene);
}

export function generateFallbackTexture(scene, race) {
  const key = `${race}_fallback_body`;
  if (scene.textures.exists(key)) return key;

  const color = RACE_FALLBACK_COLORS[race] || '#888888';
  const canvas = scene.textures.createCanvas(key, 32, 64);
  const ctx = canvas.getContext();

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 32, 64);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 32, 64);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(7, 14, 5, 5);
  ctx.fillRect(20, 14, 5, 5);
  ctx.fillStyle = '#000000';
  ctx.fillRect(9, 16, 2, 2);
  ctx.fillRect(22, 16, 2, 2);

  canvas.refresh();
  return key;
}

function drawFallbackSprite(ctx, color, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w, h);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(7, 14, 5, 5);
  ctx.fillRect(20, 14, 5, 5);
  ctx.fillStyle = '#000000';
  ctx.fillRect(9, 16, 2, 2);
  ctx.fillRect(22, 16, 2, 2);
}

function setupFallbackRaces(scene) {
  const FALLBACK_RACES = ALL_RACES.filter(r => !RACES.includes(r));
  if (FALLBACK_RACES.length === 0) return;

  for (const race of FALLBACK_RACES) {
    const color = RACE_FALLBACK_COLORS[race] || '#888888';

    for (const sex of SEXES) {
      for (const dir of DIRECTIONS) {
        const walkKey = `${race}_${sex}_walk_${dir}`;
        const idleKey = `${race}_${sex}_idle_${dir}`;

        if (!scene.textures.exists(walkKey)) {
          const canvas = scene.textures.createCanvas(walkKey, 32, 64);
          drawFallbackSprite(canvas.getContext(), color, 32, 64);
          canvas.refresh();
        }

        if (!scene.anims.exists(walkKey)) {
          scene.anims.create({
            key: walkKey,
            frames: [{ key: walkKey, frame: 0 }],
            frameRate: 10,
            repeat: -1,
          });
        }

        if (!scene.textures.exists(idleKey)) {
          const canvas = scene.textures.createCanvas(idleKey, 32, 64);
          drawFallbackSprite(canvas.getContext(), color, 32, 64);
          canvas.refresh();
        }

        if (!scene.anims.exists(idleKey)) {
          scene.anims.create({
            key: idleKey,
            frames: [{ key: idleKey, frame: 0 }],
            frameRate: 7,
            repeat: -1,
          });
        }
      }
    }
  }
}
