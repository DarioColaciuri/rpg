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

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RPG Server');
});

const wss = new WebSocketServer({ server: httpServer });

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
      const player = gameServer.addPlayer(ws, character,
        hasSavedPos ? character.x : null,
        hasSavedPos ? character.y : null,
        hasSavedPos ? character.map : null
      );
      const playersOnMap = gameServer.getPlayersOnMap(player.map, player.id);

      gameServer.sendTo(ws, {
        type: 'world_state',
        yourId: player.id,
        map: player.map,
        players: playersOnMap,
        stats: gameServer.getStats(player),
      });

      gameServer.broadcastToMap(player.map, {
        type: 'player_joined',
        player: gameServer.playerData(player),
      }, ws);

      console.log(`${player.name} entered the world at ${player.map}(${Math.round(player.px)},${Math.round(player.py)})`);
      return;
    }

    if (msg.type === 'move') {
      gameServer.handleMove(ws, msg.px, msg.py, msg.transitionTo, msg.flipX, msg.animState, msg.isCrouching);
      return;
    }

    if (msg.type === 'attack') {
      gameServer.handleAttack(ws);
      return;
    }

    if (msg.type === 'cast_spell') {
      gameServer.handleCastSpell(ws, msg.targetId);
      return;
    }

    if (msg.type === 'chat') {
      gameServer.handleChat(ws, msg.text);
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
        await supabase.from('characters').update({
          map: player.map,
          x: Math.round(player.px),
          y: Math.round(player.py),
        }).eq('id', player.id);
      } catch (err) {
        console.error('Failed to save position:', err.message);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`RPG Server running on port ${PORT}`);
});
