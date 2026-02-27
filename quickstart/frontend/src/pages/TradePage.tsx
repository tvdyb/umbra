import React, { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '../stores/userStore';
import { getOrderbook, getTrades } from '../services/umbraApi';
import Orderbook from '../components/Orderbook';
import OrderEntry from '../components/OrderEntry';
import MyOrders from '../components/MyOrders';
import RecentTrades from '../components/RecentTrades';
import PriceChart from '../components/PriceChart';

const TradePage: React.FC = () => {
  const { user } = useUserStore();
  const trader = user?.name || '';
  const [orderbook, setOrderbook] = useState<any>({ bids: [], asks: [] });
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const load = async () => {
      try {
        const ob = await getOrderbook();
        setOrderbook(ob);
        // Filter user's orders from orderbook if available
        if (ob.orders) setMyOrders(ob.orders.filter((o: any) => o.trader === trader));
        else if (ob.myOrders) setMyOrders(ob.myOrders);
      } catch (e) { console.error(e); }
      if (trader) {
        try { setTrades(await getTrades(trader)); } catch (e) { console.error(e); }
      }
    };
    load();
    const iv = setInterval(load, 2500);
    return () => clearInterval(iv);
  }, [trader, tick]);

  if (!user) return <div className="text-umbra-muted p-8">Please log in to trade.</div>;

  return (
    <div className="min-h-screen bg-umbra-bg p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-umbra-text mb-1">
          <span className="text-umbra-purple">Umbra</span> Dark Pool
        </h1>
        <p className="text-umbra-muted text-sm mb-6">Private orderbook trading on Canton Network</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <PriceChart trades={trades} />
            <Orderbook bids={orderbook.bids || []} asks={orderbook.asks || []} />
          </div>
          <div className="space-y-4">
            <OrderEntry trader={trader} onPlaced={refresh} />
            <MyOrders orders={myOrders} onCancelled={refresh} />
            <RecentTrades trades={trades} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradePage;
