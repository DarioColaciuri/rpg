import React from 'react';

export default function InventoryPanel() {
  return (
    <div className="inventory-panel">
      <div className="inventory-title">Inventory</div>
      <div className="inventory-slots">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="inv-slot" />
        ))}
      </div>
    </div>
  );
}
