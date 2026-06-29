import React, { useRef, useCallback, useState } from 'react';

const ITEM_DEFS = {
  apple: { name: 'Apple', color: '#cc4444' },
  water: { name: 'Water', color: '#4444cc' },
  wooden_sword: { name: 'Wooden Sword', color: '#aa8844', equipSlot: 'weapon' },
  iron_sword: { name: 'Iron Sword', color: '#8899aa', equipSlot: 'weapon' },
  cloth_armor: { name: 'Cloth Armor', color: '#88aa88', equipSlot: 'clothing' },
  leather_armor: { name: 'Leather Armor', color: '#aa8866', equipSlot: 'clothing' },
  wooden_shield: { name: 'Wooden Shield', color: '#aa8844', equipSlot: 'shield' },
  leather_helm: { name: 'Leather Helm', color: '#aa8866', equipSlot: 'helmet' },
};

const TOTAL_SLOTS = 16;
const DBL_CLICK_MS = 300;

export default function InventoryPanel({ inventory, selectedSlot, onSelectSlot, onUseSlot, onEquip, onUnequip, onSwap, onDropFromInventory }) {
  const lastClick = useRef({ slot: -1, time: 0 });
  const [dragSlot, setDragSlot] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const dropHandled = useRef(false);
  const panelRef = useRef(null);

  const handleInventoryClick = useCallback((slot) => {
    const now = Date.now();
    if (lastClick.current.slot === slot && now - lastClick.current.time < DBL_CLICK_MS) {
      lastClick.current = { slot: -1, time: 0 };
      const item = inventory?.find(inv => inv.slot === slot);
      if (!item) return;
      if (item.equipped) {
        onUnequip(item.equipped);
      } else if (ITEM_DEFS[item.itemType]?.equipSlot) {
        onEquip(slot);
      } else {
        onUseSlot(slot);
      }
    } else {
      lastClick.current = { slot, time: now };
      onSelectSlot(slot);
    }
  }, [inventory, onSelectSlot, onUseSlot, onEquip, onUnequip]);

  const handleDragStart = useCallback((e, slot) => {
    const item = inventory?.find(inv => inv.slot === slot);
    if (!item) { e.preventDefault(); return; }
    setDragSlot(slot);
    dropHandled.current = false;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(slot));
  }, [inventory]);

  const handleDragOver = useCallback((e, slot) => {
    e.preventDefault();
    if (dragSlot !== null && dragSlot !== slot) {
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(slot);
    }
  }, [dragSlot]);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e, targetSlot) => {
    e.preventDefault();
    e.stopPropagation();
    dropHandled.current = true;
    setDropTarget(null);
    if (dragSlot === null || dragSlot === targetSlot) { setDragSlot(null); return; }
    onSwap(dragSlot, targetSlot);
    setDragSlot(null);
  }, [dragSlot, onSwap]);

  const handleDragEnd = useCallback(() => {
    if (dragSlot !== null && !dropHandled.current) {
      onDropFromInventory(dragSlot);
    }
    dropHandled.current = false;
    setDragSlot(null);
    setDropTarget(null);
  }, [dragSlot, onDropFromInventory]);

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
    const item = inventory?.find(inv => inv.slot === i);
    return { slot: i, item };
  });

  return (
    <div
      className="inventory-panel"
      ref={panelRef}
    >
      <div className="inventory-title">Inventory</div>
      <div className="inventory-slots">
        {slots.map(({ slot, item }) => {
          let cls = 'inv-slot';
          if (selectedSlot === slot) cls += ' inv-slot-selected';
          if (item) cls += ' inv-slot-filled';
          if (item?.equipped) cls += ' inv-slot-equipped';
          if (dragSlot === slot) cls += ' inv-slot-dragging';
          if (dropTarget === slot) cls += ' inv-slot-droppable';

          return (
            <div
              key={slot}
              className={cls}
              onClick={() => handleInventoryClick(slot)}
              draggable={!!item}
              onDragStart={(e) => handleDragStart(e, slot)}
              onDragOver={(e) => handleDragOver(e, slot)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, slot)}
              onDragEnd={handleDragEnd}
              title={item ? `${ITEM_DEFS[item.itemType]?.name || item.itemType}${item.equipped ? ' (Equipped)' : ''}${item.quantity > 1 ? ` x${item.quantity}` : ''}` : `Slot ${slot + 1}`}
            >
              {item && (
                <>
                  <div
                    className="inv-item-icon"
                    style={{ backgroundColor: ITEM_DEFS[item.itemType]?.color || '#888' }}
                  />
                  {item.equipped && <span className="inv-equipped-badge">E</span>}
                  {item.quantity > 1 && <span className="inv-item-qty">{item.quantity}</span>}
                  <span className="inv-slot-key">{slot === 9 ? 0 : slot + 1}</span>
                </>
              )}
              {!item && <span className="inv-slot-key">{slot === 9 ? 0 : slot + 1}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
