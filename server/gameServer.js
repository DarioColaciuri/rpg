import { MAPS, TILE_SIZE, isPixelWalkable, findGroundY } from './maps.js';

const BASE_STATS = {
  WARRIOR: { hp: 20, mana: 10, stamina: 20 },
  MAGE: { hp: 10, mana: 30, stamina: 20 },
};
const RACE_BONUS = {
  HUMAN: { hp: 5, mana: 0 },
  GNOME: { hp: 0, mana: 5 },
};

const PLAYER_W = 32;
const PLAYER_H = 64;
const MOVE_COOLDOWN = 80;
const MAX_MOVE_DIST = 80;

const RUN_CONSUME_AMOUNT = 2;
const RUN_TICK_MS = 100;
const SPELL_MANA_COST = 2;
const MEDITATE_MANA_REGEN = 5;
const MEDITATE_INTERVAL = 1000;

const ENEMY_COUNT = 3;
const ENEMY_SPEED = 60;
const ENEMY_JUMP = -210;
const ENEMY_HP = 10;
const ENEMY_DAMAGE = 1;
const ENEMY_ATTACK_COOLDOWN = 2000;
const ENEMY_AGGRO_RANGE = 100;
const ENEMY_ATTACK_RANGE = 48;
const ENEMY_TICK = 50;
const ENEMY_BROADCAST = 50;

const ITEM_DEFS = {
  apple: { name: 'Apple', stat: 'food', amount: 10 },
  water: { name: 'Water', stat: 'drink', amount: 10 },
  gold_pile: { name: 'Gold', type: 'gold' },
};

const MAX_INVENTORY_SLOTS = 12;
const STAT_DRAIN_INTERVAL = 10000;
const STAT_DRAIN_AMOUNT = 10;
const PICKUP_RANGE = 48;

const DEFAULT_GROUND_ITEMS = {
  city: [
    { px: 850, py: 790, itemType: 'gold_pile', amount: 99999 },
  ],
  forest: [],
};

const SHOP_PRICES = {
  apple: 10,
  water: 10,
};

const SELL_PRICES = {
  apple: 5,
  water: 5,
};

