import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Clock, Table, DollarSign, ArrowLeft, ShieldCheck } from 'lucide-react';
import { db } from './firebase';
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
import { formatPrice } from './constants';

interface OrderItem {
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  tableNumber: string;
  totalPrice: number;
  status: string;
  items: OrderItem[];
  createdAt: any;
}

interface StaffPanelProps {
  onClose: () => void;
}

export default function StaffPanel({ onClose }: StaffPanelProps) {
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setPendingOrders(ordersData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAction = async (orderId: string, status: 'confirmed' | 'cancelled') => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (error) {
      console.error('Failed to update order:', error);
      alert('操作失败，请检查网络');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-piad-bg flex flex-col font-sans">
      {/* Header */}
      <header className="bg-piad-card border-b border-piad-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <button onClick={onClose} className="p-2 hover:bg-piad-bg rounded-full transition-colors">
            <ArrowLeft size={20} className="text-piad-subtext" />
          </button>
          <h1 className="text-xl font-black text-piad-text flex items-center">
            <ShieldCheck className="mr-2 text-piad-primary" size={24} />
            店员快速确认
          </h1>
        </div>
        <div className="bg-piad-primary/10 text-piad-primary px-3 py-1 rounded-full text-xs font-black flex items-center">
          <div className="w-1.5 h-1.5 rounded-full bg-piad-primary animate-pulse mr-2" />
          {pendingOrders.length} 个待处理
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-piad-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-piad-subtext font-bold">同步中...</p>
          </div>
        ) : pendingOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-piad-card rounded-full flex items-center justify-center text-piad-subtext/20 mb-6 shadow-piad">
              <Clock size={40} />
            </div>
            <h2 className="text-lg font-bold text-piad-text">暂无待确认订单</h2>
            <p className="text-piad-subtext text-sm">新订单出现时会自动显示在这里</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {pendingOrders.map((order) => (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-piad-card rounded-piad p-6 shadow-piad border border-piad-border flex flex-col space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 bg-piad-primary text-white rounded-piad flex items-center justify-center text-2xl font-black shadow-piad">
                      {order.tableNumber}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-piad-text">{order.tableNumber} 号桌</h3>
                      <p className="text-sm text-piad-subtext font-medium">
                        {order.items.length} 个菜品 · {formatPrice(order.totalPrice)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.65rem] text-piad-subtext font-bold uppercase tracking-wider">等待时长</p>
                    <p className="text-sm font-black text-piad-primary">
                      {order.createdAt ? '刚刚' : '同步中'}
                    </p>
                  </div>
                </div>

                {/* Items Preview */}
                <div className="bg-piad-bg rounded-piad p-4">
                  <div className="flex flex-wrap gap-2">
                    {order.items.map((item, idx) => (
                      <span key={idx} className="bg-piad-card border border-piad-border px-3 py-1 rounded-piad text-sm font-bold text-piad-text">
                        {item.name} <span className="text-piad-primary ml-1">x{item.quantity}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => handleAction(order.id, 'cancelled')}
                    className="flex items-center justify-center space-x-2 py-4 bg-piad-bg text-piad-subtext rounded-piad font-black text-sm hover:bg-piad-border active:scale-95 transition-all"
                  >
                    <XCircle size={18} />
                    <span>拒绝 (异常)</span>
                  </button>
                  <button
                    onClick={() => handleAction(order.id, 'confirmed')}
                    className="flex items-center justify-center space-x-2 py-4 bg-piad-primary text-white rounded-piad font-black text-sm shadow-piad hover:opacity-90 active:scale-95 transition-all"
                  >
                    <CheckCircle2 size={18} />
                    <span>确认接单</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </main>

      {/* Footer Hint */}
      <footer className="p-6 bg-piad-card border-t border-piad-border text-center">
        <p className="text-[0.65rem] text-piad-subtext font-bold uppercase tracking-widest">
          PIAD 点餐中控系统 · 实时同步中
        </p>
      </footer>
    </div>
  );
}
