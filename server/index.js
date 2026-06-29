import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { GameServer } from './gameServer.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const gameServer = new GameServer();

const pendingSaves = new Set();

function trackSave(promise) {
  const p = Promise.resolve(promise).catch(() => {});
  pendingSaves.add(p);
  p.finally(() => pendingSaves.delete(p));
  return promise;
}

function buildCharUpdate(player) {
  return {
    map: player.map,
    x: Math.round(player.px),
    y: Math.round(player.py),
    hp: player.hp,
    max_hp: player.maxHp,
    mana: player.mana,
    max_mana: player.maxMana,
    stamina: player.stamina,
    max_stamina: player.maxStamina,
    food: player.food,
    drink: player.drink,
    gold: player.gold ?? 0,
    level: player.level ?? 1,
    xp: player.xp ?? 0,
    inventory: player.inventory || [],
    equipment: player.equipment || { weapon: null, clothing: null, helmet: null, shield: null },
    skills: player.skills || null,
    skill_points: player.skillPoints ?? 0,
  };
}

async function saveChar(supabase, player) {
  try {
    await trackSave(supabase.from('characters')
      .update(buildCharUpdate(player))
      .eq('id', player.id));
  } catch (err) {
    console.error('Failed to save character:', err.message);
  }
}

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RPG Server');
});

const wss = new WebSocketServer({ server: httpServer });

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Run: taskkill /F /IM node.exe and retry.`);
    process.exit(1);
  }
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Run: taskkill /F /IM node.exe and retry.`);
    process.exit(1);
  }
});

