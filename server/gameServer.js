import { MAPS, TILE_SIZE, MAP_COLS, MAP_ROWS, isPixelWalkable, checkMapTransition } from './maps.js';

const BASE_STATS = {
  WARRIOR: { hp: 120, mana: 10, stamina: 20 },
  HUNTER: { hp: 100, mana: 10, stamina: 25 },
  PALADIN: { hp: 110, mana: 30, stamina: 20 },
  ASSASSIN: { hp: 90, mana: 15, stamina: 30 },
  CLERIC: { hp: 85, mana: 60, stamina: 20 },
  BARD: { hp: 85, mana: 60, stamina: 22 },
  MAGE: { hp: 60, mana: 100, stamina: 20 },
  DRUID: { hp: 80, mana: 60, stamina: 20 },
  BANDIT: { hp: 95, mana: 15, stamina: 22 },
};
const RACE_BONUS = {
  HUMAN: { hp: 15, mana: 0, stamina: 1 },
  ELF: { hp: 5, mana: 10, stamina: 2 },
  DROW: { hp: 10, mana: 5, stamina: 1 },
  GNOME: { hp: -5, mana: 15, stamina: 3 },
  DWARF: { hp: 20, mana: -5, stamina: 0 },
  ORC: { hp: 25, mana: -5, stamina: 0 },
};

const CLASS_MELEE_DAMAGE = {
  WARRIOR: 15,
  HUNTER: 12,
  PALADIN: 13,
  ASSASSIN: 12,
  CLERIC: 8,
  BARD: 7,
  MAGE: 5,
  DRUID: 7,
  BANDIT: 12,
};

const RACE_HEIGHT = {
  tall: ['human', 'elf', 'drow', 'orc'],
  short: ['gnome', 'dwarf'],
};

const XP_TABLE = [
  0, 500, 750, 960, 1450, 2050, 2820, 3700, 5950, 8250,
  11533, 14993, 19491, 25338, 32939, 42821, 55668, 72368, 94078, 122302,
  158992, 206690, 268697, 376176, 526646, 737305, 884765, 1061719, 1274062, 1528875,
  1834650, 2201580, 2641896, 3170275, 3804330, 4565196, 6091279, 7871705, 10008216, 14637325,
  20830987, 31246480, 46869720, 69554580, 104706870, 157435305, 236527957, 336527957, 436527957, 636527957,
  0,
];

const CLASS_GROWTH = {
  WARRIOR: { hp: 8, mana: 0, stamina: 0, damage: 2.0 },
  HUNTER:   { hp: 7, mana: 0, stamina: 1, damage: 1.5 },
  PALADIN:  { hp: 7, mana: 1, stamina: 0, damage: 1.5 },
  ASSASSIN: { hp: 6, mana: 1, stamina: 1, damage: 1.5 },
  CLERIC:   { hp: 6, mana: 2, stamina: 0, damage: 1.0 },
  BARD:     { hp: 6, mana: 2, stamina: 0, damage: 1.0 },
  MAGE:     { hp: 5, mana: 3, stamina: 0, damage: 0.5 },
  DRUID:    { hp: 6, mana: 2, stamina: 0, damage: 1.0 },
  BANDIT:   { hp: 6, mana: 1, stamina: 0, damage: 1.5 },
};

const SKILL_DEFS = {
  combat_arms: { name: 'Combate con Armas', max: 100, desc: '+1% melee damage cada 10 pts' },
  magic: { name: 'Magia', max: 100, desc: 'Desbloquea hechizos' },
  shield_defense: { name: 'Defensa con Escudos', max: 100, desc: '-1% damage cada 10 pts' },
  dodge: { name: 'Evasion', max: 100, desc: '+1% evasion cada 10 pts' },
  meditation: { name: 'Meditar', max: 100, desc: '+1 mana/sec extra cada 25 pts' },
};

const SPELL_SKILL_REQUIREMENTS = {
  hechizo_1: { magic: 0 },
  curar: { magic: 15 },
  tormenta: { magic: 35 },
};

const SPELL_DEFS = {
  hechizo_1: { name: 'Proyectil', mana: 5, damage: 12, range: 12, type: 'damage', classes: ['MAGE','DRUID'], magicReq: 0 },
  curar:     { name: 'Curar',     mana: 8, heal: 25,   range: 8,  type: 'heal',   classes: ['CLERIC','DRUID','PALADIN'], magicReq: 15 },
  tormenta:  { name: 'Tormenta',  mana: 15, damage: 8, range: 10, type: 'aoe',    classes: ['MAGE','DRUID'], magicReq: 35, aoeRadius: 3 },
};

const PLAYER_W = 32;
const PLAYER_H = 32;
const MOVE_COOLDOWN = 80;
const MAX_MOVE_DIST = 80;

const RUN_CONSUME_AMOUNT = 2;
const RUN_TICK_MS = 100;
const SPELL_MANA_COST = 2;
const MEDITATE_MANA_REGEN = 5;
const MEDITATE_INTERVAL = 1000;

const ENEMY_TYPES = {
  rat:     { name: 'Rata',       hp: 15,  damageMin: 2,  damageMax: 5,  speed: 40,  aggro: 60,  xp: 18,  gold: 0 },
  bat:     { name: 'Murcielago', hp: 15,  damageMin: 1,  damageMax: 3,  speed: 80,  aggro: 80,  xp: 18,  gold: 1 },
  snake:   { name: 'Serpiente',  hp: 22,  damageMin: 3,  damageMax: 6,  speed: 50,  aggro: 90,  xp: 22,  gold: 2 },
  scorpion:{ name: 'Escorpion',  hp: 30,  damageMin: 6,  damageMax: 10, speed: 55,  aggro: 100, xp: 30,  gold: 3 },
  wolf:    { name: 'Lobo',       hp: 60,  damageMin: 10, damageMax: 15, speed: 70,  aggro: 120, xp: 72,  gold: 0 },
  goblin:  { name: 'Goblin',     hp: 200, damageMin: 15, damageMax: 25, speed: 60,  aggro: 130, xp: 160, gold: 0 },
  dummy:   { name: 'Dummy',      hp: 99999, damageMin: 0, damageMax: 0, speed: 0, aggro: 0, xp: 5000, gold: 0, xpPerHit: 2500 },
};

const ENEMY_SPAWNS = {
  forest: [
    { type: 'rat', count: 2 },
    { type: 'bat', count: 2 },
    { type: 'snake', count: 2 },
    { type: 'scorpion', count: 1 },
    { type: 'wolf', count: 1 },
    { type: 'goblin', count: 1 },
  ],
  city: [
    { type: 'rat', count: 2 },
    { type: 'dummy', count: 1 },
  ],
};

const ENEMY_ATTACK_COOLDOWN = 2000;
const ENEMY_TICK = 50;
const ENEMY_BROADCAST = 50;
const ENEMY_W = 32;
const ENEMY_H = 32;

const ITEM_DEFS = {
  apple: { name: 'Apple', stat: 'food', amount: 10 },
  water: { name: 'Water', stat: 'drink', amount: 10 },
  gold_pile: { name: 'Gold', type: 'gold' },
  wooden_sword:   { name: 'Wooden Sword', equipSlot: 'weapon', damage: 3,  size: 'any' },
  iron_sword:     { name: 'Iron Sword',   equipSlot: 'weapon', damage: 7,  size: 'any' },
  cloth_armor:    { name: 'Cloth Armor',  equipSlot: 'clothing', hp: 10,   size: 'any' },
  leather_armor:  { name: 'Leather Armor',equipSlot: 'clothing', hp: 25,   size: 'any' },
  wooden_shield:  { name: 'Wooden Shield',equipSlot: 'shield', defense: 2, size: 'any' },
  leather_helm:   { name: 'Leather Helm', equipSlot: 'helmet', hp: 5,      size: 'any' },
};

