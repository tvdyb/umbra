import React from 'react';

interface Level { price: number; quantity: number; }
interface Props { bids: Level[]; asks: Level[]; }

const Orderbook: React.FC<Props> = ({ bids, asks }) => {
  const maxQty = Math.max(...[...bids, ...asks].map(l => l.quantity), 1);
  return (
    <div className="bg-umbra-card border border-umbra-border rounded-lg p-4">
      <h3 className="text-umbra-text font-semibold mb-3 text-sm uppercase tracking-wider">Orderbook</h3>
      <div className="grid grid-cols-2 gap-2 text-xs text-umbra-muted mb-1">
        <div className="grid grid-cols-2"><span>Price</span><span className="text-right">Qty</span></div>
        <div className="grid grid-cols-2"><span>Price</span><span className="text-right">Qty</span></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {/* Bids */}
        <div className="space-y-0.5">
          {bids.slice(0, 12).map((l, i) => (
            <div key={i} className="relative grid grid-cols-2 text-xs py-0.5 px-1">
              <div className="absolute inset-0 bg-umbra-green/10 rounded" style={{ width: `${(l.quantity / maxQty) * 100}%` }} />
              <span className="relative text-umbra-green font-mono">{l.price.toFixed(2)}</span>
              <span className="relative text-right text-umbra-text font-mono">{l.quantity.toFixed(2)}</span>
            </div>
          ))}
        </div>
        {/* Asks */}
        <div className="space-y-0.5">
          {asks.slice(0, 12).map((l, i) => (
            <div key={i} className="relative grid grid-cols-2 text-xs py-0.5 px-1">
              <div className="absolute inset-0 bg-umbra-red/10 rounded" style={{ width: `${(l.quantity / maxQty) * 100}%` }} />
              <span className="relative text-umbra-red font-mono">{l.price.toFixed(2)}</span>
              <span className="relative text-right text-umbra-text font-mono">{l.quantity.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Orderbook;
