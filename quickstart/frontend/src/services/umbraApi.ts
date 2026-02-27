import axios from 'axios';

const umbra = axios.create({ baseURL: '/api' });

// Orderbook
export const getOrderbook = () => umbra.get('/orderbook').then(r => r.data);
export const placeOrder = (order: { trader: string; side: 'buy' | 'sell'; price: number; quantity: number }) =>
  umbra.post('/orders', order).then(r => r.data);
export const cancelOrder = (id: string) => umbra.delete(`/orders/${id}`).then(r => r.data);

// Trades
export const getTrades = (trader: string) => umbra.get(`/trades/${trader}`).then(r => r.data);

// Pool
export const getPool = () => umbra.get('/pool').then(r => r.data);
export const supply = (data: { trader: string; amount: number }) => umbra.post('/pool/supply', data).then(r => r.data);
export const borrow = (data: { trader: string; collateral: number; amount: number }) => umbra.post('/pool/borrow', data).then(r => r.data);
export const repay = (data: { trader: string; positionId: string; amount: number }) => umbra.post('/pool/repay', data).then(r => r.data);

// Positions
export const getPositions = (trader: string) => umbra.get(`/positions/${trader}`).then(r => r.data);

// Oracle
export const getOracle = () => umbra.get('/oracle').then(r => r.data);
