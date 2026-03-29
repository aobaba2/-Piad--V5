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
  Trash2
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
    const unsubscribeDishes = onSnapshot(collection(db, 'dishes'), (snapshot) => {
      const dishesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Dish[];
      setDishes(dishesData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dishes');
    });

    return () => {
      unsubscribeCats();
      unsubscribeDishes();
    };
  }, [isAuthReady]);

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
      {/* Sidebar Navigation - Updated to dark gray strip style */}
      <aside className="w-32 bg-[#374151] border-r border-gray-200 flex flex-col items-center py-6 z-10 shadow-xl">
        <div className="mb-10 flex flex-col items-center">
          {user ? (
            <div className="flex flex-col items-center">
              <img 
                src={user.photoURL || ''} 
                alt={user.displayName || ''} 
                className="w-12 h-12 rounded-full border-2 border-white/20 mb-2"
                referrerPolicy="no-referrer"
              />
              <span className="text-[10px] font-medium text-gray-300 truncate max-w-[80px]">{user.displayName}</span>
              <button onClick={handleLogout} className="text-[8px] text-gray-500 hover:text-white mt-1">退出</button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex flex-col items-center text-gray-400 hover:text-white transition-colors"
            >
              <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white mb-2">
                <LogIn size={24} />
              </div>
              <span className="text-[10px] font-medium">登录</span>
            </button>
          )}
        </div>

        <nav className="flex-1 w-full space-y-3 overflow-y-auto no-scrollbar px-3">
          <button
            onClick={() => setActiveCategory('店长推荐')}
            className={`w-full py-3 px-2 rounded-lg flex items-center justify-center transition-all duration-200 text-center relative ${
              activeCategory === '店长推荐' 
              ? 'bg-[#f5c342] text-black font-bold shadow-lg shadow-[#f5c342]/30' 
              : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="text-sm leading-tight">店长推荐</span>
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`w-full py-3 px-2 rounded-lg flex items-center justify-center transition-all duration-200 text-center relative ${
                activeCategory === category 
                ? 'bg-[#f5c342] text-black font-bold shadow-lg shadow-[#f5c342]/30' 
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-sm leading-tight">{category}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-6 w-full px-4 pt-6 border-t border-white/10">
          {user?.email === 'yujianfei2016@gmail.com' && (
            <button 
              onClick={() => setIsAdminOpen(true)}
              className="w-full flex flex-col items-center text-gray-400 hover:text-white transition-colors"
            >
              <Settings size={20} />
              <span className="text-[10px] mt-1">管理</span>
            </button>
          )}
          <button className="w-full flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <History size={20} />
            <span className="text-[10px] mt-1">订单</span>
          </button>
          <button className="w-full flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <Bell size={20} />
            <span className="text-[10px] mt-1">呼叫</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main 
        className="flex-1 flex flex-col relative overflow-hidden"
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
                value={searchQuery}
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredDishes.map(dish => (
                <motion.div
                  key={dish.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-[32px] overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 border border-gray-100 group relative"
                >
                  <div className="relative h-56 overflow-hidden">
                    <img 
                      src={dish.image} 
                      alt={dish.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-40" />
                    
                    {dish.isRecommended && (
                      <div className="absolute top-4 left-4 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg z-10">
                        店长推荐
                      </div>
                    )}

                    <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded-md border border-white/10">
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
        <div className="absolute bottom-6 right-8 left-40 z-20">
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-[#1f2937]/95 backdrop-blur-xl border border-gray-700 rounded-[28px] h-20 flex items-center justify-between px-8 shadow-2xl"
          >
            <div className="flex items-center space-x-8">
              <div 
                onClick={() => setIsCartOpen(!isCartOpen)}
                className="relative flex items-center space-x-4 cursor-pointer group"
              >
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-[#f5c342] flex items-center justify-center text-black shadow-lg shadow-[#f5c342]/20 group-hover:scale-110 transition-transform">
                    <ShoppingCart size={28} />
                  </div>
                  {totalItems > 0 && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-2 -right-2 w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-black border-2 border-[#1f2937] shadow-lg"
                    >
                      {totalItems}
                    </motion.div>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">当前合计</span>
                  <div className="text-2xl font-black text-white tracking-tight">
                    {formatPrice(totalAmount)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {totalItems > 0 && (
                <button 
                  onClick={clearCart}
                  className="p-3 text-gray-400 hover:text-red-500 transition-colors"
                  title="清空购物车"
                >
                  <Trash2 size={20} />
                </button>
              )}
              <button 
                disabled={totalItems === 0}
                className={`px-10 py-4 rounded-2xl font-black text-base transition-all ${
                  totalItems > 0 
                  ? 'bg-[#e63928] text-white shadow-xl shadow-red-900/40 active:scale-95 hover:bg-red-500' 
                  : 'bg-white/10 text-gray-500 cursor-not-allowed'
                }`}
              >
                立即下单
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
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[900px] max-w-[95vw] max-h-[95vh] bg-white rounded-[48px] z-40 flex flex-col shadow-[0_32px_64px_rgba(0,0,0,0.4)] border border-gray-100 overflow-hidden"
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
                              className="flex flex-col bg-white border border-gray-100 p-4 rounded-[32px] shadow-sm hover:shadow-md transition-all group"
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
                      disabled={!selectedTable}
                      className={`w-full py-5 rounded-[24px] font-black text-xl shadow-xl transition-all active:scale-[0.98] ${
                        selectedTable 
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-200' 
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                      }`}
                    >
                      {selectedTable ? `确认下单 (${selectedTable}号桌)` : '请先选择餐桌号'}
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
    </div>
  );
}
