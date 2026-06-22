import React from 'react';
import StatsBars from './StatsBars.jsx';
import ChatBox from './ChatBox.jsx';
import SpellPanel from './SpellPanel.jsx';
import InventoryPanel from './InventoryPanel.jsx';

export default function GameUI({
  stats,
  character,
  chatMessages,
  onSendChat,
  selectedSpell,
  onSelectSpell,
  onLeave,
  inventory,
  selectedSlot,
  onSelectSlot,
  onUseSlot,
}) {
  return (
    <div className="game-ui-overlay">
      <div className="game-ui-top-left">
        <StatsBars stats={stats} />
        <button className="leave-btn" onClick={onLeave}>Leave Game</button>
      </div>
      <div className="game-ui-bottom-left">
        <ChatBox messages={chatMessages} onSend={onSendChat} />
      </div>
      <div className="game-ui-bottom-right">
        <SpellPanel
          playerClass={character?.class}
          selectedSpell={selectedSpell}
          onSelectSpell={onSelectSpell}
        />
      </div>
      <div className="game-ui-right">
        <InventoryPanel
          inventory={inventory}
          selectedSlot={selectedSlot}
          onSelectSlot={onSelectSlot}
          onUseSlot={onUseSlot}
        />
      </div>
    </div>
  );
}
