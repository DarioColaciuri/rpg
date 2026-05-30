const SHEETS = [
  'warrior_idle',
  'warrior_walk',
  'warrior_run',
  'warrior_jump',
  'wizard_idle',
  'wizard_walk',
  'wizard_run',
  'wizard_jump',
];

export function preloadSpritesheets(scene) {
  for (const key of SHEETS) {
    scene.load.spritesheet(key, key + '.png', {
      frameWidth: 128,
      frameHeight: 128,
    });
  }
}

export function createAnimations(scene) {
  const classes = ['warrior', 'wizard'];
  const states = [
    { name: 'idle', loop: true },
    { name: 'walk', loop: true },
    { name: 'run', loop: true },
    { name: 'jump', loop: false },
  ];

  for (const cls of classes) {
    for (const { name, loop } of states) {
      const key = cls + '_' + name;
      if (!scene.anims.exists(key)) {
        const texture = scene.textures.get(key);
        const frameCount = texture ? Object.keys(texture.frames).length - 1 : 0;

        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(key, {
            start: 0,
            end: frameCount - 1,
          }),
          frameRate: 10,
          repeat: loop ? -1 : 0,
        });
      }
    }
  }
}