/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Search, 
  User, 
  History, 
  Bell,
  UtensilsCrossed,
  X,
  ChevronRight,
  LayoutGrid,
  Settings,
  LogIn,
  LogOut,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { Dish, CATEGORIES, DISHES, formatPrice } from './constants';
import AdminPanel from './AdminPanel';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  getDocs, 
  addDoc, 
  setDoc, 
  doc,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';

interface CartItem extends Dish {
  quantity: number;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [gridColumns, setGridColumns] = useState(3);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [lastOrderCount, setLastOrderCount] = useState(0);
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    };
    testConnection();

    // Fetch settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setGridColumns(snapshot.data().gridColumns || 3);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });

    // Fetch categories
    const qCats = query(collection(db, 'categories'), orderBy('order', 'asc'));
    const unsubscribeCats = onSnapshot(qCats, (snapshot) => {
      const catsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as { id: string, name: string, order: number }[];
      
      const cats = catsData.map(c => c.name);
      
      if (cats.length === 0) {
        // Seed categories if empty
        seedInitialData();
      } else {
        setCategories(cats);
        if (!activeCategory && cats.length > 0) {
          setActiveCategory(cats[0]);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'categories');
    });

    // Fetch dishes
    const qDishes = query(collection(db, 'dishes'), orderBy('order', 'asc'));
    const unsubscribeDishes = onSnapshot(qDishes, (snapshot) => {
      const dishesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Dish[];
      setDishes(dishesData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dishes');
    });

    // Listen for new orders (Admin only)
    let unsubscribeOrders = () => {};
    if (user?.email === 'yujianfei2016@gmail.com') {
      const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
        const ordersData = snapshot.docs;
        if (ordersData.length > lastOrderCount && lastOrderCount !== 0) {
          setShowNewOrderAlert(true);
          try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play();
          } catch (e) {}
        }
        setLastOrderCount(ordersData.length);
      });
    }

    return () => {
      unsubscribeSettings();
      unsubscribeCats();
      unsubscribeDishes();
      unsubscribeOrders();
    };
  }, [isAuthReady, user, lastOrderCount]);

  const seedInitialData = async () => {
    if (user?.email !== 'yujianfei2016@gmail.com') return;
    
    try {
      // Seed categories
      for (let i = 0; i < CATEGORIES.length; i++) {
        await addDoc(collection(db, 'categories'), { 
          name: CATEGORIES[i],
          order: i
        });
      }
      // Seed dishes
      for (const dish of DISHES) {
        const { id, ...dishData } = dish;
        await addDoc(collection(db, 'dishes'), dishData);
      }
    } catch (error) {
      console.error('Failed to seed data:', error);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const filteredDishes = useMemo(() => {
    return dishes.filter(dish => {
      if (activeCategory === '店长推荐') {
        return dish.isRecommended && dish.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      const matchesCategory = !activeCategory || dish.category === activeCategory || dish.tags?.includes(activeCategory);
      const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery, dishes]);

  const addToCart = (dish: Dish) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === dish.id);
      if (existing) {
        return prev.map(item => item.id === dish.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...dish, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (existing && existing.quantity > 1) {
        return prev.map(item => item.id === id ? { ...item, quantity: item.quantity - 1 } : item);
      }
      return prev.filter(item => item.id !== id);
    });
  };

  const clearCart = () => {
    setCart([]);
    setSelectedTable(null);
    setIsCartOpen(false);
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleOrderSubmit = async () => {
    if (!selectedTable || cart.length === 0) return;
    
    setIsOrdering(true);
    const orderData = {
      tableNumber: selectedTable.toString(),
      items: cart.map(item => ({
        dishId: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      })),
      totalPrice: totalAmount,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'orders'), orderData);
      setOrderSuccess(true);
      setTimeout(() => {
        setOrderSuccess(false);
        clearCart();
      }, 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    } finally {
      setIsOrdering(false);
    }
  };

  if (isLoading && dishes.length === 0) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f3f4f6]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f3f4f6] text-[#333] font-sans overflow-hidden select-none">
      {/* Sidebar Navigation - 20% width for 11-inch screens */}
      <aside className="w-[20vw] min-w-[10rem] bg-[#374151] border-r border-gray-200 flex flex-col items-center py-8 z-10 shadow-xl">
        <div className="mb-12 flex flex-col items-center">
          {user ? (
            <div className="flex flex-col items-center">
              <img 
                src={user.photoURL || ''} 
                alt={user.displayName || ''} 
                className="w-16 h-16 rounded-full border-2 border-white/20 mb-3"
                referrerPolicy="no-referrer"
              />
              <span className="text-[0.625rem] font-bold text-gray-300 truncate max-w-[15vw]">{user.displayName}</span>
              <button onClick={handleLogout} className="text-[0.625rem] text-gray-500 hover:text-white mt-2">退出登录</button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex flex-col items-center text-gray-400 hover:text-white transition-colors"
            >
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center text-white mb-3">
                <LogIn size={32} />
              </div>
              <span className="text-[0.75rem] font-bold">立即登录</span>
            </button>
          )}
        </div>

        <nav className="flex-1 w-full space-y-4 overflow-y-auto no-scrollbar px-6">
          <button
            onClick={() => setActiveCategory('店长推荐')}
            className={`w-full py-4 px-4 rounded-[1rem] flex items-center justify-center transition-all duration-300 text-center relative ${
              activeCategory === '店长推荐' 
              ? 'bg-[#f5c342] text-black font-black shadow-lg shadow-[#f5c342]/30 scale-105' 
              : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="text-[1rem] font-black tracking-tight">店长推荐</span>
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`w-full py-4 px-4 rounded-[1rem] flex items-center justify-center transition-all duration-300 text-center relative ${
                activeCategory === category 
                ? 'bg-[#f5c342] text-black font-black shadow-lg shadow-[#f5c342]/30 scale-105' 
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-[1rem] font-black tracking-tight">{category}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-8 w-full px-8 pt-8 border-t border-white/10">
          {user?.email === 'yujianfei2016@gmail.com' && (
            <button 
              onClick={() => setIsAdminOpen(true)}
              className="w-full flex flex-col items-center text-gray-400 hover:text-white transition-colors group"
            >
              <Settings size={24} className="group-hover:rotate-90 transition-transform duration-500" />
              <span className="text-[0.75rem] mt-2 font-bold">后台管理</span>
            </button>
          )}
          <button className="w-full flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <History size={24} />
            <span className="text-[0.75rem] mt-2 font-bold">历史订单</span>
          </button>
          <button className="w-full flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <Bell size={24} />
            <span className="text-[0.75rem] mt-2 font-bold">呼叫服务</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area - 80% width */}
      <main 
        className="w-[80vw] flex flex-col relative overflow-hidden"
        style={{
          background: `
            radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.6) 0%, transparent 40%),
            radial-gradient(circle at 80% 90%, rgba(156, 163, 175, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 90% 10%, rgba(209, 213, 219, 0.2) 0%, transparent 40%),
            #f3f4f6
          `
        }}
      >
        {/* Header */}
        <header className="h-20 flex items-center justify-between px-8 z-10">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-white rounded-full px-4 py-2 border border-gray-200 shadow-sm">
              <span className="text-xs text-gray-500 font-medium">11号桌</span>
            </div>
            <div className="text-xs text-gray-400 italic">“环保健康生活方式，从按需适量点餐”</div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-white rounded-full px-4 py-2 border border-gray-200 shadow-sm w-64">
              <Search size={16} className="text-gray-400 mr-2" />
              <input 
                type="text" 
                placeholder="搜索菜品..." 
                className="bg-transparent border-none outline-none text-xs w-full text-gray-700 placeholder-gray-400"
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-gray-200 shadow-sm text-gray-500">
              <LayoutGrid size={18} />
            </button>
          </div>
        </header>

        {/* Dish Grid */}
        <div className="flex-1 overflow-y-auto px-8 pb-24 no-scrollbar">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">
              {activeCategory} <span className="text-sm text-gray-400 font-normal ml-2">(产品以实物为准)</span>
            </h2>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${
            gridColumns === 3 ? 'lg:grid-cols-3' :
            gridColumns === 4 ? 'lg:grid-cols-4' :
            gridColumns === 5 ? 'lg:grid-cols-5' :
            gridColumns === 6 ? 'lg:grid-cols-6' :
            'lg:grid-cols-3'
          }`}>
            <AnimatePresence mode="popLayout">
              {filteredDishes.map(dish => (
                <motion.div
                  key={dish.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-[2rem] overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 border border-gray-100 group relative"
                >
                  <div className="relative h-[25vh] overflow-hidden">
                    <img 
                      src={dish.image} 
                      alt={dish.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-40" />
                    
                    {dish.isRecommended && (
                      <div className="absolute top-4 left-4 bg-red-600 text-white text-[0.625rem] font-bold px-2 py-1 rounded-md shadow-lg z-10">
                        店长推荐
                      </div>
                    )}

                    <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md text-white text-[0.625rem] px-2 py-1 rounded-md border border-white/10">
                      10-15秒
                    </div>
                  </div>
                  
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-gray-800">{dish.name}</h3>
                    </div>
                    <p className="text-xs text-gray-500 mb-4 line-clamp-1">{dish.description}</p>
                    
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-xl font-bold text-red-600">{formatPrice(dish.price)}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        {cart.find(item => item.id === dish.id) && (
                          <span className="text-sm font-bold text-red-600">
                            {cart.find(item => item.id === dish.id)?.quantity}
                          </span>
                        )}
                        <button 
                          onClick={() => addToCart(dish)}
                          className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-200 active:scale-90 transition-all"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom Cart Bar - Enhanced */}
        <div className="absolute bottom-8 right-12 left-[22vw] z-20">
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-[#1f2937]/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] h-[6rem] flex items-center justify-between px-10 shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-center space-x-10">
              <div 
                onClick={() => setIsCartOpen(!isCartOpen)}
                className="relative flex items-center space-x-6 cursor-pointer group"
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-[1rem] bg-[#f5c342] flex items-center justify-center text-black shadow-lg shadow-[#f5c342]/20 group-hover:scale-110 transition-transform duration-300">
                    <ShoppingCart size={32} />
                  </div>
                  {totalItems > 0 && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-3 -right-3 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center text-[0.875rem] font-black border-4 border-[#1f2937] shadow-lg"
                    >
                      {totalItems}
                    </motion.div>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-[0.75rem] text-gray-400 font-black uppercase tracking-widest">应付合计</span>
                  <div className="text-[2rem] font-black text-white tracking-tighter">
                    {formatPrice(totalAmount)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-6">
              {totalItems > 0 && (
                <button 
                  onClick={clearCart}
                  className="p-4 text-gray-500 hover:text-red-500 transition-colors bg-white/5 rounded-[1rem]"
                  title="清空购物车"
                >
                  <Trash2 size={24} />
                </button>
              )}
              <button 
                onClick={handleOrderSubmit}
                disabled={totalItems === 0 || !selectedTable || isOrdering}
                className={`px-12 py-5 rounded-[1.5rem] font-black text-[1.125rem] transition-all flex items-center space-x-3 ${
                  totalItems > 0 && selectedTable
                  ? 'bg-[#e63928] text-white shadow-xl shadow-red-900/40 active:scale-95 hover:bg-red-500' 
                  : 'bg-white/10 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isOrdering ? (
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
                  />
                ) : (
                  <UtensilsCrossed size={24} />
                )}
                <span>{isOrdering ? '提交中...' : '立即下单'}</span>
              </button>
            </div>
          </motion.div>
        </div>

        {/* Cart Drawer Overlay - Enhanced */}
        <AnimatePresence>
          {isCartOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsCartOpen(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] min-w-[31.25rem] h-[85vh] bg-white rounded-[3rem] z-40 flex flex-col shadow-[0_2rem_4rem_rgba(0,0,0,0.4)] border border-gray-100 overflow-hidden"
              >
                <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
                      <ShoppingCart size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-gray-900">我的点餐单</h3>
                      <p className="text-sm text-gray-400 font-medium">共选择了 {totalItems} 件美味菜品</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={clearCart}
                      className="flex items-center space-x-2 px-4 py-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all font-bold text-sm"
                    >
                      <Trash2 size={16} />
                      <span>清空全部</span>
                    </button>
                    <button 
                      onClick={() => setIsCartOpen(false)} 
                      className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
                  {cart.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                      <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mb-6">
                        <ShoppingCart size={48} />
                      </div>
                      <h4 className="text-xl font-bold text-gray-800 mb-2">购物车还是空的</h4>
                      <p className="text-gray-400">快去挑选您心仪的美味吧</p>
                    </div>
                  ) : (
                    <>
                      {/* Table Selection Section */}
                      <section>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-black text-gray-900">选择餐桌号</h4>
                          <span className="text-xs text-red-600 font-bold">* 必选</span>
                        </div>
                        <div className="grid grid-cols-6 gap-3">
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                            <button
                              key={num}
                              onClick={() => setSelectedTable(num)}
                              className={`py-3 rounded-2xl font-black text-lg transition-all border-2 ${
                                selectedTable === num
                                ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200 scale-105'
                                : 'bg-white border-gray-100 text-gray-400 hover:border-red-200 hover:text-red-600'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </section>

                      {/* Grid View for Cart Items */}
                      <section className="flex-1">
                        <h4 className="text-lg font-black text-gray-900 mb-4">已选菜品</h4>
                        <div className="grid grid-cols-2 gap-4">
                          {cart.map(item => (
                            <motion.div 
                              layout
                              key={item.id} 
                              className="flex flex-col bg-white border border-gray-100 p-4 rounded-[2rem] shadow-sm hover:shadow-md transition-all group"
                            >
                              <div className="relative aspect-square mb-4 overflow-hidden rounded-2xl">
                                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                <div className="absolute top-2 right-2 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-black border-2 border-white shadow-lg">
                                  {item.quantity}
                                </div>
                              </div>
                              <div className="flex-1 flex flex-col">
                                <h4 className="font-black text-base text-gray-900 mb-1 line-clamp-1">{item.name}</h4>
                                <div className="text-red-600 text-sm font-black mb-4">{formatPrice(item.price)}</div>
                                
                                <div className="mt-auto flex items-center justify-between bg-gray-50 p-1.5 rounded-2xl">
                                  <button 
                                    onClick={() => removeFromCart(item.id)} 
                                    className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-red-600 hover:border-red-100 transition-all shadow-sm active:scale-90"
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className="font-black text-base text-gray-900">{item.quantity}</span>
                                  <button 
                                    onClick={() => addToCart(item)} 
                                    className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-100 hover:bg-red-500 transition-all active:scale-90"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="p-8 bg-gray-50 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex flex-col">
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">应付总额</span>
                        <span className="text-3xl font-black text-red-600">{formatPrice(totalAmount)}</span>
                      </div>
                      {selectedTable && (
                        <div className="bg-red-50 px-4 py-2 rounded-2xl border border-red-100">
                          <span className="text-red-600 font-black text-lg">{selectedTable} 号桌</span>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={handleOrderSubmit}
                      disabled={!selectedTable || isOrdering}
                      className={`w-full py-5 rounded-[1.5rem] font-black text-xl shadow-xl transition-all active:scale-[0.98] flex items-center justify-center space-x-3 ${
                        selectedTable 
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-200' 
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                      }`}
                    >
                      {isOrdering ? (
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
                        />
                      ) : (
                        <UtensilsCrossed size={24} />
                      )}
                      <span>{isOrdering ? '提交中...' : selectedTable ? `确认下单 (${selectedTable}号桌)` : '请先选择餐桌号'}</span>
                    </button>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </main>

      {/* Admin Panel Overlay */}
      <AnimatePresence>
        {isAdminOpen && (
          <AdminPanel 
            onClose={() => setIsAdminOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Custom Scrollbar Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
      {/* Order Success Overlay */}
      <AnimatePresence>
        {orderSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-red-600 flex flex-col items-center justify-center text-white"
          >
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="w-32 h-32 bg-white rounded-full flex items-center justify-center text-red-600 mb-8 shadow-2xl"
            >
              <CheckCircle2 size={64} />
            </motion.div>
            <h2 className="text-4xl font-black mb-2">下单成功！</h2>
            <p className="text-xl text-white/80 font-bold">餐桌 {selectedTable} 的美味正在准备中</p>
            <div className="mt-12 flex items-center space-x-2 bg-white/10 px-6 py-3 rounded-2xl backdrop-blur-md border border-white/10">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-sm font-bold">已实时通知后厨</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Order Alert (Admin) */}
      <AnimatePresence>
        {showNewOrderAlert && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[200] bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center space-x-4 border-2 border-white/20"
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
              <Bell size={20} />
            </div>
            <div>
              <h4 className="font-black">收到新订单！</h4>
              <p className="text-xs text-white/80">请立即前往后台处理</p>
            </div>
            <button 
              onClick={() => {
                setShowNewOrderAlert(false);
                setIsAdminOpen(true);
              }}
              className="bg-white text-red-600 px-4 py-2 rounded-xl font-black text-xs hover:bg-gray-100 transition-colors"
            >
              立即查看
            </button>
            <button onClick={() => setShowNewOrderAlert(false)} className="text-white/60 hover:text-white">
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
