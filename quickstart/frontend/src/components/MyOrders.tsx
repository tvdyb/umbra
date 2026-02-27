import React from 'react';
import { cancelOrder } from '../services/umbraApi';

interface Order { id: string; side: string; price: number; quantity: number; }
interface Props { orders: Order[]; onCancelled: () => void; }

const MyOrders: React.FC<Props> = ({ orders, onCancelled }) => {
  const cancel = async (id: string) => {
    try { await cancelOrder(id); onCancelled(); } catch (e) { console.error(e); }
  };

  return (
    <div className="bg-umbra-card border border-umbra-border rounded-lg p-4">
      <h3 className="text-umbra-text font-semibold mb-3 text-sm uppercase tracking-wider">My Orders</h3>
      {orders.length === 0 ? (
        <p className="text-umbra-muted text-xs">No active orders</p>
      ) : (
        <div className="space-y-1">
          {orders.map(o => (
            <div key={o.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-umbra-bg">
              <span className={o.side === 'buy' ? 'text-umbra-green' : 'text-umbra-red'}>{o.side.toUpperCase()}</span>
              <span className="text-umbra-text font-mono">{o.price.toFixed(2)}</span>
              <span className="text-umbra-text font-mono">{o.quantity.toFixed(2)}</span>
              <button onClick={() => cancel(o.id)} className="text-umbra-red hover:text-umbra-red/70 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyOrders;
