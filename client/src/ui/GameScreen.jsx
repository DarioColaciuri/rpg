import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import GameScene from '../game/GameScene.js';
import { gameSocket } from '../network/websocket.js';
import GameUI from './GameUI.jsx';

export default function GameScreen({ character, session, onLeave }) {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [wsError, setWsError] = useState('');
  const [inventory, setInventory] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    gameSocket.connect(session.access_token);

    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: '#1a1a2e',
      scene: GameScene,
      banner: false,
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 600 }, debug: false },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    gameRef.current = new Phaser.Game(config);

    let checkSceneCount = 0;
    const checkScene = setInterval(() => {
      checkSceneCount++;
      const scene = gameRef.current?.scene.getScene('GameScene');
      if (scene) {
        sceneRef.current = scene;
        scene.setMyId(character.id);
        scene.setOnErrorCallback((err) => {
          setWsError(err);
          setTimeout(() => setWsError(''), 3000);
        });
        clearInterval(checkScene);
      }
      if (checkSceneCount > 50) clearInterval(checkScene);
    }, 100);

    const unsub = gameSocket.onMessage((msg) => {
      sceneRef.current?.handleServerMessage(msg);
      if (msg.type === 'stats_update') {
        setStats(msg);
        if (msg.inventory) setInventory(msg.inventory);
      }
      if (msg.type === 'world_state') {
        if (msg.stats) {
          setStats(msg.stats);
          if (msg.stats.inventory) setInventory(msg.stats.inventory);
        }
      }
      if (msg.type === 'chat_message') {
        setChatMessages((prev) => [...prev, { id: msg.playerId, name: msg.name, text: msg.text }]);
      }
    });

    const handleAuthOk = (msg) => {
      if (msg.type === 'auth_ok') {
        gameSocket.send('enter_world', { characterId: character.id });
        gameSocket.removeListener(handleAuthOk);
      }
      if (msg.type === 'auth_error') {
        setWsError('Authentication failed');
      }
    };
    gameSocket.onMessage(handleAuthOk);

    return () => {
      clearInterval(checkScene);
      unsub();
      gameSocket.removeListener(handleAuthOk);
      gameSocket.disconnect();
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  const handleSendChat = (text) => {
    gameSocket.send('chat', { text });
  };

  const handleSelectSpell = (spell) => {
    gameSocket.selectedSpell = gameSocket.selectedSpell === spell ? null : spell;
  };

  const handleSelectSlot = (slot) => {
    const newSlot = selectedSlot === slot ? null : slot;
    setSelectedSlot(newSlot);
    gameSocket.selectedSlot = newSlot;
  };

  const handleUseSlot = (slot) => {
    gameSocket.send('use_item', { slot });
    setSelectedSlot(null);
    gameSocket.selectedSlot = null;
  };

  return (
    <div className="game-container">
      <div ref={containerRef} className="game-canvas" />
      {wsError && <div className="ws-error">{wsError}</div>}
      <GameUI
        stats={stats}
        character={character}
        chatMessages={chatMessages}
        onSendChat={handleSendChat}
        selectedSpell={gameSocket.selectedSpell}
        onSelectSpell={handleSelectSpell}
        onLeave={onLeave}
        inventory={inventory}
        selectedSlot={selectedSlot}
        onSelectSlot={handleSelectSlot}
        onUseSlot={handleUseSlot}
      />
    </div>
  );
}
