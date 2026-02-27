import React, { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '../stores/userStore';
import { getPool, getPositions, getOracle } from '../services/umbraApi';
import PoolStats from '../components/PoolStats';
import SupplySection from '../components/SupplySection';
import BorrowSection from '../components/BorrowSection';
import MyPositions from '../components/MyPositions';

const LendPage: React.FC = () => {
  const { user } = useUserStore();
  const trader = user?.name || '';
  const [pool, setPool] = useState<any>({});
  const [positions, setPositions] = useState<any[]>([]);
  const [ccPrice, setCcPrice] = useState(100);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const load = async () => {
      try { setPool(await getPool()); } catch (e) { console.error(e); }
      try { const o = await getOracle(); setCcPrice(o.price || o.ccPrice || 100); } catch (e) { console.error(e); }
      if (trader) {
        try { setPositions(await getPositions(trader)); } catch (e) { console.error(e); }
      }
    };
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [trader, tick]);

  if (!user) return <div className="text-umbra-muted p-8">Please log in to access lending.</div>;

  const supplyPositions = (Array.isArray(positions) ? positions : []).filter((p: any) => p.type === 'supply');

  return (
    <div className="min-h-screen bg-umbra-bg p-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-umbra-text mb-1">
          <span className="text-umbra-purple">Umbra</span> Lending
        </h1>
        <p className="text-umbra-muted text-sm mb-6">Supply & borrow against Canton Network assets</p>
        <div className="space-y-4">
          <PoolStats
            totalSupplied={pool.totalSupplied || 0}
            totalBorrowed={pool.totalBorrowed || 0}
            utilization={pool.utilization || 0}
            supplyApy={pool.supplyApy || 0}
            borrowApy={pool.borrowApy || 0}
            ccPrice={ccPrice}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SupplySection trader={trader} positions={supplyPositions} onAction={refresh} />
            <BorrowSection trader={trader} ccPrice={ccPrice} onAction={refresh} />
          </div>
          <MyPositions positions={Array.isArray(positions) ? positions : []} />
        </div>
      </div>
    </div>
  );
};

export default LendPage;