wss.on('connection', (ws) => {
  console.log('New connection');
  let authenticated = false;
  let userId = null;

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'auth') {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(msg.token);
        if (error || !user) {
          gameServer.sendTo(ws, { type: 'auth_error', reason: 'Invalid token' });
          return;
        }
        authenticated = true;
        userId = user.id;
        gameServer.sendTo(ws, { type: 'auth_ok', userId: user.id });
        console.log('Authenticated:', user.email);
      } catch (err) {
        gameServer.sendTo(ws, { type: 'auth_error', reason: 'Auth failed' });
      }
      return;
    }

    if (!authenticated) {
      gameServer.sendTo(ws, { type: 'auth_error', reason: 'Not authenticated' });
      return;
    }

    if (msg.type === 'enter_world') {
      const { data: character, error } = await supabase
        .from('characters')
        .select('*')
        .eq('id', msg.characterId)
        .single();

      if (error || !character) {
        gameServer.sendTo(ws, { type: 'error', msg: 'Character not found' });
        return;
      }

      if (character.user_id !== userId) {
        gameServer.sendTo(ws, { type: 'error', msg: 'Not your character' });
        return;
      }

      const hasSavedPos = character.x != null && character.y != null && character.map;

      const inventory = (character.inventory && Array.isArray(character.inventory))
        ? character.inventory : [];

      const player = gameServer.addPlayer(ws, character,
        hasSavedPos ? character.x : null,
        hasSavedPos ? character.y : null,
        hasSavedPos ? character.map : null,
        inventory
      );
      const playersOnMap = gameServer.getPlayersOnMap(player.map, player.id);

      gameServer.sendTo(ws, {
        type: 'world_state',
        yourId: player.id,
        map: player.map,
        players: playersOnMap,
        stats: gameServer.getStats(player),
        groundItems: gameServer.getGroundItemsOnMap(player.map),
        npcs: gameServer.getNpcsOnMap(player.map),
        enemies: gameServer.getEnemiesOnMap(player.map),
      });

      gameServer.broadcastToMap(player.map, {
        type: 'player_joined',
        player: gameServer.playerData(player),
      }, ws);

      console.log(`${player.name} entered the world at ${player.map}(${Math.round(player.px)},${Math.round(player.py)})`);
      return;
    }

    if (msg.type === 'move') {
      gameServer.handleMove(ws, msg.px, msg.py, msg.transitionTo, msg.direction, msg.animState, msg.isCrouching);
      return;
    }

    if (msg.type === 'attack') {
      gameServer.handleAttack(ws);
      return;
    }

    if (msg.type === 'run') {
      gameServer.handleRun(ws);
      return;
    }

    if (msg.type === 'meditate_start') {
      gameServer.handleMeditateStart(ws);
      return;
    }

    if (msg.type === 'meditate_stop') {
      gameServer.handleMeditateStop(ws);
      return;
    }

    if (msg.type === 'revive') {
      gameServer.handleRevive(ws);
      const pId = gameServer.wsToPlayer.get(ws);
      if (pId) {
        const player = gameServer.players.get(pId);
        if (player) await saveChar(supabase, player);
      }
      return;
    }

    if (msg.type === 'cast_spell') {
      gameServer.handleCastSpell(ws, msg.targetId, msg.spellKey);
      return;
    }

    if (msg.type === 'chat') {
      gameServer.handleChat(ws, msg.text);
      return;
    }

    if (msg.type === 'pickup_item') {
      const result = gameServer.handlePickupItem(ws, msg.groundItemId);
      if (result?.inventoryChanged || result?.goldChanged) {
        const pId = gameServer.wsToPlayer.get(ws);
        if (pId) {
          const player = gameServer.players.get(pId);
          if (player) await saveChar(supabase, player);
        }
      }
      return;
    }

    if (msg.type === 'drop_item') {
      const result = gameServer.handleDropItem(ws, msg.slot, msg.quantity ?? 1);
      if (result?.inventoryChanged) {
        const pId = gameServer.wsToPlayer.get(ws);
        if (pId) {
          const player = gameServer.players.get(pId);
          if (player) await saveChar(supabase, player);
        }
      }
      return;
    }

    if (msg.type === 'use_item') {
      const result = gameServer.handleUseItem(ws, msg.slot);
      if (result?.inventoryChanged || result?.statsChanged) {
        const pId = gameServer.wsToPlayer.get(ws);
        if (pId) {
          const player = gameServer.players.get(pId);
          if (player) await saveChar(supabase, player);
        }
      }
      return;
    }

    if (msg.type === 'buy_item') {
      const result = gameServer.handleBuyItem(ws, msg.itemType, msg.quantity ?? 1);
      if (result?.inventoryChanged || result?.statsChanged) {
        const pId = gameServer.wsToPlayer.get(ws);
        if (pId) {
          const player = gameServer.players.get(pId);
          if (player) await saveChar(supabase, player);
        }
      }
      return;
    }

    if (msg.type === 'sell_item') {
      const result = gameServer.handleSellItem(ws, msg.slot, msg.quantity ?? 1);
      if (result?.inventoryChanged || result?.statsChanged) {
        const pId = gameServer.wsToPlayer.get(ws);
        if (pId) {
          const player = gameServer.players.get(pId);
          if (player) await saveChar(supabase, player);
        }
      }
      return;
    }

    if (msg.type === 'assign_skill') {
      gameServer.handleAssignSkill(ws, msg.skillName);
      const pId = gameServer.wsToPlayer.get(ws);
      if (pId) {
        const player = gameServer.players.get(pId);
        if (player) await saveChar(supabase, player);
      }
      return;
    }

    if (msg.type === 'equip_item') {
      gameServer.handleEquipItem(ws, msg.slot);
      const pId = gameServer.wsToPlayer.get(ws);
      if (pId) {
        const player = gameServer.players.get(pId);
        if (player) await saveChar(supabase, player);
      }
      return;
    }

    if (msg.type === 'unequip_item') {
      gameServer.handleUnequipItem(ws, msg.equipSlot);
      const pId = gameServer.wsToPlayer.get(ws);
      if (pId) {
        const player = gameServer.players.get(pId);
        if (player) await saveChar(supabase, player);
      }
      return;
    }

    if (msg.type === 'swap_inventory') {
      gameServer.handleSwapInventory(ws, msg.slotA, msg.slotB);
      const pId = gameServer.wsToPlayer.get(ws);
      if (pId) {
        const player = gameServer.players.get(pId);
        if (player) await saveChar(supabase, player);
      }
      return;
    }
  });

  ws.on('close', async () => {
    const player = gameServer.removePlayer(ws);
    if (player) {
      gameServer.broadcastToMap(player.map, {
        type: 'player_left',
        id: player.id,
      });
      console.log(`${player.name} left the world`);

      try {
        const updateData = buildCharUpdate(player);
        if (player.dead) {
          updateData.map = 'city';
          updateData.hp = player.maxHp;
          const spawn = gameServer.findSpawn('city');
          updateData.x = Math.round(spawn.px);
          updateData.y = Math.round(spawn.py);
        }
        await trackSave(supabase.from('characters').update(updateData).eq('id', player.id));
      } catch (err) {
        console.error('Failed to save data:', err.message);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`RPG Server running on port ${PORT}`);
});

async function shutdown() {
  console.log('\nShutting down...');
  await new Promise((resolve) => {
    wss.close(resolve);
  });
  if (pendingSaves.size > 0) {
    console.log(`Waiting for ${pendingSaves.size} pending save(s)...`);
    await Promise.race([
      Promise.allSettled([...pendingSaves]),
      new Promise(r => setTimeout(r, 5000)),
    ]);
  }
  await new Promise((resolve) => httpServer.close(resolve));
  console.log('Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
