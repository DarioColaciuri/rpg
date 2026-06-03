import React, { useState } from 'react';

const ITEM_DEFS = {
  apple: { name: 'Apple', color: '#cc4444' },
  water: { name: 'Water', color: '#4444cc' },
};

const SHOP_ITEMS = [
  { type: 'apple', name: 'Apple', price: 10, color: '#cc4444' },
  { type: 'water', name: 'Water', price: 10, color: '#4444cc' },
];

export default function ShopPanel({ inventory, gold, onBuy, onSell, onClose }) {
  const [selectedInv, setSelectedInv] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);
  const [buyQty, setBuyQty] = useState(1);
  const [sellQty, setSellQty] = useState(1);

  const items = Array.from({ length: 12 }, (_, i) => {
    const item = inventory?.find(inv => inv.slot === i);
    return { slot: i, item };
  }).filter(s => s.item);

  const selectedInvItem = items.find(s => s.slot === selectedInv);
  const maxSellQty = selectedInvItem?.item?.quantity || 0;

  return (
    <div className="shop-overlay">
      <div className="shop-panel">
        <div className="shop-header">
          <span className="shop-title">Shop - Merchant</span>
          <span className="shop-gold">
            <span className="stats-gold-icon" />
            {gold ?? 0}
          </span>
          <button className="shop-close-btn" onClick={onClose}>X</button>
        </div>

        <div className="shop-body">
          <div className="shop-column">
            <div className="shop-col-title">Your Items</div>
            <div className="shop-item-list">
              {items.length === 0 && <div className="shop-empty">No items to sell</div>}
              {items.map(({ slot, item }) => (
                <div
                  key={slot}
                  className={`shop-item ${selectedInv === slot ? 'shop-item-selected' : ''}`}
                  onClick={() => { if (selectedInv !== slot) { setSelectedInv(slot); setSellQty(1); } else setSelectedInv(null); }}
                >
                  <div className="shop-item-icon" style={{ backgroundColor: ITEM_DEFS[item.itemType]?.color || '#888' }} />
                  <span className="shop-item-name">{ITEM_DEFS[item.itemType]?.name || item.itemType}</span>
                  <span className="shop-item-qty">x{item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="shop-qty-row">
              <button className="shop-qty-btn" disabled={!selectedInv || sellQty <= 1} onClick={() => setSellQty(q => Math.max(1, q - 1))}>-</button>
              <input className="shop-qty-input" type="number" value={sellQty} min={1} max={maxSellQty} onChange={e => setSellQty(Math.max(1, parseInt(e.target.value) || 1))} disabled={!selectedInv} />
              <button className="shop-qty-btn" disabled={!selectedInv || sellQty >= maxSellQty} onClick={() => setSellQty(q => Math.min(maxSellQty, q + 1))}>+</button>
            </div>
            <button
              className="shop-action-btn sell-btn"
              disabled={selectedInv === null}
              onClick={() => { if (selectedInv !== null) { onSell(selectedInv, sellQty); setSelectedInv(null); setSellQty(1); } }}
            >
              Sell ({sellQty * 5}g)
            </button>
          </div>

          <div className="shop-divider" />

          <div className="shop-column">
            <div className="shop-col-title">Shop</div>
            <div className="shop-item-list">
              {SHOP_ITEMS.map((si) => (
                <div
                  key={si.type}
                  className={`shop-item ${selectedShop === si.type ? 'shop-item-selected' : ''}`}
                  onClick={() => { if (selectedShop !== si.type) { setSelectedShop(si.type); setBuyQty(1); } else setSelectedShop(null); }}
                >
                  <div className="shop-item-icon" style={{ backgroundColor: si.color }} />
                  <span className="shop-item-name">{si.name}</span>
                  <span className="shop-item-price">{si.price}g</span>
                </div>
              ))}
            </div>
            <div className="shop-qty-row">
              <button className="shop-qty-btn" disabled={!selectedShop || buyQty <= 1} onClick={() => setBuyQty(q => Math.max(1, q - 1))}>-</button>
              <input className="shop-qty-input" type="number" value={buyQty} min={1} onChange={e => setBuyQty(Math.max(1, parseInt(e.target.value) || 1))} disabled={!selectedShop} />
              <button className="shop-qty-btn" disabled={!selectedShop} onClick={() => setBuyQty(q => q + 1)}>+</button>
            </div>
            <button
              className="shop-action-btn buy-btn"
              disabled={selectedShop === null}
              onClick={() => { if (selectedShop !== null) { onBuy(selectedShop, buyQty); setSelectedShop(null); setBuyQty(1); } }}
            >
              Buy ({buyQty * 10}g)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
