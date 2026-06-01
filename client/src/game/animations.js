const RACES = ['human', 'gnome'];
const SEXES = ['male', 'female'];
const DIRECTIONS = ['left', 'right'];

const SHEETS = [];
for (const race of RACES) {
  for (const sex of SEXES) {
    for (const dir of DIRECTIONS) {
      SHEETS.push(`${race}_${sex}_walk_${dir}`);
    }
  }
}

const IDLE_SHEETS = ['human_male_idle_left', 'human_male_idle_right'];

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
}

export function createAnimations(scene) {
  for (const key of SHEETS) {
    if (scene.anims.exists(key)) continue;

    const texture = scene.textures.get(key);
    const frameCount = texture ? Object.keys(texture.frames).length : 0;

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
    const frameCount = texture ? Object.keys(texture.frames).length : 0;

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
