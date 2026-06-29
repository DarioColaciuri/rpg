import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import GameScene from '../game/GameScene.js';
import { gameSocket } from '../network/websocket.js';
import GameUI from './GameUI.jsx';
import ShopPanel from './ShopPanel.jsx';

const ITEM_DEFS = {
  apple: { name: 'Apple' },
  water: { name: 'Water' },
  wooden_sword: { name: 'Wooden Sword' },
  iron_sword: { name: 'Iron Sword' },
  cloth_armor: { name: 'Cloth Armor' },
  leather_armor: { name: 'Leather Armor' },
  wooden_shield: { name: 'Wooden Shield' },
  leather_helm: { name: 'Leather Helm' },
};

export default function GameScreen({ character, session, onLeave }) {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [wsError, setWsError] = useState('');
  const [inventory, setInventory] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [isDead, setIsDead] = useState(false);
  const [dropDialog, setDropDialog] = useState(null);
  const inventoryRef = useRef([]);

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
        arcade: { gravity: { y: 0 }, debug: false },
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
          setChatMessages((prev) => [...prev, { id: 'system', name: 'System', text: err }]);
        });
        scene.setOnOpenShop(() => setShopOpen(true));
        scene.setOnDied(() => setIsDead(true));
        scene.setOnDropRequest(() => {
          if (gameSocket.selectedSlot != null) {
            const item = inventoryRef.current.find(inv => inv.slot === gameSocket.selectedSlot);
            if (item) setDropDialog({ slot: gameSocket.selectedSlot, itemType: item.itemType, maxQty: item.quantity, qty: 1 });
          }
        });
        clearInterval(checkScene);
      }
      if (checkSceneCount > 50) clearInterval(checkScene);
    }, 100);

    const unsub = gameSocket.onMessage((msg) => {
      sceneRef.current?.handleServerMessage(msg);
      if (msg.type === 'stats_update') {
        setStats(msg);
        if (msg.inventory) { setInventory(msg.inventory); inventoryRef.current = msg.inventory; }
      }
      if (msg.type === 'world_state') {
        if (msg.stats) {
          setStats(msg.stats);
          if (msg.stats.inventory) { setInventory(msg.stats.inventory); inventoryRef.current = msg.stats.inventory; }
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

  const handleEquip = (slot) => {
    gameSocket.send('equip_item', { slot });
  };

  const handleUnequip = (equipSlot) => {
    gameSocket.send('unequip_item', { equipSlot });
  };

  const handleSwap = (slotA, slotB) => {
    gameSocket.send('swap_inventory', { slotA, slotB });
  };

  const handleDropFromInventory = (slot) => {
    const item = inventory.find(inv => inv.slot === slot);
    if (item) setDropDialog({ slot, itemType: item.itemType, maxQty: item.quantity, qty: 1 });
  };

  const handleBuy = (itemType, quantity = 1) => {
    gameSocket.send('buy_item', { itemType, quantity });
  };

  const handleSell = (slot, quantity = 1) => {
    gameSocket.send('sell_item', { slot, quantity });
  };

  const handleRevive = () => {
    gameSocket.send('revive');
    setIsDead(false);
  };

  const handleAssignSkill = (skillName) => {
    gameSocket.send('assign_skill', { skillName });
  };

  const handleDropConfirm = (quantity) => {
    if (dropDialog) {
      gameSocket.send('drop_item', { slot: dropDialog.slot, quantity });
      setDropDialog(null);
    }
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
        onEquip={handleEquip}
        onUnequip={handleUnequip}
        onSwap={handleSwap}
        onDropFromInventory={handleDropFromInventory}
        onAssignSkill={handleAssignSkill}
      />
      {shopOpen && (
        <ShopPanel
          inventory={inventory}
          gold={stats?.gold ?? 0}
          onBuy={handleBuy}
          onSell={handleSell}
          onClose={() => setShopOpen(false)}
        />
      )}
      {isDead && (
        <div className="death-overlay">
          <div className="death-box">
            <div className="death-text">Te han matado</div>
            <button className="revive-btn" onClick={handleRevive}>Revivir</button>
          </div>
        </div>
      )}
      {dropDialog && (
        <div className="drop-overlay">
          <div className="drop-box">
            <div className="drop-title">Tirar {ITEM_DEFS[dropDialog.itemType]?.name || dropDialog.itemType}</div>
            <div className="drop-qty-row">
              <button className="shop-qty-btn" disabled={dropDialog.qty <= 1} onClick={() => setDropDialog(p => ({ ...p, qty: p.qty - 1 }))}>-</button>
              <input className="shop-qty-input" type="number" value={dropDialog.qty} min={1} max={dropDialog.maxQty} onChange={e => setDropDialog(p => ({ ...p, qty: Math.max(1, Math.min(p.maxQty, parseInt(e.target.value) || 1)) }))} />
              <button className="shop-qty-btn" disabled={dropDialog.qty >= dropDialog.maxQty} onClick={() => setDropDialog(p => ({ ...p, qty: p.qty + 1 }))}>+</button>
            </div>
            <div className="drop-buttons">
              <button className="drop-confirm-btn" onClick={() => handleDropConfirm(dropDialog.qty)}>Tirar</button>
              <button className="drop-cancel-btn" onClick={() => setDropDialog(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
