import React from 'react';

interface Trade { price: number; quantity: number; timestamp?: string; side?: string; }
interface Props { trades: Trade[]; }

const RecentTrades: React.FC<Props> = ({ trades }) => (
  <div className="bg-umbra-card border border-umbra-border rounded-lg p-4">
    <h3 className="text-umbra-text font-semibold mb-3 text-sm uppercase tracking-wider">Recent Trades</h3>
    {trades.length === 0 ? (
      <p className="text-umbra-muted text-xs">No trades yet</p>
    ) : (
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {trades.slice(0, 20).map((t, i) => (
          <div key={i} className="flex justify-between text-xs py-1 px-2">
            <span className="text-umbra-text font-mono">{t.price.toFixed(2)}</span>
            <span className="text-umbra-muted font-mono">{t.quantity.toFixed(2)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default RecentTrades;
