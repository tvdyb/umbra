import React from 'react';

interface Props {
  totalSupplied: number; totalBorrowed: number; utilization: number;
  supplyApy: number; borrowApy: number; ccPrice: number;
}

const PoolStats: React.FC<Props> = ({ totalSupplied, totalBorrowed, utilization, supplyApy, borrowApy, ccPrice }) => (
  <div className="bg-umbra-card border border-umbra-border rounded-lg p-4">
    <h3 className="text-umbra-text font-semibold mb-4 text-sm uppercase tracking-wider">Pool Overview</h3>
    <div className="grid grid-cols-3 gap-4 mb-4">
      <Stat label="Total Supplied" value={`$${totalSupplied.toLocaleString()}`} />
      <Stat label="Total Borrowed" value={`$${totalBorrowed.toLocaleString()}`} />
      <Stat label="CC Price" value={`$${ccPrice.toFixed(2)}`} color="text-umbra-purple" />
    </div>
    <div className="mb-4">
      <div className="flex justify-between text-xs text-umbra-muted mb-1">
        <span>Utilization</span><span>{(utilization * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-umbra-bg rounded-full overflow-hidden">
        <div className="h-full bg-umbra-purple rounded-full transition-all" style={{ width: `${utilization * 100}%` }} />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <Stat label="Supply APY" value={`${(supplyApy * 100).toFixed(2)}%`} color="text-umbra-green" />
      <Stat label="Borrow APY" value={`${(borrowApy * 100).toFixed(2)}%`} color="text-umbra-red" />
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div>
    <div className="text-umbra-muted text-xs mb-0.5">{label}</div>
    <div className={`text-lg font-semibold font-mono ${color || 'text-umbra-text'}`}>{value}</div>
  </div>
);

export default PoolStats;
