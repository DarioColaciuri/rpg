import React from 'react';

const SPELLCASTER_CLASSES = ['MAGE', 'DRUID', 'CLERIC', 'PALADIN'];

export default function SpellPanel({ playerClass, selectedSpell, onSelectSpell }) {
  const isSpellcaster = SPELLCASTER_CLASSES.includes(playerClass);

  if (!isSpellcaster) {
    return (
      <div className="spell-panel">
        <div className="spell-panel-title">Spells</div>
        <div className="spell-empty">No spells available</div>
      </div>
    );
  }

  const isSelected = selectedSpell === 'hechizo_1';

  return (
    <div className="spell-panel">
      <div className="spell-panel-title">Spells</div>
      <button
        className={`spell-btn ${isSelected ? 'spell-active' : ''}`}
        onClick={() => onSelectSpell('hechizo_1')}
      >
        Hechizo 1
      </button>
      <div className="spell-info">Left click to cast on target</div>
    </div>
  );
}
