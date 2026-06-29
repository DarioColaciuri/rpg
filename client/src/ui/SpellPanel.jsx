import React from 'react';

const SPELLS_BY_CLASS = {
  MAGE: [
    { key: 'hechizo_1', name: 'Proyectil', mana: 5, type: 'damage' },
    { key: 'tormenta', name: 'Tormenta', mana: 15, type: 'aoe' },
  ],
  DRUID: [
    { key: 'hechizo_1', name: 'Proyectil', mana: 5, type: 'damage' },
    { key: 'curar', name: 'Curar', mana: 8, type: 'heal' },
    { key: 'tormenta', name: 'Tormenta', mana: 15, type: 'aoe' },
  ],
  CLERIC: [
    { key: 'curar', name: 'Curar', mana: 8, type: 'heal' },
  ],
  PALADIN: [
    { key: 'curar', name: 'Curar', mana: 8, type: 'heal' },
  ],
};

export default function SpellPanel({ playerClass, selectedSpell, onSelectSpell }) {
  const spells = SPELLS_BY_CLASS[playerClass];

  if (!spells) {
    return (
      <div className="spell-panel">
        <div className="spell-panel-title">Spells</div>
        <div className="spell-empty">No spells available</div>
      </div>
    );
  }

  return (
    <div className="spell-panel">
      <div className="spell-panel-title">Spells</div>
      {spells.map((spell) => {
        const isSelected = selectedSpell === spell.key;
        let cls = 'spell-btn';
        if (isSelected) cls += ' spell-active';
        if (spell.type === 'heal') cls += ' spell-heal-btn';
        return (
          <button
            key={spell.key}
            className={cls}
            onClick={() => onSelectSpell(spell.key)}
            title={`${spell.name} - ${spell.mana} mana`}
          >
            {spell.name} <span className="spell-mana-cost">({spell.mana})</span>
          </button>
        );
      })}
      <div className="spell-info">
        {spells.some(s => s.type === 'heal')
          ? 'Click ally to heal / empty to self-heal'
          : 'Left click to cast on target'}
      </div>
    </div>
  );
}