const NPCS = {
  city: [
    { id: 'merchant_city', name: 'Merchant', px: 800, py: 800, color: 0x44cc44, shop: true },
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
    stamina: base.stamina,
    maxStamina: base.stamina,
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
    for (let i = 0; i < ENEMY_COUNT; i++) {
      this.spawnEnemy('forest');
    }
  }

  spawnEnemy(mapName) {
    const map = MAPS[mapName];
    if (!map) return;
    let px, py;
    for (let attempt = 0; attempt < 50; attempt++) {
      const tx = 2 + Math.floor(Math.random() * (map.width - 4));
      let groundRow = map.height;
      for (let r = 1; r < map.height; r++) {
        if (map.tiles[r][tx] === 1 && map.tiles[r - 1][tx] !== 1) { groundRow = r; break; }
      }
      if (groundRow >= map.height) continue;
      px = tx * TILE_SIZE + TILE_SIZE / 2;
      py = (groundRow - 1) * TILE_SIZE + TILE_SIZE / 2;
      if (py > 100 && isPixelWalkable(mapName, px, py, 32, 32) && !this.isPixelOccupied(mapName, px, py, 32, 32)) {
        break;
      }
      px = null; py = null;
    }
    if (!px) { px = 200; py = 750; }

    const id = `enemy_${this._nextEnemyId++}`;
    this.enemies.set(id, {
      id, map: mapName, px, py,
      hp: ENEMY_HP, maxHp: ENEMY_HP,
      direction: Math.random() > 0.5 ? 'right' : 'left',
      velX: 0, velY: 0, grounded: true,
      attackCooldown: 0,
      walkTimer: Math.random() * 2000,
    });
  }

  getEnemiesOnMap(mapName) {
    const result = [];
    for (const [, e] of this.enemies) {
      if (e.map === mapName) result.push({ id: e.id, px: e.px, py: e.py, hp: e.hp, maxHp: e.maxHp, direction: e.direction });
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
        this.broadcastEnemyState('forest');
      }
    }, ENEMY_TICK);
  }

  updateEnemy(enemy, deltaMs) {
    const delta = deltaMs / 1000;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - deltaMs);

    let nearestPlayer = null;
    let nearestDist = Infinity;
    for (const [, p] of this.players) {
      if (p.map !== enemy.map || p.dead) continue;
      const dx = Math.abs(p.px - enemy.px);
      const dy = Math.abs(p.py - enemy.py);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ENEMY_AGGRO_RANGE && dist < nearestDist) {
        nearestDist = dist;
        nearestPlayer = p;
      }
    }

    if (nearestPlayer) {
      const dx = nearestPlayer.px - enemy.px;
      enemy.direction = dx > 0 ? 'right' : 'left';

      if (nearestDist < ENEMY_ATTACK_RANGE && enemy.attackCooldown <= 0) {
        nearestPlayer.hp = Math.max(0, nearestPlayer.hp - ENEMY_DAMAGE);
        enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN;
        const targetWs = this.getWsByPlayerId(nearestPlayer.id);
        if (targetWs) this.sendTo(targetWs, { type: 'stats_update', ...this.getStats(nearestPlayer) });
        this.broadcastToMap(enemy.map, {
          type: 'enemy_attack',
          enemyId: enemy.id, targetId: nearestPlayer.id,
          damage: ENEMY_DAMAGE, targetHp: nearestPlayer.hp,
        });
        if (nearestPlayer.hp <= 0) {
          nearestPlayer.dead = true;
          this.broadcastToMap(nearestPlayer.map, {
            type: 'player_died', id: nearestPlayer.id, px: nearestPlayer.px, py: nearestPlayer.py,
          });
        }
      } else {
        const speed = enemy.direction === 'right' ? ENEMY_SPEED : -ENEMY_SPEED;
        enemy.velX = speed;
      }
    } else {
      enemy.walkTimer -= deltaMs;
      if (enemy.walkTimer <= 0) {
        enemy.walkTimer = 1500 + Math.random() * 3000;
        enemy.direction = Math.random() > 0.5 ? 'right' : 'left';
        if (enemy.grounded && Math.random() > 0.5) enemy.velY = ENEMY_JUMP;
      }
      const speed = enemy.direction === 'right' ? ENEMY_SPEED : -ENEMY_SPEED;
      enemy.velX = speed;
    }

    enemy.velY += 600 * delta;
    const newX = enemy.px + (enemy.velX || 0) * delta;
    const newY = enemy.py + enemy.velY * delta;

    const mapData = MAPS[enemy.map];
    const mapW = mapData.width * TILE_SIZE;
    const clampX = Math.max(16, Math.min(mapW - 16, newX));
    const clampY = Math.max(16, Math.min(mapData.height * TILE_SIZE - 16, newY));

    if (newX <= 16 || newX >= mapW - 16) {
      enemy.direction = enemy.direction === 'right' ? 'left' : 'right';
      enemy.velX = 0;
    }

    let blockedX = false;
    if (!isPixelWalkable(enemy.map, clampX, enemy.py, 32, 32)) {
      enemy.direction = enemy.direction === 'right' ? 'left' : 'right';
      enemy.velX = 0;
      blockedX = true;
    }
    for (const [, p] of this.players) {
      if (p.map !== enemy.map || p.dead) continue;
      if (Math.abs(p.px - clampX) < 34 && Math.abs(p.py - enemy.py) < 50) {
        enemy.direction = enemy.direction === 'right' ? 'left' : 'right';
        enemy.velX = 0;
        blockedX = true;
        break;
      }
    }
    if (!blockedX) enemy.px = clampX;

    if (isPixelWalkable(enemy.map, enemy.px, clampY, 32, 32)) {
      enemy.py = clampY;
      enemy.grounded = false;
    } else {
      if (enemy.velY > 0) {
        enemy.grounded = true;
        enemy.velY = 0;
        enemy.py = Math.floor(enemy.py / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
      } else {
        enemy.velY = 0;
      }
    }

    if (!isPixelWalkable(enemy.map, enemy.px, enemy.py, 32, 32)) {
      enemy.py = enemy.py - enemy.velY * delta;
      enemy.velY = 0;
    }
  }

  broadcastEnemyState(mapName) {
    const enemies = this.getEnemiesOnMap(mapName);
    if (enemies.length > 0) {
      this.broadcastToMap(mapName, { type: 'enemies_state', enemies });
    }
  }

  enemyDied(enemy) {
    this.broadcastToMap(enemy.map, { type: 'enemy_died', id: enemy.id });
    const gid = `${enemy.map}_${this._nextGroundItemId++}`;
    this.groundItems.set(gid, { id: gid, map: enemy.map, px: enemy.px, py: enemy.py, itemType: 'gold_pile', amount: 1 });
    this.broadcastToMap(enemy.map, { type: 'ground_item_added', id: gid, map: enemy.map, px: enemy.px, py: enemy.py, itemType: 'gold_pile', amount: 1 });
    this.enemies.delete(enemy.id);
    this.spawnEnemy(enemy.map);
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
      direction: player.direction ?? 'right',
      animState: player.animState ?? 'walk',
      isCrouching: player.isCrouching ?? false,
      headVariant: player.headVariant ?? 1,
    };
  }

  getStats(player) {
    return {
      name: player.name,
      class: player.class,
      race: player.race,
      sex: player.sex,
      px: player.px,
      py: player.py,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana,
      stamina: player.stamina,
      maxStamina: player.maxStamina,
      food: player.food,
      drink: player.drink,
      gold: player.gold ?? 0,
      level: player.level,
      xp: player.xp,
      headVariant: player.headVariant ?? 1,
      inventory: player.inventory || [],
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
    if (!map) return { px: 80, py: 800 };
    const { x: sx } = map.spawn;
    const spawnPx = tileCenter(sx);
    const spawnPy = findGroundY(mapName, spawnPx);
    return { px: spawnPx, py: spawnPy };
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
      headVariant: character.head_variant ?? 1,
      inventory: inventory,
    };

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

  getInventory(playerId) {
    const player = this.players.get(playerId);
    if (!player) return [];
    return player.inventory || [];
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

    quantity = Math.min(Math.max(1, Math.floor(quantity) || 1), invItem.quantity);

    invItem.quantity -= quantity;
    if (invItem.quantity <= 0) player.inventory = player.inventory.filter(inv => inv.slot !== slot);

    const id = `${player.map}_${this._nextGroundItemId++}`;
    this.groundItems.set(id, { id, map: player.map, px: player.px, py: player.py, itemType: invItem.itemType, amount: quantity });
    this.broadcastToMap(player.map, { type: 'ground_item_added', id, map: player.map, px: player.px, py: player.py, itemType: invItem.itemType, amount: quantity });
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
    for (const [ws, pid] of this.wsToPlayer) {
      if (ws === excludeWs) continue;
      const p = this.players.get(pid);
      if (p && p.map === mapName) {
        this.sendTo(ws, msg);
      }
    }
  }

  handleMove(ws, px, py, transitionTo, direction, animState, isCrouching) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.dead) return;

    if (typeof px !== 'number' || typeof py !== 'number') return;

    player.direction = direction ?? player.direction ?? 'right';
    player.animState = animState || player.animState || 'walk';
    player.isCrouching = isCrouching ?? player.isCrouching ?? false;

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

    const mapData = MAPS[player.map];
    if (!mapData) return;

    const mapW = mapData.width * TILE_SIZE;
    const mapH = mapData.height * TILE_SIZE;

    const dx = Math.abs(px - player.px);
    const dy = Math.abs(py - player.py);
    if (dx > MAX_MOVE_DIST || dy > MAX_MOVE_DIST) return;

    if (px - PLAYER_W / 2 < 0 || px + PLAYER_W / 2 > mapW ||
        py - PLAYER_H / 2 < 0 || py + PLAYER_H / 2 > mapH) {
      return;
    }

    if (!isPixelWalkable(player.map, px, py, PLAYER_W, PLAYER_H)) return;

    const mapData2 = MAPS[player.map];
    if (!mapData2 || !mapData2.safe) {
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
      isCrouching: player.isCrouching,
    }, ws);
    this.sendTo(ws, {
      type: 'player_moved',
      id: player.id,
      px: px,
      py: py,
      direction: player.direction,
      animState: player.animState,
      isCrouching: player.isCrouching,
    });
  }

  handleAttack(ws) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const attacker = this.players.get(playerId);
    if (!attacker || attacker.dead) return;

    const map = MAPS[attacker.map];
    if (!map || map.safe) {
      this.sendTo(ws, { type: 'error', msg: 'No puedes atacar en zonas seguras' });
      return;
    }

    if (attacker.stamina < 1) {
      this.sendTo(ws, { type: 'error', msg: 'No tienes suficiente stamina' });
      return;
    }

    const damage = attacker.class === 'WARRIOR' ? 4 : 1;

    const aTx = Math.floor(attacker.px / TILE_SIZE);
    const aTy = Math.floor(attacker.py / TILE_SIZE);

    let target = null;
    for (const [, p] of this.players) {
      if (p.id === attacker.id) continue;
      if (p.map !== attacker.map) continue;
      const tTx = Math.floor(p.px / TILE_SIZE);
      const tTy = Math.floor(p.py / TILE_SIZE);
      const dx = Math.abs(tTx - aTx);
      const dy = Math.abs(tTy - aTy);
      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
        target = p;
        break;
      }
    }

    if (!target) {
      for (const [, e] of this.enemies) {
        if (e.map !== attacker.map) continue;
        const eTx = Math.floor(e.px / TILE_SIZE);
        const eTy = Math.floor(e.py / TILE_SIZE);
        const dx = Math.abs(eTx - aTx);
        const dy = Math.abs(eTy - aTy);
        if (dx <= 1 && dy <= 1) {
          attacker.stamina -= 1;
          e.hp = Math.max(0, e.hp - damage);
          this.sendTo(ws, { type: 'stats_update', ...this.getStats(attacker) });
          if (e.hp <= 0) {
            this.enemyDied(e);
          } else {
            this.broadcastToMap(attacker.map, { type: 'enemy_hit', enemyId: e.id, hp: e.hp });
          }
          return;
        }
      }
      this.sendTo(ws, { type: 'attack_miss' });
      return;
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
      if (Math.abs(e.px - px) < w + 16 && Math.abs(e.py - py) < h + 16) return true;
    }
    return false;
  }

  getWsByPlayerId(playerId) {
    for (const [ws, pid] of this.wsToPlayer) {
      if (pid === playerId) return ws;
    }
    return null;
  }

  handleCastSpell(ws, targetPlayerId) {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const caster = this.players.get(playerId);
    if (!caster || caster.dead) return;

    if (caster.class !== 'MAGE') {
      this.sendTo(ws, { type: 'error', msg: 'Solo los magos pueden lanzar hechizos' });
      return;
    }

    const map = MAPS[caster.map];
    if (!map || map.safe) {
      this.sendTo(ws, { type: 'error', msg: 'No puedes atacar en zonas seguras' });
      return;
    }

    if ((caster.mana || 0) < SPELL_MANA_COST) {
      this.sendTo(ws, { type: 'error', msg: 'No tienes suficiente mana' });
      return;
    }

    if (!targetPlayerId) {
      this.sendTo(ws, { type: 'error', msg: 'Objetivo invalido' });
      return;
    }

    const target = this.players.get(targetPlayerId);
    const enemyTarget = this.enemies.get(targetPlayerId);
    if ((!target || target.id === caster.id) && !enemyTarget) {
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

    const targetPx = target ? target.px : enemyTarget.px;
    const targetPy = target ? target.py : enemyTarget.py;
    const cTx = Math.floor(caster.px / TILE_SIZE);
    const cTy = Math.floor(caster.py / TILE_SIZE);
    const tTx = Math.floor(targetPx / TILE_SIZE);
    const tTy = Math.floor(targetPy / TILE_SIZE);
    const dist = Math.abs(tTx - cTx) + Math.abs(tTy - cTy);
    if (dist > 12) {
      this.sendTo(ws, { type: 'error', msg: 'El objetivo esta muy lejos' });
      return;
    }

    caster.mana = Math.max(0, (caster.mana || 0) - SPELL_MANA_COST);

    if (target) {
      target.hp = Math.max(0, target.hp - 3);
      const msg = {
        type: 'spell_cast',
        casterId: caster.id, casterName: caster.name,
        targetId: target.id, targetName: target.name,
        damage: 3, targetHp: target.hp,
      };
      this.broadcastToMap(caster.map, msg, null);
      this.sendTo(ws, { type: 'stats_update', ...this.getStats(caster) });
      const targetWs = this.getWsByPlayerId(target.id);
      if (targetWs) this.sendTo(targetWs, { type: 'stats_update', ...this.getStats(target) });
      if (target.hp <= 0) {
        target.dead = true;
        this.broadcastToMap(target.map, { type: 'player_died', id: target.id, px: target.px, py: target.py });
      }
    } else if (enemyTarget) {
      enemyTarget.hp = Math.max(0, enemyTarget.hp - 3);
      this.sendTo(ws, { type: 'stats_update', ...this.getStats(caster) });
      if (enemyTarget.hp <= 0) {
        this.enemyDied(enemyTarget);
      } else {
        this.broadcastToMap(caster.map, { type: 'enemy_hit', enemyId: enemyTarget.id, hp: enemyTarget.hp });
      }
    }
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
}