const MAX_INVENTORY_SLOTS = 16;
const STAT_DRAIN_INTERVAL = 10000;
const STAT_DRAIN_AMOUNT = 10;
const PICKUP_RANGE = 48;

const DEFAULT_GROUND_ITEMS = {
  city: [
    { px: 400, py: 500, itemType: 'gold_pile', amount: 99999 },
  ],
  forest: [],
};

const SHOP_PRICES = {
  apple: 10,
  water: 10,
  wooden_sword: 100,
  iron_sword: 400,
  cloth_armor: 80,
  leather_armor: 300,
  wooden_shield: 120,
  leather_helm: 60,
};

const SELL_PRICES = {
  apple: 5,
  water: 5,
  wooden_sword: 50,
  iron_sword: 200,
  cloth_armor: 40,
  leather_armor: 150,
  wooden_shield: 60,
  leather_helm: 30,
};

const NPCS = {
  city: [
    { id: 'merchant_city', name: 'Merchant', px: 6 * TILE_SIZE + TILE_SIZE / 2, py: 18 * TILE_SIZE + TILE_SIZE / 2, color: 0x44cc44, shop: true },
  ],
};

export function calcStats(charClass, race) {
  const base = BASE_STATS[charClass];
  const bonus = RACE_BONUS[race];
  return {
    hp: base.hp + bonus.hp,
    maxHp: base.hp + bonus.hp,
    mana: base.mana + bonus.mana,
    maxMana: base.mana + bonus.mana,
    stamina: base.stamina + (bonus.stamina || 0),
    maxStamina: base.stamina + (bonus.stamina || 0),
  };
}

function tileCenter(tx) {
  return tx * TILE_SIZE + TILE_SIZE / 2;
}

export class GameServer {
  constructor() {
    this.players = new Map();
    this.wsToPlayer = new Map();
    this.groundItems = new Map();
    this.enemies = new Map();
    this._nextGroundItemId = 1;
    this._nextEnemyId = 1;
    this._lastEnemyBroadcast = 0;
    this.initGroundItems();
    this.initEnemies();
    this.startStaminaRegen();
    this.startStatDrain();
    this.startHpRegen();
    this.startMeditationRegen();
    this.startEnemyAI();
    this.startCriminalCleanup();
  }

  startStaminaRegen() {
    setInterval(() => {
      for (const [, p] of this.players) {
        if (p.food >= 10 && p.drink >= 10 && p.stamina < p.maxStamina) {
          p.stamina = Math.min(p.stamina + 1, p.maxStamina);
          const ws = this.getWsByPlayerId(p.id);
          if (ws) this.sendTo(ws, { type: 'stats_update', ...this.getStats(p) });
        }
      }
    }, 1000);
  }

  initGroundItems() {
    for (const [mapName, items] of Object.entries(DEFAULT_GROUND_ITEMS)) {
      for (const item of items) {
        const id = `${mapName}_${this._nextGroundItemId++}`;
        this.groundItems.set(id, { id, map: mapName, px: item.px, py: item.py, itemType: item.itemType, amount: item.amount ?? 1 });
      }
    }
  }

  getGroundItemsOnMap(mapName) {
    const result = [];
    for (const [, item] of this.groundItems) {
      if (item.map === mapName) result.push(item);
    }
    return result;
  }

  getNpcsOnMap(mapName) {
    return NPCS[mapName] || [];
  }

  startStatDrain() {
    setInterval(() => {
      for (const [, player] of this.players) {
        let changed = false;
        if (player.food > 0) { player.food = Math.max(0, player.food - STAT_DRAIN_AMOUNT); changed = true; }
        if (player.drink > 0) { player.drink = Math.max(0, player.drink - STAT_DRAIN_AMOUNT); changed = true; }
        if (changed) {
          const ws = this.getWsByPlayerId(player.id);
          if (ws) this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
        }
      }
    }, STAT_DRAIN_INTERVAL);
  }

  startHpRegen() {
    setInterval(() => {
      for (const [, p] of this.players) {
        if (p.stamina > 0 && p.hp < p.maxHp) {
          p._hpRegenAcc = (p._hpRegenAcc || 0) + p.maxHp * 0.005;
          if (p._hpRegenAcc >= 1) {
            const add = Math.floor(p._hpRegenAcc);
            p.hp = Math.min(p.hp + add, p.maxHp);
            p._hpRegenAcc -= add;
            const ws = this.getWsByPlayerId(p.id);
            if (ws) this.sendTo(ws, { type: 'stats_update', ...this.getStats(p) });
          }
        }
      }
    }, 1000);
  }

  startMeditationRegen() {
    setInterval(() => {
      for (const [, p] of this.players) {
        if (p.meditating && p.mana < p.maxMana) {
          p.mana = Math.min(p.mana + MEDITATE_MANA_REGEN, p.maxMana);
          const ws = this.getWsByPlayerId(p.id);
          if (ws) this.sendTo(ws, { type: 'stats_update', ...this.getStats(p) });
          if (p.mana >= p.maxMana) {
            p.meditating = false;
            if (ws) this.sendTo(ws, { type: 'meditate_stopped' });
            this.broadcastToMap(p.map, { type: 'player_meditating', id: p.id, meditating: false });
          }
        }
      }
    }, MEDITATE_INTERVAL);
  }

  initEnemies() {
    for (const [mapName, spawns] of Object.entries(ENEMY_SPAWNS)) {
      for (const spawn of spawns) {
        for (let i = 0; i < spawn.count; i++) {
          this.spawnEnemy(mapName, spawn.type);
        }
      }
    }
  }

  spawnEnemy(mapName, type) {
    const map = MAPS[mapName];
    if (!map) return;
    const enemyDef = ENEMY_TYPES[type];
    if (!enemyDef) return;

    let px, py;
    for (let attempt = 0; attempt < 50; attempt++) {
      const tx = 2 + Math.floor(Math.random() * (map.width - 4));
      const ty = 2 + Math.floor(Math.random() * (map.height - 4));
      px = tx * TILE_SIZE + TILE_SIZE / 2;
      py = ty * TILE_SIZE + TILE_SIZE / 2;
      if (isPixelWalkable(mapName, px, py, ENEMY_W, ENEMY_H) && !this.isPixelOccupied(mapName, px, py, ENEMY_W, ENEMY_H)) {
        break;
      }
      px = null; py = null;
    }
    if (!px) { px = 200; py = 320; }

    const dirs = ['up', 'down', 'left', 'right'];
    const id = `enemy_${this._nextEnemyId++}`;
    this.enemies.set(id, {
      id, map: mapName, type, px, py,
      hp: enemyDef.hp, maxHp: enemyDef.hp,
      direction: dirs[Math.floor(Math.random() * dirs.length)],
      attackCooldown: 0,
      walkTimer: Math.random() * 2000,
      wallTimer: 0,
      xpGiven: 0,
    });
  }

