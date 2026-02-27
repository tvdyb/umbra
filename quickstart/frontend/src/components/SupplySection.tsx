import React, { useState } from 'react';
import { supply } from '../services/umbraApi';

interface Position { id: string; amount: number; }
interface Props { trader: string; positions: Position[]; onAction: () => void; }

const SupplySection: React.FC<Props> = ({ trader, positions, onAction }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const doSupply = async () => {
    if (!amount) return;
    setLoading(true);
    try { await supply({ trader, amount: parseFloat(amount) }); setAmount(''); onAction(); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="bg-umbra-card border border-umbra-border rounded-lg p-4">
      <h3 className="text-umbra-text font-semibold mb-3 text-sm uppercase tracking-wider">Supply USDCx</h3>
      <div className="flex gap-2 mb-3">
        <input type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)}
          className="flex-1 px-3 py-2 bg-umbra-bg border border-umbra-border rounded text-umbra-text text-sm focus:border-umbra-purple focus:outline-none" />
        <button onClick={doSupply} disabled={loading}
          className="px-4 py-2 bg-umbra-green hover:bg-umbra-green/80 text-white rounded text-sm font-semibold disabled:opacity-50">
          {loading ? '...' : 'Supply'}
        </button>
      </div>
      {positions.length > 0 && (
        <div className="space-y-1">
          {positions.map(p => (
            <div key={p.id} className="flex justify-between items-center text-xs py-1.5 px-2 bg-umbra-bg rounded">
              <span className="text-umbra-text font-mono">${p.amount.toLocaleString()}</span>
              <span className="text-umbra-green text-xs">Active</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupplySection;
