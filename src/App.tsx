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
import { Dish, DishModifier, CATEGORIES, DISHES, formatPrice, Settings as AppSettings, Table } from './constants';
import AdminPanel from './AdminPanel';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  getDocs, 
  addDoc, 
  setDoc, 
  doc,
  getDocFromServer,
  updateDoc
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
  modifiers?: DishModifier[];
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
  const [appSettings, setAppSettings] = useState<AppSettings>({
    currency: 'KRW',
    language: 'zh',
    restaurantName: 'PIAD 点餐'
  });
  const [sessionInfo, setSessionInfo] = useState<{ table: string, token: string } | null>(null);
  const [isSessionValid, setIsSessionValid] = useState<boolean | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'info' | 'success' } | null>(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [lastOrderCount, setLastOrderCount] = useState(0);
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [selectedDishForSpecs, setSelectedDishForSpecs] = useState<Dish | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<DishModifier[]>([]);
  const [isCartPopping, setIsCartPopping] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Parse URL parameters for QR code session
    const params = new URLSearchParams(window.location.search);
    const table = params.get('table');
    const token = params.get('token');
    
    if (table && token) {
      setSessionInfo({ table, token });
      setSelectedTable(Number(table));
    }

    if (params.get('admin') === 'true') {
      setIsAdminOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    // Validate Session
    if (sessionInfo) {
      const validateSession = async () => {
        try {
          const q = query(collection(db, 'tables'), orderBy('number'));
          const snapshot = await getDocs(q);
          const tableDoc = snapshot.docs.find(d => d.data().number === sessionInfo.table);
          
          if (tableDoc && tableDoc.data().sessionToken === sessionInfo.token) {
            setIsSessionValid(true);
            // Update table status to active
            await updateDoc(doc(db, 'tables', tableDoc.id), { status: 'active' });
          } else {
            setIsSessionValid(false);
          }
        } catch (error) {
          console.error('Session validation failed:', error);
          setIsSessionValid(false);
        }
      };
      validateSession();
    }

    // Fetch settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setAppSettings({
          currency: data.currency || 'KRW',
          language: data.language || 'zh',
          restaurantName: data.restaurantName || 'PIAD 点餐'
        });
        setGridColumns(data.gridColumns || 3);
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

    // Listen for order status changes (Simulated Push Notification)
    let unsubscribeOrders = () => {};
    if (sessionInfo) {
      const qOrders = query(
        collection(db, 'orders'), 
        where('tableNumber', '==', sessionInfo.table),
        where('sessionToken', '==', sessionInfo.token)
      );
      unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            const order = change.doc.data();
            if (order.status === 'served') {
              setNotification({
                message: `您的订单已出餐，请慢用！`,
                type: 'success'
              });
              setTimeout(() => setNotification(null), 5000);
            }
          }
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'orders');
      });
    } else if (user?.email === 'yujianfei2016@gmail.com') {
      // Admins can listen to all orders (optional, but AdminPanel does this anyway)
      // For App.tsx, we only care about session-based notifications.
      // So we don't need to listen to all orders here if not in a session.
    }

    return () => {
      unsubscribeSettings();
      unsubscribeCats();
      unsubscribeDishes();
      unsubscribeOrders();
    };
  }, [isAuthReady, user, lastOrderCount, sessionInfo]);

  const getLocalizedName = (dish: Dish) => {
    if (appSettings.language === 'en' && dish.name_en) return dish.name_en;
    if (appSettings.language === 'ko' && dish.name_ko) return dish.name_ko;
    return dish.name;
  };

  const getLocalizedDesc = (dish: Dish) => {
    if (appSettings.language === 'en' && dish.description_en) return dish.description_en;
    if (appSettings.language === 'ko' && dish.description_ko) return dish.description_ko;
    return dish.description;
  };

  const getLocalizedModifierName = (mod: DishModifier) => {
    if (appSettings.language === 'en' && mod.name_en) return mod.name_en;
    if (appSettings.language === 'ko' && mod.name_ko) return mod.name_ko;
    return mod.name;
  };

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

  const handleAddToCart = async (dish: Dish) => {
    if (dish.isSoldOut) return;

    // Track click for analytics
    try {
      await updateDoc(doc(db, 'dishes', dish.id), {
        clickCount: (dish.clickCount || 0) + 1
      });
    } catch (error) {
      console.error('Failed to track click:', error);
    }

    if (dish.modifiers && dish.modifiers.length > 0) {
      setSelectedDishForSpecs(dish);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === dish.id && !item.modifiers);
      if (existing) {
        return prev.map(item => 
          (item.id === dish.id && !item.modifiers) ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...dish, quantity: 1 }];
    });
    setIsCartPopping(true);
    setTimeout(() => setIsCartPopping(false), 300);
  };

  const handleAddWithModifiers = (dish: Dish, selectedModifiers: DishModifier[]) => {
    setCart(prev => {
      const modifierIds = selectedModifiers.map(m => m.name).sort().join('|');
      const existing = prev.find(item => 
        item.id === dish.id && 
        item.modifiers?.map(m => m.name).sort().join('|') === modifierIds
      );

      if (existing) {
        return prev.map(item => 
          (item.id === dish.id && item.modifiers?.map(m => m.name).sort().join('|') === modifierIds)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      const priceWithModifiers = dish.price + selectedModifiers.reduce((acc, m) => acc + m.price, 0);
      return [...prev, { ...dish, price: priceWithModifiers, quantity: 1, modifiers: selectedModifiers }];
    });
    setSelectedDishForSpecs(null);
    setIsCartPopping(true);
    setTimeout(() => setIsCartPopping(false), 300);
  };

  const removeFromCart = (itemToRemove: CartItem) => {
    setCart(prev => {
      const modifierIds = itemToRemove.modifiers?.map(m => m.name).sort().join('|') || '';
      const existing = prev.find(item => 
        item.id === itemToRemove.id && 
        (item.modifiers?.map(m => m.name).sort().join('|') || '') === modifierIds
      );

      if (existing && existing.quantity > 1) {
        return prev.map(item => 
          (item.id === itemToRemove.id && (item.modifiers?.map(m => m.name).sort().join('|') || '') === modifierIds)
            ? { ...item, quantity: item.quantity - 1 } 
            : item
        );
      }
      return prev.filter(item => 
        !(item.id === itemToRemove.id && (item.modifiers?.map(m => m.name).sort().join('|') || '') === modifierIds)
      );
    });
  };

  const clearCart = () => {
    setCart([]);
    setSelectedTable(null);
    setIsCartOpen(false);
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const getOptimizedImage = (url: string) => {
    if (!url.includes('picsum.photos')) return url;
    // For mobile, we use 200x200 thumbnails, for desktop 600x400
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return isMobile ? url.replace('600/400', '200/200') : url;
  };

  const handleOrderSubmit = async () => {
    if (!selectedTable || cart.length === 0) return;
    
    setIsOrdering(true);
    const orderData = {
      tableNumber: selectedTable.toString(),
      items: cart.map(item => ({
        dishId: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        modifiers: item.modifiers || []
      })),
      totalPrice: totalAmount,
      status: 'pending',
      createdAt: new Date().toISOString(),
      sessionToken: sessionInfo?.token || ''
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

  const CATEGORY_ICONS: Record<string, string> = {
    "店长推荐": "🔥",
    "招牌烤鱼": "🐟",
    "东北菜": "🥟",
    "川菜": "🌶️",
    "肉菜类": "🥩",
    "素菜类": "🥦",
    "海鲜类": "🦀",
    "主食类": "🍚",
    "酒水类": "🥤",
    "啤酒菜": "🍺"
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

  if (isSessionValid === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6">
          <X size={40} />
        </div>
        <h1 className="text-2xl font-black text-gray-800 mb-2">二维码已失效</h1>
        <p className="text-gray-500 text-sm mb-8">该桌位的用餐会话已结束或二维码已过期，请重新扫码或联系服务员。</p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-red-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-red-100 active:scale-95 transition-all"
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white text-[#333] font-sans overflow-hidden select-none relative">
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-4 right-4 z-[200] flex justify-center pointer-events-none"
          >
            <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 pointer-events-auto ${notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
              <Bell size={18} className="animate-bounce" />
              <span className="text-sm font-bold">{notification.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Mobile Sidebar Navigation */}
      <aside className="flex w-20 bg-gray-50 border-r border-gray-100 flex-col py-4 z-10 overflow-y-auto no-scrollbar">
        <div className="flex flex-col space-y-2">
          <button
            onClick={() => setActiveCategory('店长推荐')}
            className={`flex flex-col items-center py-4 relative transition-all ${
              activeCategory === '店长推荐' ? 'bg-white text-green-600' : 'text-gray-500'
            }`}
          >
            {activeCategory === '店长推荐' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-green-500 rounded-r-full" />}
            <span className="text-xl mb-1">{CATEGORY_ICONS['店长推荐']}</span>
            <span className={`text-[0.65rem] font-bold ${activeCategory === '店长推荐' ? 'text-green-600' : 'text-gray-400'}`}>热门推荐</span>
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`flex flex-col items-center py-4 relative transition-all ${
                activeCategory === category ? 'bg-white text-green-600' : 'text-gray-500'
              }`}
            >
              {activeCategory === category && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-green-500 rounded-r-full" />}
              <span className="text-xl mb-1">{CATEGORY_ICONS[category] || '🍽️'}</span>
              <span className={`text-[0.65rem] font-bold ${activeCategory === category ? 'text-green-600' : 'text-gray-400'}`}>{category}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
        {/* Mobile Header */}
        <div className="h-14 flex items-center justify-between px-4 bg-white border-b border-gray-50 z-20">
          <div className="w-8">
            {user?.email === 'yujianfei2016@gmail.com' && (
              <button 
                onClick={() => setIsAdminOpen(true)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
              >
                <Settings size={20} />
              </button>
            )}
          </div>
          <h1 className="text-lg font-black tracking-tight text-gray-900">{appSettings.restaurantName}</h1>
          <div className="flex items-center space-x-2">
            {!user ? (
              <button 
                onClick={handleLogin}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
              >
                <LogIn size={20} />
              </button>
            ) : (
              <button 
                onClick={handleLogout}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
              >
                <LogOut size={20} />
              </button>
            )}
            <Search size={20} className="text-gray-900" />
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="px-4 py-3 bg-white z-10">
          <div className="bg-gray-100 rounded-xl flex items-center px-4 py-2">
            <Search size={16} className="text-gray-400 mr-2" />
            <input 
              type="text" 
              placeholder="搜索菜品或首字母..." 
              className="bg-transparent border-none outline-none text-sm w-full text-gray-700 placeholder-gray-400"
              value={searchQuery || ''}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Dish Grid/List */}
        <div className="flex-1 overflow-y-auto px-4 pb-32 no-scrollbar bg-white">
          <div className="mb-6 flex items-center justify-between pt-4">
            <h2 className="text-lg font-black text-gray-900 flex items-center">
              {activeCategory} {CATEGORY_ICONS[activeCategory]}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredDishes.map(dish => (
                <motion.div
                  key={dish.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`bg-white overflow-hidden transition-all duration-500 group relative flex ${dish.isSoldOut ? 'opacity-60 grayscale-[0.5]' : ''}`}
                >
                  {dish.isSoldOut && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
                      <div className="bg-gray-800 text-white px-3 py-1 rounded-full text-[0.65rem] font-black uppercase tracking-widest shadow-xl">
                        已估清 Sold Out
                      </div>
                    </div>
                  )}
                  <div className="relative w-[35%] aspect-square overflow-hidden flex-shrink-0 rounded-xl">
                    <img 
                      src={getOptimizedImage(dish.image)} 
                      alt={dish.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                    
                    {dish.isRecommended && (
                      <div className="absolute top-2 left-2 bg-red-600 text-white text-[0.5rem] font-bold px-1.5 py-0.5 rounded-md shadow-lg z-10">
                        店长推荐
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="text-base font-black text-gray-900 group-hover:text-red-600 transition-colors line-clamp-1">
                          {getLocalizedName(dish)}
                        </h3>
                      </div>
                      <p className="text-[0.65rem] text-gray-400 line-clamp-1">{getLocalizedDesc(dish) || '精选食材，匠心制作'}</p>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex flex-col">
                        <span className="text-red-600 text-lg font-black">{formatPrice(dish.price, appSettings.currency)}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={() => handleAddToCart(dish)}
                          disabled={dish.isSoldOut}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                            dish.isSoldOut 
                              ? 'bg-gray-100 text-gray-300' 
                              : 'bg-green-500 text-white shadow-green-100'
                          }`}
                        >
                          {dish.modifiers && dish.modifiers.length > 0 ? (
                            <span className="text-[0.65rem] font-black">选</span>
                          ) : (
                            <Plus size={20} />
                          )}
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90vw] z-30">
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ 
              y: 0, 
              opacity: 1,
              scale: isCartPopping ? 1.05 : 1
            }}
            transition={{
              scale: { duration: 0.1 }
            }}
            className="bg-[#1f2937]/95 backdrop-blur-xl border border-white/10 rounded-full h-16 flex items-center justify-between px-2 shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-95 transition-transform"
          >
            <div 
              onClick={() => setIsCartOpen(!isCartOpen)}
              className="flex items-center flex-1 cursor-pointer pl-4"
            >
              <div className="relative mr-4">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-500/20">
                  <ShoppingCart size={20} />
                </div>
                {totalItems > 0 && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-[0.65rem] font-black border-2 border-[#1f2937]"
                  >
                    {totalItems}
                  </motion.div>
                )}
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline space-x-1">
                  <span className="text-white text-lg font-black">{formatPrice(totalAmount, appSettings.currency)}</span>
                </div>
                <span className="text-[0.6rem] text-gray-400 font-bold">已点 {totalItems} 件</span>
              </div>
            </div>

            <button 
              onClick={handleOrderSubmit}
              disabled={totalItems === 0 || isOrdering}
              className={`h-12 px-8 rounded-full font-black text-sm transition-all flex items-center space-x-2 ${
                totalItems > 0
                ? 'bg-green-500 text-white shadow-lg shadow-green-900/20 active:scale-95' 
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isOrdering ? (
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
              ) : (
                <CheckCircle2 size={18} />
              )}
              <span>{isOrdering ? '提交中...' : '去结算'}</span>
            </button>
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
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 w-full h-[75vh] bg-white rounded-t-[2rem] z-40 flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.2)] border-t border-gray-100 overflow-hidden"
              >
                {/* Drag Handle for Mobile */}
                <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-1" />
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
                                <img src={getOptimizedImage(item.image)} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                <div className="absolute top-2 right-2 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-black border-2 border-white shadow-lg">
                                  {item.quantity}
                                </div>
                              </div>
                              <div className="flex-1 flex flex-col">
                                <h4 className="font-black text-base text-gray-900 mb-1 line-clamp-1">{getLocalizedName(item)}</h4>
                                <div className="text-red-600 text-sm font-black mb-4">{formatPrice(item.price, appSettings.currency)}</div>
                                
                                {item.modifiers && item.modifiers.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {item.modifiers.map((m, idx) => (
                                      <span key={idx} className="text-[0.5rem] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md font-bold">
                                        {getLocalizedModifierName(m)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                
                                <div className="mt-auto flex items-center justify-between bg-gray-50 p-1.5 rounded-2xl">
                                  <button 
                                    onClick={() => removeFromCart(item)} 
                                    className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-red-600 hover:border-red-100 transition-all shadow-sm active:scale-90"
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className="font-black text-base text-gray-900">{item.quantity}</span>
                                  <button 
                                    onClick={() => handleAddToCart(item)} 
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
                        <span className="text-3xl font-black text-red-600">{formatPrice(totalAmount, appSettings.currency)}</span>
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

      {/* Specification Selector Bottom Sheet */}
      <AnimatePresence>
        {selectedDishForSpecs && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedDishForSpecs(null);
                setSelectedModifiers([]);
              }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 h-[70vh] bg-white rounded-t-[2rem] z-[70] flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.2)] overflow-hidden"
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-1" />
              
              <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
                <div className="flex items-center space-x-4">
                  <img src={selectedDishForSpecs.image} className="w-16 h-16 rounded-xl object-cover" alt="" />
                  <div>
                    <h3 className="text-lg font-black text-gray-900">{getLocalizedName(selectedDishForSpecs)}</h3>
                    <p className="text-red-600 font-black">{formatPrice(selectedDishForSpecs.price, appSettings.currency)}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setSelectedDishForSpecs(null);
                    setSelectedModifiers([]);
                  }}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                <section>
                  <h4 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-widest">选择规格/加料</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedDishForSpecs.modifiers?.map((mod, idx) => {
                      const isSelected = selectedModifiers.some(m => m.name === mod.name);
                      return (
                        <button 
                          key={idx}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedModifiers(prev => prev.filter(m => m.name !== mod.name));
                            } else {
                              setSelectedModifiers(prev => [...prev, mod]);
                            }
                          }}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            isSelected 
                              ? 'border-red-600 bg-red-50 text-red-600' 
                              : 'border-gray-100 bg-gray-50 text-gray-500'
                          }`}
                        >
                          <div className="text-xs font-black mb-0.5">{getLocalizedModifierName(mod)}</div>
                          <div className="text-[0.65rem] font-bold opacity-60">+{formatPrice(mod.price, appSettings.currency)}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs text-gray-400 font-bold">已选：{selectedModifiers.length > 0 ? selectedModifiers.map(m => getLocalizedModifierName(m)).join(', ') : '无'}</div>
                  <div className="text-lg font-black text-red-600">
                    {formatPrice(selectedDishForSpecs.price + selectedModifiers.reduce((acc, m) => acc + m.price, 0), appSettings.currency)}
                  </div>
                </div>
                <button 
                  onClick={() => {
                    handleAddWithModifiers(selectedDishForSpecs, selectedModifiers);
                    setSelectedModifiers([]);
                  }}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-red-200 active:scale-95 transition-all"
                >
                  确认加入购物车
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