  getEnemiesOnMap(mapName) {
    const result = [];
    for (const [, e] of this.enemies) {
      if (e.map === mapName) result.push({ id: e.id, type: e.type, px: e.px, py: e.py, hp: e.hp, maxHp: e.maxHp, direction: e.direction });
    }
    return result;
  }

  startEnemyAI() {
    setInterval(() => {
      const now = Date.now();
      for (const [, enemy] of this.enemies) {
        this.updateEnemy(enemy, ENEMY_TICK);
      }
      if (now - this._lastEnemyBroadcast > ENEMY_BROADCAST) {
        this._lastEnemyBroadcast = now;
        const mapsWithEnemies = new Set();
        for (const [, e] of this.enemies) mapsWithEnemies.add(e.map);
        for (const mapName of mapsWithEnemies) this.broadcastEnemyState(mapName);
      }
    }, ENEMY_TICK);
  }

  startCriminalCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [, p] of this.players) {
        if (p.alignment === 'criminal' && now >= p.criminalUntil) {
          p.alignment = 'citizen';
          p.criminalUntil = 0;
          const ws = this.getWsByPlayerId(p.id);
          if (ws) this.sendTo(ws, { type: 'stats_update', ...this.getStats(p) });
          this.broadcastToMap(p.map, {
            type: 'player_alignment',
            id: p.id,
            alignment: 'citizen',
          });
        }
      }
    }, 10000);
  }

  updateEnemy(enemy, deltaMs) {
    const delta = deltaMs / 1000;
    const def = ENEMY_TYPES[enemy.type];
    if (!def) return;

    if (enemy.type === 'dummy') return;

    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - deltaMs);
    enemy.wallTimer = Math.max(0, enemy.wallTimer - deltaMs);

    let nearestPlayer = null;
    let nearestDist = Infinity;
    for (const [, p] of this.players) {
      if (p.map !== enemy.map || p.dead) continue;
      const dx = Math.abs(p.px - enemy.px);
      const dy = Math.abs(p.py - enemy.py);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < def.aggro && dist < nearestDist) {
        nearestDist = dist;
        nearestPlayer = p;
      }
    }

    if (nearestPlayer && enemy.wallTimer <= 0) {
      const dx = nearestPlayer.px - enemy.px;
      const dy = nearestPlayer.py - enemy.py;

      const eTx = Math.floor(enemy.px / TILE_SIZE);
      const eTy = Math.floor(enemy.py / TILE_SIZE);
      const pTx = Math.floor(nearestPlayer.px / TILE_SIZE);
      const pTy = Math.floor(nearestPlayer.py / TILE_SIZE);
      const inAttackRange = Math.abs(eTx - pTx) <= 1 && Math.abs(eTy - pTy) <= 1;

      if (inAttackRange && enemy.attackCooldown <= 0) {
        const dmg = def.damageMin + Math.floor(Math.random() * (def.damageMax - def.damageMin + 1));
        nearestPlayer.hp = Math.max(0, nearestPlayer.hp - dmg);
        enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN;
        const targetWs = this.getWsByPlayerId(nearestPlayer.id);
        if (targetWs) this.sendTo(targetWs, { type: 'stats_update', ...this.getStats(nearestPlayer) });
        this.broadcastToMap(enemy.map, {
          type: 'enemy_attack',
          enemyId: enemy.id, targetId: nearestPlayer.id,
          damage: dmg, targetHp: nearestPlayer.hp,
        });
        if (nearestPlayer.hp <= 0) {
          nearestPlayer.dead = true;
          this.broadcastToMap(nearestPlayer.map, {
            type: 'player_died', id: nearestPlayer.id, px: nearestPlayer.px, py: nearestPlayer.py,
          });
        }
      } else {
        // move toward player
        if (Math.abs(dx) > Math.abs(dy)) {
          enemy.direction = dx > 0 ? 'right' : 'left';
        } else {
          enemy.direction = dy > 0 ? 'down' : 'up';
        }
        let mvx = 0, mvy = 0;
        switch (enemy.direction) {
          case 'right': mvx = def.speed; break;
          case 'left': mvx = -def.speed; break;
          case 'down': mvy = def.speed; break;
          case 'up': mvy = -def.speed; break;
        }
        const newX = enemy.px + mvx * delta;
        const newY = enemy.py + mvy * delta;
        this.applyEnemyMovement(enemy, newX, newY);
      }
    } else {
      enemy.walkTimer -= deltaMs;
      if (enemy.walkTimer <= 0) {
        enemy.walkTimer = 1500 + Math.random() * 3000;
        const dirs = ['up', 'down', 'left', 'right'];
        enemy.direction = dirs[Math.floor(Math.random() * dirs.length)];
      }
      let mvx = 0, mvy = 0;
      switch (enemy.direction) {
        case 'right': mvx = def.speed; break;
        case 'left': mvx = -def.speed; break;
        case 'down': mvy = def.speed; break;
        case 'up': mvy = -def.speed; break;
      }
      const newX = enemy.px + mvx * delta;
      const newY = enemy.py + mvy * delta;
      this.applyEnemyMovement(enemy, newX, newY);
    }
  }

  applyEnemyMovement(enemy, newX, newY) {
    const mapW = MAP_COLS * TILE_SIZE;
    const mapH = MAP_ROWS * TILE_SIZE;
    const clampX = Math.max(16, Math.min(mapW - 16, newX));
    const clampY = Math.max(16, Math.min(mapH - 16, newY));

    if (newX <= 16 || newX >= mapW - 16) {
      const dirs = ['up', 'down', 'left', 'right'];
      enemy.direction = dirs[Math.floor(Math.random() * dirs.length)];
      enemy.wallTimer = 500;
      return;
    }
    if (newY <= 16 || newY >= mapH - 16) {
      const dirs = ['up', 'down', 'left', 'right'];
      enemy.direction = dirs[Math.floor(Math.random() * dirs.length)];
      enemy.wallTimer = 500;
      return;
    }

    let blocked = false;
    if (!isPixelWalkable(enemy.map, clampX, enemy.py, ENEMY_W, ENEMY_H)) {
      const dirs = ['up', 'down', 'left', 'right'];
      enemy.direction = dirs[Math.floor(Math.random() * dirs.length)];
      enemy.wallTimer = 2000;
      blocked = true;
    }
    if (!isPixelWalkable(enemy.map, enemy.px, clampY, ENEMY_W, ENEMY_H)) {
      const dirs = ['up', 'down', 'left', 'right'];
      enemy.direction = dirs[Math.floor(Math.random() * dirs.length)];
      enemy.wallTimer = 2000;
      blocked = true;
    }

    // check player collision
    for (const [, p] of this.players) {
      if (p.map !== enemy.map || p.dead) continue;
      if (Math.abs(p.px - clampX) < ENEMY_W && Math.abs(p.py - enemy.py) < ENEMY_H) {
        enemy.direction = 'up';
        blocked = true;
        break;
      }
      if (Math.abs(p.px - enemy.px) < ENEMY_W && Math.abs(p.py - clampY) < ENEMY_H) {
        enemy.direction = 'left';
        blocked = true;
        break;
      }
    }

    // check enemy collision
    if (!blocked) {
      for (const [, other] of this.enemies) {
        if (other.id === enemy.id || other.map !== enemy.map) continue;
        if (Math.abs(other.px - clampX) < ENEMY_W - 4 && Math.abs(other.py - enemy.py) < ENEMY_H - 4) {
          blocked = true;
          break;
        }
        if (Math.abs(other.px - enemy.px) < ENEMY_W - 4 && Math.abs(other.py - clampY) < ENEMY_H - 4) {
          blocked = true;
          break;
        }
      }
    }

    if (!blocked) {
      enemy.px = clampX;
      enemy.py = clampY;
    }
  }

  broadcastEnemyState(mapName) {
    const enemies = this.getEnemiesOnMap(mapName);
    if (enemies.length > 0) {
      this.broadcastToMap(mapName, { type: 'enemies_state', enemies });
    }
  }

  enemyDied(enemy, killerId) {
    const def = ENEMY_TYPES[enemy.type];
    this.broadcastToMap(enemy.map, { type: 'enemy_died', id: enemy.id });
    if (def && def.gold > 0) {
      const { px, py } = this.findFreeGroundSpot(enemy.map, enemy.px, enemy.py);
      const gid = `${enemy.map}_${this._nextGroundItemId++}`;
      this.groundItems.set(gid, { id: gid, map: enemy.map, px, py, itemType: 'gold_pile', amount: def.gold });
      this.broadcastToMap(enemy.map, { type: 'ground_item_added', id: gid, map: enemy.map, px, py, itemType: 'gold_pile', amount: def.gold });
    }
    if (killerId) {
      const killer = this.players.get(killerId);
      if (killer && def) {
        const remainingXp = def.xpPerHit ? 0 : Math.max(0, def.xp - (enemy.xpGiven || 0));
        if (remainingXp > 0) this.addXp(killer, remainingXp);
      }
    }
    const enemyType = enemy.type;
    this.enemies.delete(enemy.id);
    this.spawnEnemy(enemy.map, enemyType);
    this.broadcastEnemyState(enemy.map);
  }

  playerData(player) {
    return {
      id: player.id,
      name: player.name,
      class: player.class,
      race: player.race,
      sex: player.sex,
      px: player.px,
      py: player.py,
      map: player.map,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana,
      stamina: player.stamina,
      maxStamina: player.maxStamina,
      level: player.level,
      xp: player.xp,
      direction: player.direction ?? 'down',
      animState: player.animState ?? 'idle',
      equipment: player.equipment || { weapon: null, clothing: null, helmet: null, shield: null },
      alignment: player.alignment || 'citizen',
    };
  }

  getStats(player) {
    const eff = this.getEffectiveStats(player);
    return {
      name: player.name,
      class: player.class,
      race: player.race,
      sex: player.sex,
      px: player.px,
      py: player.py,
      hp: player.hp,
      maxHp: player.maxHp,
      effectiveMaxHp: eff.effectiveMaxHp,
      mana: player.mana,
      maxMana: player.maxMana,
      stamina: player.stamina,
      maxStamina: player.maxStamina,
      food: player.food,
      drink: player.drink,
      gold: player.gold ?? 0,
      level: player.level,
      xp: player.xp,
      xpNeeded: XP_TABLE[player.level] || 0,
      inventory: player.inventory || [],
      equipment: player.equipment || { weapon: null, clothing: null, helmet: null, shield: null },
      skills: player.skills,
      skillPoints: player.skillPoints ?? 0,
      alignment: player.alignment || 'citizen',
    };
  }

  getPlayersOnMap(mapName, excludeId) {
    const result = [];
    for (const [, p] of this.players) {
      if (p.map === mapName && p.id !== excludeId) {
        result.push(this.playerData(p));
      }
    }
    return result;
  }

  findSpawn(mapName) {
    const map = MAPS[mapName];
    if (!map) return { px: 80, py: 320 };
    const { x: sx, y: sy } = map.spawn;
    return { px: tileCenter(sx), py: tileCenter(sy) };
  }

  addPlayer(ws, character, savedPx = null, savedPy = null, savedMap = null, inventory = []) {
    const stats = calcStats(character.class, character.race);

    const spawn = this.findSpawn(character.map || 'city');
    let useMap = character.map || 'city';
    let usePx = spawn.px;
    let usePy = spawn.py;

    if (savedPx != null && savedPy != null && savedMap && MAPS[savedMap]) {
      if (isPixelWalkable(savedMap, savedPx, savedPy, PLAYER_W, PLAYER_H) &&
          !this.isPixelOccupied(savedMap, savedPx, savedPy, PLAYER_W, PLAYER_H, character.id)) {
        useMap = savedMap;
        usePx = savedPx;
        usePy = savedPy;
      }
    }

    const player = {
      id: character.id,
      userId: character.user_id,
      name: character.name,
      class: character.class,
      race: character.race,
      sex: character.sex,
      hp: character.hp ?? stats.hp,
      maxHp: character.max_hp ?? stats.maxHp,
      mana: character.mana ?? stats.mana,
      maxMana: character.max_mana ?? stats.maxMana,
      stamina: character.stamina ?? stats.maxStamina,
      maxStamina: character.max_stamina ?? stats.maxStamina,
      food: character.food ?? 100,
      drink: character.drink ?? 100,
      gold: character.gold ?? 0,
      level: character.level ?? 1,
      xp: character.xp ?? 0,
      map: useMap,
      px: usePx,
      py: usePy,
      lastMoveTime: 0,
      selectedSpell: null,
      inventory: inventory,
      skills: character.skills || {
        combat_arms: 0,
        magic: 0,
        shield_defense: 0,
        dodge: 0,
        meditation: 0,
      },
      skillPoints: character.skill_points ?? 0,
      equipment: null,
      alignment: 'citizen',
      criminalUntil: 0,
    };

    player.equipment = { weapon: null, clothing: null, helmet: null, shield: null };
    if (character.equipment && typeof character.equipment === 'object') {
      player.equipment = { ...player.equipment, ...character.equipment };
    }
    if (inventory) {
      for (const inv of inventory) {
        if (inv.equipped && player.equipment.hasOwnProperty(inv.equipped)) {
          player.equipment[inv.equipped] = inv.itemType;
        }
      }
    }

    this.players.set(player.id, player);
    this.wsToPlayer.set(ws, player.id);

    return player;
  }

  removePlayer(ws) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return null;
    const player = this.players.get(playerId);
    this.players.delete(playerId);
    this.wsToPlayer.delete(ws);
    return player;
  }

  findFreeGroundSpot(mapName, px, py) {
    const offsets = [0, 18, -18, 36, -36, 54, -54, 28, -28, 44, -44];
    for (const off of offsets) {
      const tx = px + off;
      const ty = py + (off !== 0 ? Math.floor(Math.random() * 12 - 6) : 0);
      let occupied = false;
      for (const [, gi] of this.groundItems) {
        if (gi.map === mapName && Math.abs(gi.px - tx) < 16 && Math.abs(gi.py - ty) < 16) {
          occupied = true;
          break;
        }
      }
      if (!occupied) return { px: tx, py: ty };
    }
    return { px: px + Math.floor(Math.random() * 80 - 40), py: py + Math.floor(Math.random() * 20 - 10) };
  }

  handlePickupItem(ws, groundItemId) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    const groundItem = this.groundItems.get(groundItemId);
    if (!groundItem) { this.sendTo(ws, { type: 'error', msg: 'Item not found' }); return; }
    if (groundItem.map !== player.map) { this.sendTo(ws, { type: 'error', msg: 'Item not on this map' }); return; }

    const dx = Math.abs(groundItem.px - player.px);
    const dy = Math.abs(groundItem.py - player.py);
    if (dx > PICKUP_RANGE || dy > PICKUP_RANGE) { this.sendTo(ws, { type: 'error', msg: 'Too far from item' }); return; }

    const def = ITEM_DEFS[groundItem.itemType];
    if (!def) { this.sendTo(ws, { type: 'error', msg: 'Unknown item' }); return; }

    if (def.type === 'gold') {
      player.gold = (player.gold || 0) + (groundItem.amount || 1);
      this.groundItems.delete(groundItemId);
      this.broadcastToMap(player.map, { type: 'ground_item_removed', id: groundItemId });
      this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
      return { goldChanged: true };
    }

    let targetSlot = -1;
    for (let i = 0; i < MAX_INVENTORY_SLOTS; i++) {
      const existing = player.inventory.find(inv => inv.slot === i);
      if (!existing) { if (targetSlot === -1) targetSlot = i; }
      else if (existing.itemType === groundItem.itemType) { targetSlot = i; break; }
    }
    if (targetSlot === -1) { this.sendTo(ws, { type: 'error', msg: 'Inventory full' }); return; }

    const existing = player.inventory.find(inv => inv.slot === targetSlot);
    if (existing) { existing.quantity += 1; }
    else { player.inventory.push({ slot: targetSlot, itemType: groundItem.itemType, quantity: 1 }); }

    this.groundItems.delete(groundItemId);
    this.broadcastToMap(player.map, { type: 'ground_item_removed', id: groundItemId });
    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
    return { inventoryChanged: true };
  }

  handleDropItem(ws, slot, quantity = 1) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    const invItem = player.inventory.find(inv => inv.slot === slot);
    if (!invItem) { this.sendTo(ws, { type: 'error', msg: 'No item in slot' }); return; }

    if (invItem.equipped) {
      player.equipment = player.equipment || { weapon: null, clothing: null, helmet: null, shield: null };
      player.equipment[invItem.equipped] = null;
      delete invItem.equipped;
    }

    quantity = Math.min(Math.max(1, Math.floor(quantity) || 1), invItem.quantity);

    invItem.quantity -= quantity;
    if (invItem.quantity <= 0) player.inventory = player.inventory.filter(inv => inv.slot !== slot);

    const { px, py } = this.findFreeGroundSpot(player.map, player.px, player.py);
    const id = `${player.map}_${this._nextGroundItemId++}`;
    this.groundItems.set(id, { id, map: player.map, px, py, itemType: invItem.itemType, amount: quantity });
    this.broadcastToMap(player.map, { type: 'ground_item_added', id, map: player.map, px, py, itemType: invItem.itemType, amount: quantity });
    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
    return { inventoryChanged: true };
  }

  handleUseItem(ws, slot) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    const invItem = player.inventory.find(inv => inv.slot === slot);
    if (!invItem) { this.sendTo(ws, { type: 'error', msg: 'No item in slot' }); return; }

    const def = ITEM_DEFS[invItem.itemType];
    if (!def) { this.sendTo(ws, { type: 'error', msg: 'Unknown item' }); return; }

    if (invItem.equipped) { this.sendTo(ws, { type: 'error', msg: 'Unequip before using' }); return; }

    if (def.stat === 'food') player.food = Math.min(player.food + def.amount, player.maxFood ?? 100);
    else if (def.stat === 'drink') player.drink = Math.min(player.drink + def.amount, player.maxDrink ?? 100);

    invItem.quantity -= 1;
    if (invItem.quantity <= 0) player.inventory = player.inventory.filter(inv => inv.slot !== slot);

    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
    return { inventoryChanged: true, statsChanged: true };
  }

  handleBuyItem(ws, itemType, quantity = 1) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    quantity = Math.max(1, Math.floor(quantity) || 1);

    const price = SHOP_PRICES[itemType];
    if (!price) { this.sendTo(ws, { type: 'error', msg: 'Item not sold here' }); return; }

    const totalPrice = price * quantity;
    if ((player.gold || 0) < totalPrice) { this.sendTo(ws, { type: 'error', msg: 'Not enough gold' }); return; }

    let targetSlot = -1;
    for (let i = 0; i < MAX_INVENTORY_SLOTS; i++) {
      const existing = player.inventory.find(inv => inv.slot === i);
      if (!existing) { if (targetSlot === -1) targetSlot = i; }
      else if (existing.itemType === itemType) { targetSlot = i; break; }
    }
    if (targetSlot === -1) { this.sendTo(ws, { type: 'error', msg: 'Inventory full' }); return; }

    player.gold -= totalPrice;

    const existing = player.inventory.find(inv => inv.slot === targetSlot);
    if (existing) { existing.quantity = Math.min((existing.quantity || 0) + quantity, 99999); }
    else { player.inventory.push({ slot: targetSlot, itemType, quantity }); }

    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
    return { inventoryChanged: true, statsChanged: true };
  }

  handleSellItem(ws, slot, quantity = 1) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    const invItem = player.inventory.find(inv => inv.slot === slot);
    if (!invItem) { this.sendTo(ws, { type: 'error', msg: 'No item in slot' }); return; }

    const price = SELL_PRICES[invItem.itemType] || 0;
    if (price <= 0) { this.sendTo(ws, { type: 'error', msg: 'Cannot sell this item' }); return; }

    quantity = Math.min(Math.max(1, Math.floor(quantity) || 1), invItem.quantity);

    player.gold = (player.gold || 0) + (price * quantity);

    invItem.quantity -= quantity;
    if (invItem.quantity <= 0) player.inventory = player.inventory.filter(inv => inv.slot !== slot);

    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
    return { inventoryChanged: true, statsChanged: true };
  }

  handleRun(ws) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    if (player.stamina <= 0) return;
    player.stamina = Math.max(0, player.stamina - RUN_CONSUME_AMOUNT);
    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
  }

  handleMeditateStart(ws) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    if (player.meditating) return;
    if (player.mana >= player.maxMana) { this.sendTo(ws, { type: 'error', msg: 'Tu mana ya esta lleno' }); return; }

    player.meditating = true;
    this.broadcastToMap(player.map, { type: 'player_meditating', id: player.id, meditating: true });
    this.sendTo(ws, { type: 'meditate_started' });
  }

  handleMeditateStop(ws) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;

    if (!player.meditating) return;
    player.meditating = false;
    this.broadcastToMap(player.map, { type: 'player_meditating', id: player.id, meditating: false });
    this.sendTo(ws, { type: 'meditate_stopped' });
  }

  handleRevive(ws) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;
    if (!player.dead) return;

    player.dead = false;
    player.hp = player.maxHp;
    const oldMap = player.map;
    player.map = 'city';
    const spawn = this.findSpawn('city');
    player.px = spawn.px;
    player.py = spawn.py;

    if (oldMap !== 'city') {
      this.broadcastToMap(oldMap, { type: 'player_left', id: player.id }, ws);
    }
    this.sendTo(ws, {
      type: 'map_change',
      map: player.map,
      px: player.px,
      py: player.py,
      stats: this.getStats(player),
    });
    this.sendTo(ws, {
      type: 'world_state',
      yourId: player.id,
      map: player.map,
      players: this.getPlayersOnMap(player.map, player.id),
      stats: this.getStats(player),
      groundItems: this.getGroundItemsOnMap(player.map),
      npcs: this.getNpcsOnMap(player.map),
      enemies: this.getEnemiesOnMap(player.map),
    });
    this.broadcastToMap(player.map, { type: 'player_joined', player: this.playerData(player) }, ws);
  }

  sendTo(ws, msg) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  broadcastToMap(mapName, msg, excludeWs) {
    let serialized = null;
    for (const [ws, pid] of this.wsToPlayer) {
      if (ws === excludeWs) continue;
      const p = this.players.get(pid);
      if (p && p.map === mapName && ws.readyState === 1) {
        if (!serialized) serialized = JSON.stringify(msg);
        ws.send(serialized);
      }
    }
  }

  handleMove(ws, px, py, transitionTo, direction, animState) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    if (typeof px !== 'number' || typeof py !== 'number') return;

    player.direction = direction ?? player.direction ?? 'down';
    player.animState = animState || player.animState || 'idle';

    // map transition
    if (transitionTo && MAPS[transitionTo]) {
      const validTransition =
        (transitionTo === 'forest' && player.map === 'city') ||
        (transitionTo === 'city' && player.map === 'forest');
      if (validTransition) {
        const oldMap = player.map;
        player.map = transitionTo;
        player.px = px;
        player.py = py;
        const now = Date.now();
        player.lastMoveTime = now;

        this.broadcastToMap(oldMap, { type: 'player_left', id: player.id }, ws);
        this.sendTo(ws, {
          type: 'map_change',
          map: player.map,
          px: player.px,
          py: player.py,
          stats: this.getStats(player),
        });
        const newMapPlayers = this.getPlayersOnMap(player.map, player.id);
        this.sendTo(ws, {
          type: 'world_state',
          yourId: player.id,
          map: player.map,
          players: newMapPlayers,
          stats: this.getStats(player),
          groundItems: this.getGroundItemsOnMap(player.map),
          npcs: this.getNpcsOnMap(player.map),
          enemies: this.getEnemiesOnMap(player.map),
        });
        this.broadcastToMap(player.map, { type: 'player_joined', player: this.playerData(player) }, ws);
        return;
      }
    }

    const now = Date.now();
    if (now - player.lastMoveTime < MOVE_COOLDOWN) return;

    const mapW = MAP_COLS * TILE_SIZE;
    const mapH = MAP_ROWS * TILE_SIZE;

    const dx = Math.abs(px - player.px);
    const dy = Math.abs(py - player.py);
    if (dx > MAX_MOVE_DIST || dy > MAX_MOVE_DIST) return;

    if (px - PLAYER_W / 2 < 0 || px + PLAYER_W / 2 > mapW ||
        py - PLAYER_H / 2 < 0 || py + PLAYER_H / 2 > mapH) {
      return;
    }

    if (!isPixelWalkable(player.map, px, py, PLAYER_W, PLAYER_H)) return;

    const map = MAPS[player.map];
    if (!map || !map.safe) {
      if (this.isPixelOccupied(player.map, px, py, PLAYER_W, PLAYER_H, player.id)) return;
    }

    if (player.meditating) {
      player.meditating = false;
      this.broadcastToMap(player.map, { type: 'player_meditating', id: player.id, meditating: false });
      this.sendTo(ws, { type: 'meditate_stopped' });
    }

    player.px = px;
    player.py = py;
    player.lastMoveTime = now;

    this.broadcastToMap(player.map, {
      type: 'player_moved',
      id: player.id,
      px: px,
      py: py,
      direction: player.direction,
      animState: player.animState,
    }, ws);
    this.sendTo(ws, {
      type: 'player_moved',
      id: player.id,
      px: px,
      py: py,
      direction: player.direction,
      animState: player.animState,
    });
  }

  awardEnemyXp(attacker, enemy, damage) {
    const def = ENEMY_TYPES[enemy.type];
    if (!def) return;
    const actualDmg = Math.min(damage, enemy.hp);
    if (actualDmg <= 0) return;
    if (def.xpPerHit) {
      this.addXp(attacker, def.xpPerHit);
    } else {
      const xpFromHit = Math.floor((actualDmg / enemy.maxHp) * def.xp);
      if (xpFromHit > 0) this.addXp(attacker, xpFromHit);
    }
  }

  handleAttack(ws) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const attacker = this.players.get(playerId);
    if (!attacker || attacker.dead) return;

    if (attacker.stamina < 1) {
      this.sendTo(ws, { type: 'error', msg: 'No tienes suficiente stamina' });
      return;
    }

    const growth = CLASS_GROWTH[attacker.class];
    const levelDmg = growth ? Math.floor((attacker.level - 1) * growth.damage) : 0;
    const skillDmg = Math.floor(((attacker.skills?.combat_arms || 0)) / 10);
    const eqDmg = this.getEffectiveStats(attacker).effectiveDamage;
    const damage = (CLASS_MELEE_DAMAGE[attacker.class] || 1) + levelDmg + skillDmg + eqDmg;

    const aTx = Math.floor(attacker.px / TILE_SIZE);
    const aTy = Math.floor(attacker.py / TILE_SIZE);

    // attack enemies in any adjacent tile
    for (const [, e] of this.enemies) {
      if (e.map !== attacker.map) continue;
      const eTx = Math.floor(e.px / TILE_SIZE);
      const eTy = Math.floor(e.py / TILE_SIZE);
      const dx = Math.abs(eTx - aTx);
      const dy = Math.abs(eTy - aTy);
      if (dx <= 1 && dy <= 1) {
        attacker.stamina -= 1;
        e.hp = Math.max(0, e.hp - damage);
        this.awardEnemyXp(attacker, e, damage);
        this.sendTo(ws, { type: 'stats_update', ...this.getStats(attacker) });
        this.broadcastToMap(attacker.map, { type: 'enemy_hit', enemyId: e.id, hp: e.hp, damage });
        if (e.hp <= 0) {
          setTimeout(() => this.enemyDied(e, attacker.id), 50);
        }
        return;
      }
    }

    const map = MAPS[attacker.map];
    if (map && map.safe) {
      this.sendTo(ws, { type: 'error', msg: 'No puedes atacar en zonas seguras' });
      return;
    }

    // attack players in any adjacent tile
    let target = null;
    for (const [, p] of this.players) {
      if (p.id === attacker.id) continue;
      if (p.map !== attacker.map) continue;
      const tTx = Math.floor(p.px / TILE_SIZE);
      const tTy = Math.floor(p.py / TILE_SIZE);
      const dx = Math.abs(tTx - aTx);
      const dy = Math.abs(tTy - aTy);
      if (dx <= 1 && dy <= 1) {
        target = p;
        break;
      }
    }

    if (!target) {
      this.sendTo(ws, { type: 'attack_miss' });
      return;
    }

    if (attacker.alignment === 'citizen' && target.alignment === 'citizen') {
      attacker.alignment = 'criminal';
      attacker.criminalUntil = Date.now() + 300000;
      this.sendTo(ws, { type: 'stats_update', ...this.getStats(attacker) });
      this.broadcastToMap(attacker.map, {
        type: 'player_alignment',
        id: attacker.id,
        alignment: 'criminal',
      });
    }

    attacker.stamina -= 1;
    target.hp = Math.max(0, target.hp - damage);

    const msg = {
      type: 'player_attacked',
      attackerId: attacker.id,
      attackerName: attacker.name,
      targetId: target.id,
      targetName: target.name,
      damage,
      targetHp: target.hp,
    };
    this.broadcastToMap(attacker.map, msg, null);
    this.sendTo(ws, { type: 'stats_update', ...this.getStats(attacker) });

    const targetWs = this.getWsByPlayerId(target.id);
    if (targetWs) {
      this.sendTo(targetWs, { type: 'stats_update', ...this.getStats(target) });
    }

    if (target.hp <= 0) {
      target.dead = true;
      this.addXp(attacker, 50);
      this.broadcastToMap(target.map, {
        type: 'player_died',
        id: target.id,
        px: target.px,
        py: target.py,
      });
    }
  }

  isPixelOccupied(mapName, px, py, w, h, excludeId) {
    for (const [, p] of this.players) {
      if (p.id === excludeId) continue;
      if (p.map !== mapName) continue;
      if (Math.abs(p.px - px) < w && Math.abs(p.py - py) < h) return true;
    }
    for (const [, e] of this.enemies) {
      if (e.map !== mapName) continue;
      if (Math.abs(e.px - px) < (w + 32) / 2 && Math.abs(e.py - py) < (h + 32) / 2) return true;
    }
    return false;
  }

  getWsByPlayerId(playerId) {
    for (const [ws, pid] of this.wsToPlayer) {
      if (pid === playerId) return ws;
    }
    return null;
  }

  handleCastSpell(ws, targetPlayerId, spellKey = 'hechizo_1') {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const caster = this.players.get(playerId);
    if (!caster || caster.dead) return;

    const spell = SPELL_DEFS[spellKey];
    if (!spell) { this.sendTo(ws, { type: 'error', msg: 'Hechizo desconocido' }); return; }

    if (!spell.classes.includes(caster.class)) {
      this.sendTo(ws, { type: 'error', msg: 'Tu clase no puede lanzar este hechizo' });
      return;
    }

    const magicReq = spell.magicReq || 0;
    if ((caster.skills?.magic || 0) < magicReq) {
      this.sendTo(ws, { type: 'error', msg: 'Necesitas mas skill de Magia' });
      return;
    }

    if ((caster.mana || 0) < spell.mana) {
      this.sendTo(ws, { type: 'error', msg: 'No tienes suficiente mana' });
      return;
    }

    const target = targetPlayerId ? this.players.get(targetPlayerId) : null;
    const enemyTarget = targetPlayerId ? this.enemies.get(targetPlayerId) : null;

    if (spell.type === 'heal') {
      const healTarget = target && target.map === caster.map && target.id !== caster.id ? target : caster;
      if (healTarget !== caster && healTarget.dead) {
        this.sendTo(ws, { type: 'error', msg: 'El objetivo esta muerto' });
        return;
      }

      caster.mana -= spell.mana;
      healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + spell.heal);

      const healMsg = {
        type: 'spell_heal',
        casterId: caster.id,
        casterName: caster.name,
        targetId: healTarget.id,
        targetName: healTarget.name,
        healAmount: spell.heal,
        targetHp: healTarget.hp,
      };
      this.broadcastToMap(caster.map, healMsg, null);
      this.sendTo(ws, { type: 'stats_update', ...this.getStats(caster) });
      if (healTarget.id !== caster.id) {
        const targetWs = this.getWsByPlayerId(healTarget.id);
        if (targetWs) this.sendTo(targetWs, { type: 'stats_update', ...this.getStats(healTarget) });
      }
      return;
    }

    if (spell.type === 'aoe') {
      if (!target && !enemyTarget) {
        this.sendTo(ws, { type: 'error', msg: 'Selecciona un objetivo para Tormenta' });
        return;
      }
      const originPx = target ? target.px : enemyTarget.px;
      const originPy = target ? target.py : enemyTarget.py;
      const originMap = target ? target.map : enemyTarget.map;
      if (originMap !== caster.map) {
        this.sendTo(ws, { type: 'error', msg: 'El objetivo no esta en este mapa' });
        return;
      }

      const map = MAPS[caster.map];
      if (map && map.safe) {
        this.sendTo(ws, { type: 'error', msg: 'No puedes atacar en zonas seguras' });
        return;
      }

      caster.mana -= spell.mana;
      const radius = spell.aoeRadius * TILE_SIZE;
      const affected = [];

      for (const [, e] of this.enemies) {
        if (e.map !== caster.map) continue;
        const dx = Math.abs(e.px - originPx);
        const dy = Math.abs(e.py - originPy);
        if (dx <= radius && dy <= radius) {
          this.awardEnemyXp(caster, e, spell.damage);
          e.hp = Math.max(0, e.hp - spell.damage);
          affected.push({ id: e.id, hp: e.hp, type: 'enemy' });
          if (e.hp <= 0) {
            setTimeout(() => this.enemyDied(e, caster.id), 50);
          }
        }
      }

      for (const [, p] of this.players) {
        if (p.id === caster.id) continue;
        if (p.map !== caster.map || p.dead) continue;
        const dx = Math.abs(p.px - originPx);
        const dy = Math.abs(p.py - originPy);
        if (dx <= radius && dy <= radius) {
          if (caster.alignment === 'citizen' && p.alignment === 'citizen') {
            caster.alignment = 'criminal';
            caster.criminalUntil = Date.now() + 300000;
          }
          p.hp = Math.max(0, p.hp - spell.damage);
          affected.push({ id: p.id, hp: p.hp, type: 'player' });
          const targetWs = this.getWsByPlayerId(p.id);
          if (targetWs) this.sendTo(targetWs, { type: 'stats_update', ...this.getStats(p) });
          if (p.hp <= 0) {
            p.dead = true;
            this.addXp(caster, 50);
            this.broadcastToMap(p.map, { type: 'player_died', id: p.id, px: p.px, py: p.py });
          }
        }
      }

      this.sendTo(ws, { type: 'stats_update', ...this.getStats(caster) });
      this.broadcastToMap(caster.map, {
        type: 'spell_aoe',
        casterId: caster.id,
        casterName: caster.name,
        targetId: targetPlayerId,
        damage: spell.damage,
        affected,
      }, null);
      this.broadcastEnemyState(caster.map);
      return;
    }

    // damage type
    if (!target && !enemyTarget) {
      this.sendTo(ws, { type: 'error', msg: 'Objetivo invalido' });
      return;
    }

    if (target && target.map !== caster.map) {
      this.sendTo(ws, { type: 'error', msg: 'El objetivo no esta en este mapa' });
      return;
    }
    if (enemyTarget && enemyTarget.map !== caster.map) {
      this.sendTo(ws, { type: 'error', msg: 'El objetivo no esta en este mapa' });
      return;
    }

    if (target) {
      const map = MAPS[caster.map];
      if (map && map.safe) {
        this.sendTo(ws, { type: 'error', msg: 'No puedes atacar en zonas seguras' });
        return;
      }
    }

    const targetPx = target ? target.px : enemyTarget.px;
    const targetPy = target ? target.py : enemyTarget.py;
    const cTx = Math.floor(caster.px / TILE_SIZE);
    const cTy = Math.floor(caster.py / TILE_SIZE);
    const tTx = Math.floor(targetPx / TILE_SIZE);
    const tTy = Math.floor(targetPy / TILE_SIZE);
    const dist = Math.abs(tTx - cTx) + Math.abs(tTy - cTy);
    if (dist > spell.range) {
      this.sendTo(ws, { type: 'error', msg: 'El objetivo esta muy lejos' });
      return;
    }

    caster.mana -= spell.mana;

    if (target && caster.alignment === 'citizen' && target.alignment === 'citizen') {
      caster.alignment = 'criminal';
      caster.criminalUntil = Date.now() + 300000;
      this.sendTo(ws, { type: 'stats_update', ...this.getStats(caster) });
      this.broadcastToMap(caster.map, {
        type: 'player_alignment',
        id: caster.id,
        alignment: 'criminal',
      });
    }

    if (target) {
      target.hp = Math.max(0, target.hp - spell.damage);
      const msg = {
        type: 'spell_cast',
        casterId: caster.id, casterName: caster.name,
        targetId: target.id, targetName: target.name,
        damage: spell.damage, targetHp: target.hp,
      };
      this.broadcastToMap(caster.map, msg, null);
      this.sendTo(ws, { type: 'stats_update', ...this.getStats(caster) });
      const targetWs = this.getWsByPlayerId(target.id);
      if (targetWs) this.sendTo(targetWs, { type: 'stats_update', ...this.getStats(target) });
      if (target.hp <= 0) {
        target.dead = true;
        this.addXp(caster, 50);
        this.broadcastToMap(target.map, { type: 'player_died', id: target.id, px: target.px, py: target.py });
      }
    } else if (enemyTarget) {
      this.awardEnemyXp(caster, enemyTarget, spell.damage);
      enemyTarget.hp = Math.max(0, enemyTarget.hp - spell.damage);
      this.sendTo(ws, { type: 'stats_update', ...this.getStats(caster) });
      this.broadcastToMap(caster.map, { type: 'enemy_hit', enemyId: enemyTarget.id, hp: enemyTarget.hp, damage: spell.damage });
      if (enemyTarget.hp <= 0) {
        setTimeout(() => this.enemyDied(enemyTarget, caster.id), 50);
      }
    }
  }

  addXp(player, amount) {
    if (player.level >= 50) return;
    if (amount <= 0) return;
    player.xp = (player.xp || 0) + amount;

    while (player.level < 50) {
      const needed = XP_TABLE[player.level];
      if (!needed) break;
      if (player.xp >= needed) {
        player.xp -= needed;
        player.level += 1;

        const growth = CLASS_GROWTH[player.class];
        if (growth) {
          player.maxHp += growth.hp;
          player.hp = player.maxHp;
          player.maxMana += growth.mana;
          player.mana = player.maxMana;
          player.maxStamina += growth.stamina;
          player.stamina = player.maxStamina;
        }
        player.skillPoints = (player.skillPoints || 0) + 5;

        const ws = this.getWsByPlayerId(player.id);
        if (ws) {
          this.sendTo(ws, { type: 'level_up', level: player.level, stats: this.getStats(player) });
        }
        this.broadcastToMap(player.map, { type: 'player_level_up', id: player.id, level: player.level });
      } else {
        break;
      }
    }
  }

  getEffectiveStats(player) {
    let bonusHp = 0, bonusDamage = 0, damageReduction = 0;

    const equippedItems = new Set();
    for (const [slot, itemType] of Object.entries(player.equipment || {})) {
      if (itemType) equippedItems.add(itemType);
    }
    for (const inv of (player.inventory || [])) {
      if (inv.equipped) equippedItems.add(inv.itemType);
    }

    for (const itemType of equippedItems) {
      const def = ITEM_DEFS[itemType];
      if (!def) continue;
      bonusHp += def.hp || 0;
      bonusDamage += def.damage || 0;
      damageReduction += def.defense || 0;
    }

    return {
      effectiveMaxHp: player.maxHp + bonusHp,
      effectiveDamage: bonusDamage,
      damageReduction,
    };
  }

  handleEquipItem(ws, inventorySlot) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    player.equipment = player.equipment || { weapon: null, clothing: null, helmet: null, shield: null };

    const invItem = (player.inventory || []).find(inv => inv.slot === inventorySlot);
    if (!invItem) { this.sendTo(ws, { type: 'error', msg: 'No item in that slot' }); return; }

    const def = ITEM_DEFS[invItem.itemType];
    if (!def || !def.equipSlot) { this.sendTo(ws, { type: 'error', msg: 'This item cannot be equipped' }); return; }

    if (invItem.equipped) { this.sendTo(ws, { type: 'error', msg: 'Item already equipped' }); return; }

    const itemSize = def.size || 'any';
    if (itemSize !== 'any') {
      const raceIsTall = RACE_HEIGHT.tall.includes(player.race);
      if (itemSize === 'tall' && !raceIsTall) {
        this.sendTo(ws, { type: 'error', msg: 'Solo razas altas pueden usar este item' });
        return;
      }
      if (itemSize === 'short' && raceIsTall) {
        this.sendTo(ws, { type: 'error', msg: 'Solo razas bajas pueden usar este item' });
        return;
      }
    }

    const equipSlot = def.equipSlot;

    if (player.equipment[equipSlot]) {
      const oldEquipped = (player.inventory || []).find(inv => inv.equipped === equipSlot);
      if (oldEquipped) delete oldEquipped.equipped;
    }

    player.equipment[equipSlot] = invItem.itemType;
    invItem.equipped = equipSlot;

    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
  }

  handleUnequipItem(ws, equipSlot) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    player.equipment = player.equipment || { weapon: null, clothing: null, helmet: null, shield: null };

    if (!player.equipment[equipSlot]) {
      this.sendTo(ws, { type: 'error', msg: 'Nothing equipped in that slot' });
      return;
    }

    const invItem = (player.inventory || []).find(inv => inv.equipped === equipSlot);
    if (invItem) delete invItem.equipped;

    player.equipment[equipSlot] = null;

    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
  }

  handleSwapInventory(ws, slotA, slotB) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    if (typeof slotA !== 'number' || typeof slotB !== 'number' || slotA === slotB) return;
    if (slotA < 0 || slotA >= MAX_INVENTORY_SLOTS || slotB < 0 || slotB >= MAX_INVENTORY_SLOTS) return;

    const inv = player.inventory || [];
    const itemA = inv.find(i => i.slot === slotA);
    const itemB = inv.find(i => i.slot === slotB);

    if (itemA) itemA.slot = slotB;
    if (itemB) itemB.slot = slotA;

    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
  }

  handleChat(ws, text) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;

    if (!text || text.trim().length === 0) return;
    if (text.length > 200) text = text.slice(0, 200);

    this.broadcastToMap(player.map, {
      type: 'chat_message',
      playerId: player.id,
      name: player.name,
      text: text.trim(),
    }, null);
  }

  handleAssignSkill(ws, skillName) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    if (!SKILL_DEFS[skillName]) {
      this.sendTo(ws, { type: 'error', msg: 'Habilidad invalida' });
      return;
    }

    if ((player.skillPoints ?? 0) <= 0) {
      this.sendTo(ws, { type: 'error', msg: 'No tienes puntos de habilidad' });
      return;
    }

    player.skills = player.skills || {
      combat_arms: 0, magic: 0, shield_defense: 0, dodge: 0, meditation: 0,
    };

    if ((player.skills[skillName] || 0) >= SKILL_DEFS[skillName].max) {
      this.sendTo(ws, { type: 'error', msg: 'Habilidad al maximo' });
      return;
    }

    player.skills[skillName] = (player.skills[skillName] || 0) + 1;
    player.skillPoints -= 1;

    this.sendTo(ws, { type: 'stats_update', ...this.getStats(player) });
  }
}
