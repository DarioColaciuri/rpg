const RACES = ['human', 'gnome'];
const SEXES = ['male', 'female'];
const HEAD_RACES = ['human'];
const HEAD_VARIANTS = [1, 2];
const DIRECTIONS = ['left', 'right'];

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
}
