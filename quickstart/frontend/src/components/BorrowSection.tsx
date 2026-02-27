import React, { useState } from 'react';
import { borrow } from '../services/umbraApi';

interface Props { trader: string; ccPrice: number; onAction: () => void; }

const BorrowSection: React.FC<Props> = ({ trader, ccPrice, onAction }) => {
  const [collateral, setCollateral] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const collateralVal = parseFloat(collateral) || 0;
  const borrowVal = parseFloat(amount) || 0;
  const maxBorrow = collateralVal * ccPrice * 0.667; // 150% collateralization
  const healthFactor = borrowVal > 0 ? (collateralVal * ccPrice) / (borrowVal * 1.5) : Infinity;

  const doBorrow = async () => {
    if (!collateral || !amount) return;
    setLoading(true);
    try { await borrow({ trader, collateral: collateralVal, amount: borrowVal }); setCollateral(''); setAmount(''); onAction(); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="bg-umbra-card border border-umbra-border rounded-lg p-4">
      <h3 className="text-umbra-text font-semibold mb-3 text-sm uppercase tracking-wider">Borrow USDCx</h3>
      <input type="number" placeholder="CC Collateral" value={collateral} onChange={e => setCollateral(e.target.value)}
        className="w-full mb-2 px-3 py-2 bg-umbra-bg border border-umbra-border rounded text-umbra-text text-sm focus:border-umbra-purple focus:outline-none" />
      <input type="number" placeholder="USDCx Amount" value={amount} onChange={e => setAmount(e.target.value)}
        className="w-full mb-2 px-3 py-2 bg-umbra-bg border border-umbra-border rounded text-umbra-text text-sm focus:border-umbra-purple focus:outline-none" />
      <div className="flex justify-between text-xs text-umbra-muted mb-1">
        <span>Max borrowable</span><span className="font-mono">${maxBorrow.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-xs mb-3">
        <span className="text-umbra-muted">Health Factor</span>
        <span className={`font-mono font-semibold ${healthFactor >= 1.5 ? 'text-umbra-green' : healthFactor >= 1 ? 'text-yellow-400' : 'text-umbra-red'}`}>
          {healthFactor === Infinity ? '∞' : healthFactor.toFixed(2)}
        </span>
      </div>
      <button onClick={doBorrow} disabled={loading}
        className="w-full py-2 bg-umbra-purple hover:bg-umbra-purple/80 text-white rounded text-sm font-semibold disabled:opacity-50">
        {loading ? '...' : 'Borrow'}
      </button>
    </div>
  );
};

export default BorrowSection;
