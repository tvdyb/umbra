import React from 'react';

interface Position { id: string; type: 'supply' | 'borrow'; amount: number; collateral?: number; healthFactor?: number; }
interface Props { positions: Position[]; }

const MyPositions: React.FC<Props> = ({ positions }) => (
  <div className="bg-umbra-card border border-umbra-border rounded-lg p-4">
    <h3 className="text-umbra-text font-semibold mb-3 text-sm uppercase tracking-wider">My Positions</h3>
    {positions.length === 0 ? (
      <p className="text-umbra-muted text-xs">No positions</p>
    ) : (
      <div className="space-y-1">
        {positions.map(p => (
          <div key={p.id} className="flex items-center justify-between text-xs py-2 px-2 bg-umbra-bg rounded">
            <span className={`font-semibold ${p.type === 'supply' ? 'text-umbra-green' : 'text-umbra-purple'}`}>
              {p.type.toUpperCase()}
            </span>
            <span className="text-umbra-text font-mono">${p.amount.toLocaleString()}</span>
            {p.healthFactor !== undefined && (
              <span className={`font-mono ${p.healthFactor >= 1.5 ? 'text-umbra-green' : p.healthFactor >= 1 ? 'text-yellow-400' : 'text-umbra-red'}`}>
                HF: {p.healthFactor.toFixed(2)}
              </span>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default MyPositions;
