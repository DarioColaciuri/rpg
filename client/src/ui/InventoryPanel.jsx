import React, { useRef, useCallback } from 'react';

const ITEM_DEFS = {
  apple: { name: 'Apple', color: '#cc4444' },
  water: { name: 'Water', color: '#4444cc' },
};

const TOTAL_SLOTS = 12;
const DBL_CLICK_MS = 300;

export default function InventoryPanel({ inventory, selectedSlot, onSelectSlot, onUseSlot }) {
  const lastClick = useRef({ slot: -1, time: 0 });

  const handleClick = useCallback((slot) => {
    const now = Date.now();
    if (lastClick.current.slot === slot && now - lastClick.current.time < DBL_CLICK_MS) {
      lastClick.current = { slot: -1, time: 0 };
      onUseSlot(slot);
    } else {
      lastClick.current = { slot, time: now };
      onSelectSlot(slot);
    }
  }, [onSelectSlot, onUseSlot]);

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
    const item = inventory?.find(inv => inv.slot === i);
    return { slot: i, item };
  });

  return (
    <div className="inventory-panel">
      <div className="inventory-title">Inventory</div>
      <div className="inventory-slots">
        {slots.map(({ slot, item }) => (
          <div
            key={slot}
            className={`inv-slot ${selectedSlot === slot ? 'inv-slot-selected' : ''} ${item ? 'inv-slot-filled' : ''}`}
            onClick={() => handleClick(slot)}
            title={item ? `${ITEM_DEFS[item.itemType]?.name || item.itemType}${item.quantity > 1 ? ` x${item.quantity}` : ''}` : `Slot ${slot + 1}`}
          >
            {item && (
              <>
                <div
                  className="inv-item-icon"
                  style={{ backgroundColor: ITEM_DEFS[item.itemType]?.color || '#888' }}
                />
                {item.quantity > 1 && <span className="inv-item-qty">{item.quantity}</span>}
                <span className="inv-slot-key">{slot === 9 ? 0 : slot + 1}</span>
              </>
            )}
            {!item && <span className="inv-slot-key">{slot === 9 ? 0 : slot + 1}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
