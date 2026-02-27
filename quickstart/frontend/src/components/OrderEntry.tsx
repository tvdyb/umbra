import React, { useState } from 'react';
import { placeOrder } from '../services/umbraApi';

interface Props { trader: string; onPlaced: () => void; }

const OrderEntry: React.FC<Props> = ({ trader, onPlaced }) => {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!price || !quantity) return;
    setLoading(true);
    try {
      await placeOrder({ trader, side, price: parseFloat(price), quantity: parseFloat(quantity) });
      setPrice(''); setQuantity('');
      onPlaced();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="bg-umbra-card border border-umbra-border rounded-lg p-4">
      <h3 className="text-umbra-text font-semibold mb-3 text-sm uppercase tracking-wider">Place Order</h3>
      <div className="flex gap-2 mb-3">
        {(['buy', 'sell'] as const).map(s => (
          <button key={s} onClick={() => setSide(s)}
            className={`flex-1 py-2 rounded text-sm font-semibold transition-colors ${
              side === s
                ? s === 'buy' ? 'bg-umbra-green text-white' : 'bg-umbra-red text-white'
                : 'bg-umbra-border text-umbra-muted hover:text-umbra-text'
            }`}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>
      <input type="number" placeholder="Price" value={price} onChange={e => setPrice(e.target.value)}
        className="w-full mb-2 px-3 py-2 bg-umbra-bg border border-umbra-border rounded text-umbra-text text-sm focus:border-umbra-purple focus:outline-none" />
      <input type="number" placeholder="Quantity" value={quantity} onChange={e => setQuantity(e.target.value)}
        className="w-full mb-3 px-3 py-2 bg-umbra-bg border border-umbra-border rounded text-umbra-text text-sm focus:border-umbra-purple focus:outline-none" />
      <button onClick={submit} disabled={loading}
        className={`w-full py-2 rounded font-semibold text-sm transition-colors ${
          side === 'buy' ? 'bg-umbra-green hover:bg-umbra-green/80' : 'bg-umbra-red hover:bg-umbra-red/80'
        } text-white disabled:opacity-50`}>
        {loading ? '...' : `${side.toUpperCase()} CC`}
      </button>
    </div>
  );
};

export default OrderEntry;
