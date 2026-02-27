import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface Props { trades: { price: number }[]; }

const PriceChart: React.FC<Props> = ({ trades }) => {
  const data = trades.slice(-50).map((t, i) => ({ i, price: t.price }));
  if (data.length === 0) return (
    <div className="bg-umbra-card border border-umbra-border rounded-lg p-4 h-48 flex items-center justify-center text-umbra-muted text-xs">
      No trade data for chart
    </div>
  );

  return (
    <div className="bg-umbra-card border border-umbra-border rounded-lg p-4">
      <h3 className="text-umbra-text font-semibold mb-3 text-sm uppercase tracking-wider">Price</h3>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <XAxis dataKey="i" hide />
          <YAxis domain={['auto', 'auto']} tick={{ fill: '#94a3b8', fontSize: 10 }} width={50} />
          <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ display: 'none' }} />
          <Line type="monotone" dataKey="price" stroke="#7c3aed" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PriceChart;
