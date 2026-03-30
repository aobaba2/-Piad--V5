import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  Image as ImageIcon,
  Tag,
  DollarSign,
  ChevronRight,
  Settings,
  ArrowLeft,
  GripVertical,
  Search,
  RotateCcw,
  ClipboardList,
  Bell,
  CheckCircle2,
  Clock,
  ChefHat,
  Ban,
  BarChart3,
  Users,
  AlertTriangle,
  Zap,
  TrendingUp,
  ShieldCheck,
  QrCode,
  Languages,
  LayoutGrid
} from 'lucide-react';
import { Dish, DishModifier, formatPrice, Table, Settings as AppSettings } from './constants';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  setDoc,
  getDocs,
  getDoc
} from 'firebase/firestore';

interface AdminPanelProps {
  onClose: () => void;
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

interface Category {
  id: string;
  name: string;
  order: number;
}

interface OrderItem {
  dishId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers?: DishModifier[];
}

interface Order {
  id: string;
  tableNumber: string;
  items: OrderItem[];
  totalPrice: number;
  status: 'pending' | 'preparing' | 'served' | 'completed' | 'cancelled';
  createdAt: string;
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editingDish, setEditingDish] = useState<Partial<Dish> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, name: string, type: 'dish' | 'category' | 'order' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'menu' | 'settings' | 'orders' | 'analytics' | 'access' | 'tables'>('orders');
  const [staff, setStaff] = useState<{ id: string, email: string, role: 'owner' | 'manager' | 'waiter', uid?: string }[]>([]);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'manager' | 'waiter'>('waiter');
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    currency: 'KRW',
    language: 'zh',
    restaurantName: 'PIAD 点餐'
  });
  const [localRestaurantName, setLocalRestaurantName] = useState('PIAD 点餐');
  const [lastOrderCount, setLastOrderCount] = useState(0);

  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(auth.currentUser);

  // Super Admin Login State
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Audio notification for pending orders
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const hasPendingOrders = orders.some(o => o.status === 'pending');
    let audio: HTMLAudioElement | null = null;
    
    if (hasPendingOrders) {
      audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.loop = true;
      audio.play().catch(e => console.error('Audio play failed:', e));
    }

    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [orders]);
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [userRole, setUserRole] = useState<'owner' | 'manager' | 'waiter'>('owner');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [gridColumns, setGridColumns] = useState(3);
  const isReorderingRef = React.useRef(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    // Fetch user role
    const fetchUserRole = async () => {
      if (!auth.currentUser) return;
      
      // Default admin check
      if (auth.currentUser.email === 'yujianfei2016@gmail.com' || auth.currentUser.email === 'aoba2026@admin.com') {
        setUserRole('owner');
        return;
      }

      try {
        if (auth.currentUser.email) {
          const staffDoc = await getDoc(doc(db, 'staff', auth.currentUser.email));
          if (staffDoc.exists()) {
            setUserRole(staffDoc.data().role || 'waiter');
            return;
          }
        }
        
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role || 'waiter');
        } else {
          setUserRole('waiter'); // Default for new users
        }
      } catch (error) {
        console.error('Failed to fetch user role:', error);
        setUserRole('waiter');
      }
    };

    fetchUserRole();

    // Real-time settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setAppSettings({
          currency: data.currency || 'KRW',
          language: data.language || 'zh',
          restaurantName: data.restaurantName || 'PIAD 点餐'
        });
        setLocalRestaurantName(data.restaurantName || 'PIAD 点餐');
        setGridColumns(data.gridColumns || 3);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });

    // Real-time tables
    const unsubscribeTables = onSnapshot(collection(db, 'tables'), (snapshot) => {
      const tablesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Table[];
      setTables(tablesData.sort((a, b) => a.number.localeCompare(b.number)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tables');
    });

    // Real-time categories
    const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
    const unsubscribeCats = onSnapshot(q, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      setCategories(cats);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'categories');
    });

    // Real-time dishes
    const unsubscribeDishes = onSnapshot(collection(db, 'dishes'), (snapshot) => {
      if (isReorderingRef.current) return;
      const dishesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Dish[];
      setDishes(dishesData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dishes');
    });

    // Real-time orders
    const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      
      if (ordersData.length > lastOrderCount && lastOrderCount !== 0) {
        setShowNewOrderAlert(true);
        // Voice reminder
        try {
          const utterance = new SpeechSynthesisUtterance('您有新的订单，请及时处理');
          utterance.lang = 'zh-CN';
          utterance.rate = 1.0;
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.log('Voice synthesis failed');
        }
      }
      setLastOrderCount(ordersData.length);
      setOrders(ordersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });

    // Real-time staff
    const unsubscribeStaff = onSnapshot(collection(db, 'staff'), (snapshot) => {
      const staffData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as { id: string, email: string, role: 'owner' | 'manager' | 'waiter' }[];
      setStaff(staffData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'staff');
    });

    return () => {
      unsubscribeSettings();
      unsubscribeCats();
      unsubscribeDishes();
      unsubscribeOrders();
      unsubscribeTables();
      unsubscribeStaff();
    };
  }, [lastOrderCount]);

  const handleUpdateGridColumns = async (cols: number) => {
    try {
      await setDoc(doc(db, 'settings', 'global'), { gridColumns: cols }, { merge: true });
      setGridColumns(cols);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
    }
  };

  const handleReorderDishes = async (newOrder: Dish[]) => {
    isReorderingRef.current = true;
    // Update local state first for responsiveness
    const dishIdsInView = new Set(newOrder.map(d => d.id));
    const updatedDishes = dishes.map(d => {
      if (dishIdsInView.has(d.id)) {
        const index = newOrder.findIndex(nd => nd.id === d.id);
        return { ...d, order: index };
      }
      return d;
    });
    setDishes(updatedDishes);

    try {
      const updates = newOrder.map((dish, index) => 
        updateDoc(doc(db, 'dishes', dish.id), { order: index })
      );
      await Promise.all(updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'dishes');
    } finally {
      // Small delay to let Firestore settle
      setTimeout(() => {
        isReorderingRef.current = false;
      }, 500);
    }
  };

  const handleResetDishOrder = async () => {
    // Reset by alphabetical order
    const sorted = [...filteredDishes].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    handleReorderDishes(sorted);
  };

  const handleSuperAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      // Map username to email for Firebase Auth
      const email = adminUsername.includes('@') ? adminUsername : `${adminUsername}@admin.com`;
      try {
        await signInWithEmailAndPassword(auth, email, adminPassword);
      } catch (err: any) {
        // If user not found and it's the requested super admin, try to create it
        if (err.code === 'auth/user-not-found' && adminUsername === 'aoba2026') {
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          await createUserWithEmailAndPassword(auth, email, adminPassword);
          showToast('管理员账号已自动创建并登录', 'success');
        } else {
          throw err;
        }
      }
      showToast('登录成功', 'success');
    } catch (error: any) {
      console.error('Login failed:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setLoginError('用户名或密码错误');
      } else if (error.code === 'auth/invalid-email') {
        setLoginError('无效的用户名格式');
      } else {
        setLoginError('登录失败，请稍后再试');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      showToast('登录成功', 'success');
    } catch (error) {
      console.error('Google login failed:', error);
      showToast('登录失败', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showToast('已退出登录', 'info');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDish) return;

    // Waiter restriction: No price modification
    if (userRole === 'waiter' && editingDish.id) {
      const originalDish = dishes.find(d => d.id === editingDish.id);
      if (originalDish && originalDish.price !== editingDish.price) {
        showToast('权限不足：服务员无法修改菜品价格', 'error');
        return;
      }
    }

    const dishToSave = {
      name: editingDish.name,
      name_en: editingDish.name_en || '',
      name_ko: editingDish.name_ko || '',
      price: editingDish.price,
      image: editingDish.image,
      category: editingDish.category,
      description: editingDish.description || '',
      description_en: editingDish.description_en || '',
      description_ko: editingDish.description_ko || '',
      tags: editingDish.tags || [],
      isRecommended: editingDish.isRecommended || false,
      isSoldOut: editingDish.isSoldOut || false,
      stock: editingDish.stock ?? undefined,
      modifiers: editingDish.modifiers || [],
      order: editingDish.order ?? dishes.filter(d => d.category === editingDish.category).length
    };

    try {
      if (editingDish.id) {
        // Update
        await updateDoc(doc(db, 'dishes', editingDish.id), dishToSave);
      } else {
        // Create
        await addDoc(collection(db, 'dishes'), dishToSave);
      }
      setEditingDish(null);
    } catch (error) {
      handleFirestoreError(error, editingDish.id ? OperationType.UPDATE : OperationType.CREATE, 'dishes');
    }
  };

  const handleDeleteDish = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'dishes', id));
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `dishes/${id}`);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    const newName = editingCategory.name.trim();
    if (!newName) return;

    try {
      if (editingCategory.id) {
        // Update
        const oldName = categories.find(c => c.id === editingCategory.id)?.name;
        await updateDoc(doc(db, 'categories', editingCategory.id), { name: newName });
        
        if (oldName && oldName !== newName) {
          // Update all dishes in this category
          const dishesToUpdate = dishes.filter(d => d.category === oldName);
          const updates = dishesToUpdate.map(d => 
            updateDoc(doc(db, 'dishes', d.id), { category: newName })
          );
          await Promise.all(updates);
          
          if (activeCategory === oldName) {
            setActiveCategory(newName);
          }
        }
      } else {
        // Create
        await addDoc(collection(db, 'categories'), { 
          name: newName, 
          order: categories.length 
        });
      }
      setEditingCategory(null);
    } catch (error) {
      handleFirestoreError(error, editingCategory.id ? OperationType.UPDATE : OperationType.CREATE, 'categories');
    }
  };

  const handleReorder = async (newOrder: Category[]) => {
    setCategories(newOrder);
    try {
      // Update each category's order in Firestore
      const updates = newOrder.map((cat, index) => 
        updateDoc(doc(db, 'categories', cat.id), { order: index })
      );
      await Promise.all(updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    try {
      await deleteDoc(doc(db, 'categories', catId));
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${catId}`);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
      
      // If order is completed, automatically reset table session if it's the last order
      if (status === 'completed') {
        const order = orders.find(o => o.id === orderId);
        if (order) {
          const table = tables.find(t => t.number === order.tableNumber);
          if (table) {
            // Reset table session token to prevent further orders
            const newToken = Math.random().toString(36).substring(2, 15);
            await updateDoc(doc(db, 'tables', table.id), { 
              sessionToken: newToken,
              status: 'idle' 
            });
            showToast(`桌号 ${order.tableNumber} 的用餐已结单，二维码已失效`, 'success');
          }
        }
      } else if (status === 'served') {
        showToast('出餐成功，已通知客人', 'success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (userRole === 'waiter') {
      showToast('权限不足：服务员无法删除订单', 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'orders', orderId));
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `orders/${orderId}`);
    }
  };

  const filteredDishes = dishes
    .filter(dish => {
      const matchesCategory = activeCategory ? dish.category === activeCategory : true;
      const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="fixed inset-0 bg-[#f3f4f6] z-[100] flex flex-col overflow-hidden text-gray-800">
      {!user ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-red-50 to-white">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-red-100 overflow-hidden border border-red-50"
          >
            <div className="p-10">
              <div className="w-20 h-20 bg-red-600 rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-red-200 mx-auto">
                <ShieldCheck className="text-white" size={40} />
              </div>
              <h2 className="text-3xl font-black text-center mb-2">后台管理登录</h2>
              <p className="text-gray-400 text-center mb-10 font-medium">PIAD 点餐系统管理后台</p>

              <form onSubmit={handleSuperAdminLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">用户名</label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text"
                      required
                      value={adminUsername}
                      onChange={e => setAdminUsername(e.target.value)}
                      placeholder="请输入管理员账号"
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-12 pr-4 py-4 outline-none focus:border-red-600 focus:bg-white transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">密码</label>
                  <div className="relative">
                    <Zap className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="password"
                      required
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      placeholder="请输入登录密码"
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-12 pr-4 py-4 outline-none focus:border-red-600 focus:bg-white transition-all font-medium"
                    />
                  </div>
                </div>

                {loginError && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center space-x-2 text-red-600 bg-red-50 p-4 rounded-xl text-sm font-bold"
                  >
                    <AlertTriangle size={16} />
                    <span>{loginError}</span>
                  </motion.div>
                )}

                <button 
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-red-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-red-200 hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isLoggingIn ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>立即登录</span>
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-10 pt-8 border-t border-gray-50">
                <p className="text-center text-[10px] text-gray-300 font-bold mb-4 uppercase tracking-widest">注意：请确保 Firebase 控制台已启用 邮箱/密码 登录方式</p>
                <p className="text-center text-xs text-gray-400 font-bold mb-6 uppercase tracking-widest">或者使用</p>
                <button 
                  onClick={handleGoogleLogin}
                  className="w-full bg-white border-2 border-gray-100 text-gray-600 py-4 rounded-2xl font-bold hover:bg-gray-50 active:scale-[0.98] transition-all flex items-center justify-center space-x-3"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  <span>Google 账号登录</span>
                </button>
              </div>
            </div>
          </motion.div>
          
          <button 
            onClick={onClose}
            className="fixed top-6 right-6 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      ) : (
        <>
          {/* Admin Header */}
      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 shadow-sm flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-black flex items-center">
            <Settings className="mr-2 text-red-600" size={18} />
            后台管理
            {user?.email === 'aoba2026@admin.com' && (
              <span className="ml-2 bg-red-50 text-red-600 text-[0.6rem] px-2 py-0.5 rounded-full border border-red-100">
                超级管理员
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center space-x-2">
          {view === 'menu' && (
            <button 
              onClick={() => setEditingDish({ name: '', price: 0, category: categories[0]?.name || '', description: '', tags: [] })}
              className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center shadow-md shadow-red-100 active:scale-95 transition-all"
            >
              <Plus size={14} className="mr-1" />
              新增
            </button>
          )}
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-red-600"
            title="退出登录"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Admin Navigation - Horizontal Scroll */}
        <nav className="bg-white border-b border-gray-100 px-4 py-2 flex items-center space-x-2 overflow-x-auto no-scrollbar flex-shrink-0">
          <button 
            onClick={() => setView('orders')}
            className={`flex-shrink-0 flex items-center px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'orders' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'text-gray-600 bg-gray-50'}`}
          >
            <Zap size={14} className="mr-2" />
            实时看板
            {orders.filter(o => o.status === 'pending').length > 0 && (
              <span className="ml-2 bg-white text-red-600 w-4 h-4 rounded-full flex items-center justify-center text-[0.5rem] font-black animate-pulse">
                {orders.filter(o => o.status === 'pending').length}
              </span>
            )}
          </button>
          <button 
            onClick={() => {
              setView('menu');
              setActiveCategory(null);
            }}
            className={`flex-shrink-0 flex items-center px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'menu' && !activeCategory ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'text-gray-600 bg-gray-50'}`}
          >
            <ImageIcon size={14} className="mr-2" />
            智能菜单
          </button>
          {userRole !== 'waiter' && (
            <button 
              onClick={() => setView('analytics')}
              className={`flex-shrink-0 flex items-center px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'analytics' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'text-gray-600 bg-gray-50'}`}
            >
              <TrendingUp size={14} className="mr-2" />
              数据中心
            </button>
          )}
          {userRole !== 'waiter' && (
            <button 
              onClick={() => setView('access')}
              className={`flex-shrink-0 flex items-center px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'access' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'text-gray-600 bg-gray-50'}`}
            >
              <ShieldCheck size={14} className="mr-2" />
              权限安全
            </button>
          )}
          <button 
            onClick={() => setView('tables')}
            className={`flex-shrink-0 flex items-center px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'tables' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'text-gray-600 bg-gray-50'}`}
          >
            <QrCode size={14} className="mr-2" />
            桌位管理
          </button>
          {userRole !== 'waiter' && (
            <button 
              onClick={() => setView('settings')}
              className={`flex-shrink-0 flex items-center px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'settings' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'text-gray-600 bg-gray-50'}`}
            >
              <Settings size={14} className="mr-2" />
              系统设置
            </button>
          )}
        </nav>

        {/* Content Area */}
        <main className="flex-1 p-4 overflow-y-auto bg-gray-50/50 no-scrollbar">
          {view === 'orders' ? (
            <div className="w-full">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-gray-800">实时订单</h2>
                  <p className="text-gray-400 text-[0.65rem] mt-0.5">第一时间掌握每桌客人的点餐动态</p>
                </div>
                <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[0.65rem] font-bold text-gray-600">监听中</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <AnimatePresence mode="popLayout">
                  {orders.map(order => (
                    <motion.div 
                      key={order.id} 
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={`bg-white rounded-3xl p-5 border transition-all flex flex-col ${
                        order.status === 'pending' ? 'border-red-200 shadow-md ring-2 ring-red-100' : 'border-gray-100 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${
                            order.status === 'pending' 
                              ? 'bg-red-600 text-white shadow-lg shadow-red-200' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {order.tableNumber}
                          </div>
                          <div>
                            <h3 className="font-black text-base text-gray-900">桌号 {order.tableNumber}</h3>
                            <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                          order.status === 'pending' ? 'bg-red-100 text-red-700' :
                          order.status === 'preparing' ? 'bg-orange-100 text-orange-700' :
                          order.status === 'served' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {order.status === 'pending' ? '待处理' : 
                           order.status === 'preparing' ? '制作中' : 
                           order.status === 'served' ? '待配送' : '已完成'}
                        </div>
                      </div>

                      {/* Order items list */}
                      <div className="flex-1 bg-gray-50 rounded-2xl p-3 mb-4 space-y-2 overflow-y-auto max-h-40 no-scrollbar">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <div className="flex-1">
                              <span className="font-bold text-gray-900">{item.name}</span>
                              {item.modifiers && item.modifiers.length > 0 && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {item.modifiers.map(m => m.name).join(', ')}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-3 ml-2">
                              <span className="text-gray-500 font-medium">x{item.quantity}</span>
                              <span className="font-bold text-gray-900 w-16 text-right">{formatPrice(item.price * item.quantity)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <div className="text-lg font-black text-red-600">
                          {formatPrice(order.totalPrice)}
                        </div>
                        <div className="flex space-x-2">
                          {order.status === 'pending' && (
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                              className="bg-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-orange-100 active:scale-95 transition-all flex items-center"
                            >
                              <ChefHat size={16} className="mr-1.5" />
                              开始制作
                            </button>
                          )}
                          {order.status === 'preparing' && (
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.id, 'served')}
                              className="bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-blue-100 active:scale-95 transition-all flex items-center"
                            >
                              <Bell size={16} className="mr-1.5" />
                              呼叫配送
                            </button>
                          )}
                          {order.status === 'served' && (
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.id, 'completed')}
                              className="bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-green-100 active:scale-95 transition-all flex items-center"
                            >
                              <CheckCircle2 size={16} className="mr-1.5" />
                              完成订单
                            </button>
                          )}
                          <button 
                            onClick={() => setItemToDelete({ id: order.id, name: `桌号 ${order.tableNumber} 的订单`, type: 'order' })}
                            className="p-2.5 bg-gray-100 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {orders.length === 0 && (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-gray-100 mb-6 shadow-sm">
                    <ClipboardList size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">暂无新订单</h3>
                  <p className="text-gray-400">当客人下单后，这里会第一时间显示</p>
                </div>
              )}
            </div>
          ) : view === 'menu' ? (
            <div className="w-full">
              <div className="mb-6 flex flex-col gap-4">
                <div>
                  <div className="flex items-center space-x-3">
                    <h2 className="text-lg font-black text-gray-800">
                      {activeCategory || '全部菜品'} 
                      <span className="text-[0.65rem] font-normal text-gray-400 ml-1">({filteredDishes.length})</span>
                    </h2>
                    {activeCategory && (
                      <button 
                        onClick={handleResetDishOrder}
                        className="flex items-center space-x-1 text-[0.65rem] font-bold text-gray-400 hover:text-red-600 transition-colors bg-white px-2 py-1 rounded-lg border border-gray-100 shadow-sm"
                      >
                        <RotateCcw size={12} />
                        <span>重置排序</span>
                      </button>
                    )}
                  </div>
                  <p className="text-gray-400 text-[0.65rem] mt-0.5">管理菜单项和分类</p>
                </div>
                
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input 
                    type="text"
                    placeholder="搜索菜品名称..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:border-red-600 text-sm shadow-sm"
                  />
                </div>

                {/* Category Quick Switch for Menu View */}
                <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
                  <button 
                    onClick={() => setActiveCategory(null)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[0.65rem] font-bold transition-all ${!activeCategory ? 'bg-red-600 text-white' : 'bg-white text-gray-500 border border-gray-100'}`}
                  >
                    全部
                  </button>
                  {categories.map(cat => (
                    <button 
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.name)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[0.65rem] font-bold transition-all ${activeCategory === cat.name ? 'bg-red-600 text-white' : 'bg-white text-gray-500 border border-gray-100'}`}
                    >
                      {cat.name}
                    </button>
                  ))}
                  <button 
                    onClick={() => setEditingCategory({ id: '', name: '', order: categories.length })}
                    className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <Reorder.Group 
                axis="y" 
                values={filteredDishes} 
                onReorder={handleReorderDishes}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
              >
                {filteredDishes.map(dish => (
                  <Reorder.Item 
                    key={dish.id} 
                    value={dish}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group active:scale-[0.98] transition-all cursor-grab active:cursor-grabbing flex flex-col"
                  >
                    <div className="relative w-full aspect-square overflow-hidden bg-gray-50">
                      <img src={dish.image} alt={dish.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      {dish.isRecommended && (
                        <div className="absolute top-2 left-2 bg-red-600 text-white text-[0.65rem] font-black px-2 py-1 rounded-lg shadow-md">
                          推荐
                        </div>
                      )}
                      {dish.isSoldOut && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[2px]">
                          <span className="bg-gray-900 text-white px-3 py-1.5 rounded-xl text-sm font-black shadow-xl">已估清</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 p-1.5 bg-white/80 backdrop-blur-md rounded-lg text-gray-400 shadow-sm cursor-grab active:cursor-grabbing">
                        <GripVertical size={14} />
                      </div>
                    </div>
                    
                    <div className="p-3 flex-1 flex flex-col">
                      <h3 className="font-black text-gray-900 text-sm line-clamp-1 mb-1">{dish.name}</h3>
                      <span className="text-red-600 font-black text-sm mb-2">{formatPrice(dish.price)}</span>
                      
                      <div className="flex flex-wrap gap-1 mb-3">
                        <span className="text-[0.65rem] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded-md font-bold">
                          {dish.category}
                        </span>
                        {dish.modifiers && dish.modifiers.length > 0 && (
                          <span className="text-[0.65rem] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-bold">
                            {dish.modifiers.length} 个规格
                          </span>
                        )}
                      </div>
                      
                      <div className="mt-auto flex items-center justify-end space-x-1 pt-2 border-t border-gray-50">
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (userRole === 'waiter') {
                              showToast('权限不足：服务员无法修改估清状态', 'error');
                              return;
                            }
                            try {
                              await updateDoc(doc(db, 'dishes', dish.id), { isSoldOut: !dish.isSoldOut });
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, `dishes/${dish.id}`);
                            }
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${dish.isSoldOut ? 'text-red-600 bg-red-50' : 'text-gray-400 hover:bg-gray-100'}`}
                          title={dish.isSoldOut ? "取消估清" : "设为估清"}
                        >
                          <Ban size={14} />
                        </button>
                        {userRole !== 'waiter' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDish(dish);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {userRole !== 'waiter' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete({ id: dish.id, name: dish.name, type: 'dish' });
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            </div>
          ) : view === 'analytics' ? (
            <div className="w-full">
              <div className="mb-6">
                <h2 className="text-lg font-black text-gray-800">数据中心</h2>
                <p className="text-gray-400 text-[0.65rem] mt-0.5">实时监控营业额、客单价及菜品热度</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
                      <DollarSign size={24} />
                    </div>
                    <span className="text-sm font-bold text-gray-500">今日营收</span>
                  </div>
                  <div className="text-4xl font-black text-gray-900">
                    {formatPrice(orders.filter(o => o.status === 'completed').reduce((acc, o) => acc + o.totalPrice, 0))}
                  </div>
                  <div className="text-xs text-green-500 font-bold mt-2">↑ 12% 较昨日</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                      <TrendingUp size={24} />
                    </div>
                    <span className="text-sm font-bold text-gray-500">平均客单价</span>
                  </div>
                  <div className="text-4xl font-black text-gray-900">
                    {formatPrice(orders.filter(o => o.status === 'completed').length > 0 
                      ? orders.filter(o => o.status === 'completed').reduce((acc, o) => acc + o.totalPrice, 0) / orders.filter(o => o.status === 'completed').length 
                      : 0)}
                  </div>
                  <div className="text-xs text-blue-500 font-bold mt-2">实时计算中</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                      <ClipboardList size={24} />
                    </div>
                    <span className="text-sm font-bold text-gray-500">今日订单</span>
                  </div>
                  <div className="text-4xl font-black text-gray-900">
                    {orders.length} <span className="text-sm font-normal text-gray-400">单</span>
                  </div>
                  <div className="text-xs text-orange-500 font-bold mt-2">
                    {orders.filter(o => o.status === 'pending').length} 单待处理
                  </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                      <Users size={24} />
                    </div>
                    <span className="text-sm font-bold text-gray-500">活跃桌位</span>
                  </div>
                  <div className="text-4xl font-black text-gray-900">
                    {tables.filter(t => t.status === 'active').length} <span className="text-sm font-normal text-gray-400">桌</span>
                  </div>
                  <div className="text-xs text-purple-500 font-bold mt-2">共 {tables.length} 个桌位</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-6">
                <h3 className="text-sm font-black text-gray-800 mb-4 flex items-center">
                  <BarChart3 size={16} className="mr-2 text-red-600" />
                  菜品热力图 (点击率)
                </h3>
                <div className="space-y-4">
                  {(() => {
                    const sortedDishes = [...dishes].sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0));
                    const maxClicks = sortedDishes[0]?.clickCount || 1;
                    return sortedDishes.slice(0, 8).map((dish, idx) => {
                      const heat = Math.min(100, ((dish.clickCount || 0) / maxClicks) * 100);
                      // Heatmap colors: from gray to orange to red
                      const heatColor = heat > 80 ? 'bg-red-600' : heat > 50 ? 'bg-orange-500' : heat > 20 ? 'bg-orange-300' : 'bg-gray-300';
                      
                      return (
                        <div key={dish.id} className="space-y-1.5">
                          <div className="flex justify-between text-[0.65rem] font-bold">
                            <div className="flex items-center space-x-2">
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[0.5rem] ${idx < 3 ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                {idx + 1}
                              </span>
                              <span className="text-gray-600 truncate max-w-[120px]">{dish.name}</span>
                            </div>
                            <span className="text-gray-400">{dish.clickCount || 0} 次点击</span>
                          </div>
                          <div className="h-2 bg-gray-50 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${heat}%` }}
                              className={`h-full ${heatColor} transition-colors duration-500`}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          ) : view === 'access' ? (
            <div className="w-full">
              <div className="mb-6">
                <h2 className="text-lg font-black text-gray-800">权限与安全</h2>
                <p className="text-gray-400 text-[0.65rem] mt-0.5">管理员工角色及系统访问权限</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                  <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest">角色定义</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                        <ShieldCheck size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-black text-gray-800">老板 (Owner)</div>
                        <div className="text-[0.65rem] text-gray-400">拥有所有权限，包括财务查看、价格修改</div>
                      </div>
                    </div>
                    <div className="text-[0.65rem] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-md">当前</div>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                        <Users size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-black text-gray-800">店长 (Manager)</div>
                        <div className="text-[0.65rem] text-gray-400">管理菜单、处理订单、查看部分报表</div>
                      </div>
                    </div>
                    <button className="text-[0.65rem] font-bold text-gray-400 hover:text-blue-600 transition-colors">配置</button>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
                        <ClipboardList size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-black text-gray-800">服务员 (Waiter)</div>
                        <div className="text-[0.65rem] text-gray-400">仅限订单查看、状态流转，不可改价</div>
                      </div>
                    </div>
                    <button className="text-[0.65rem] font-bold text-gray-400 hover:text-gray-600 transition-colors">配置</button>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-orange-50 rounded-2xl border border-orange-100 flex items-start space-x-3">
                <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                <p className="text-[0.65rem] text-orange-700 leading-relaxed">
                  安全提示：服务员账号已锁定“价格修改”与“订单删除”权限。如需调整，请联系老板账号。
                </p>
              </div>

              {userRole === 'owner' && (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-gray-800">员工管理</h3>
                    <button 
                      onClick={() => setIsAddingStaff(!isAddingStaff)}
                      className="text-[0.65rem] font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-xl active:scale-95 transition-all"
                    >
                      {isAddingStaff ? '取消' : '+ 添加员工'}
                    </button>
                  </div>

                  <AnimatePresence>
                    {isAddingStaff && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
                          <div className="space-y-1">
                            <label className="text-[0.5rem] font-bold text-gray-400 uppercase">员工邮箱 (Google 账号)</label>
                            <input 
                              type="email" 
                              value={newStaffEmail}
                              onChange={e => setNewStaffEmail(e.target.value)}
                              placeholder="example@gmail.com"
                              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-red-600 transition-colors"
                            />
                          </div>
                          <div className="flex items-center space-x-3">
                            <div className="flex-1 space-y-1">
                              <label className="text-[0.5rem] font-bold text-gray-400 uppercase">分配角色</label>
                              <select 
                                value={newStaffRole}
                                onChange={e => setNewStaffRole(e.target.value as 'manager' | 'waiter')}
                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-red-600 transition-colors appearance-none"
                              >
                                <option value="manager">店长 (Manager)</option>
                                <option value="waiter">服务员 (Waiter)</option>
                              </select>
                            </div>
                            <button 
                              onClick={async () => {
                                if (!newStaffEmail) return;
                                try {
                                  await setDoc(doc(db, 'staff', newStaffEmail), {
                                    email: newStaffEmail,
                                    role: newStaffRole
                                  });
                                  setNewStaffEmail('');
                                  setIsAddingStaff(false);
                                  showToast('员工添加成功', 'success');
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.CREATE, 'staff');
                                }
                              }}
                              className="self-end bg-red-600 text-white px-6 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-red-100 active:scale-95 transition-all"
                            >
                              确认添加
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="divide-y divide-gray-50">
                      {staff.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-xs">暂无员工信息</div>
                      ) : (
                        staff.map(member => (
                          <div key={member.id} className="p-4 flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                member.role === 'owner' ? 'bg-red-100 text-red-600' : 
                                member.role === 'manager' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {member.role === 'owner' ? <ShieldCheck size={16} /> : 
                                 member.role === 'manager' ? <Users size={16} /> : <ClipboardList size={16} />}
                              </div>
                              <div>
                                <div className="text-sm font-black text-gray-800">{member.email}</div>
                                <div className="text-[0.65rem] text-gray-400 uppercase tracking-widest font-bold">
                                  {member.role === 'owner' ? '老板' : member.role === 'manager' ? '店长' : '服务员'}
                                </div>
                              </div>
                            </div>
                            {member.role !== 'owner' && (
                              <button 
                                onClick={async () => {
                                  try {
                                    await deleteDoc(doc(db, 'staff', member.id));
                                    showToast('员工已移除', 'info');
                                  } catch (error) {
                                    handleFirestoreError(error, OperationType.DELETE, `staff/${member.id}`);
                                  }
                                }}
                                className="p-2 text-gray-300 hover:text-red-600 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : view === 'tables' ? (
            <div className="w-full">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-gray-800">桌位管理</h2>
                  <p className="text-gray-400 text-[0.65rem] mt-0.5">管理桌位状态与动态二维码</p>
                </div>
                <button 
                  onClick={async () => {
                    const newNumber = (tables.length + 1).toString();
                    try {
                      await addDoc(collection(db, 'tables'), {
                        number: newNumber,
                        status: 'idle',
                        sessionToken: Math.random().toString(36).substring(2, 15)
                      });
                    } catch (error) {
                      handleFirestoreError(error, OperationType.CREATE, 'tables');
                    }
                  }}
                  className="bg-red-600 text-white p-2 rounded-xl shadow-lg shadow-red-100 active:scale-95 transition-all"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {tables.map(table => (
                  <div key={table.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className={`absolute top-0 right-0 w-12 h-12 -mr-6 -mt-6 rotate-45 ${table.status === 'active' ? 'bg-green-500' : 'bg-gray-200'}`} />
                    
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-900 font-black text-xl">
                        {table.number}
                      </div>
                      <div className="text-center">
                        <div className={`text-[0.6rem] font-black uppercase tracking-widest ${table.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                          {table.status === 'active' ? '正在用餐' : '空闲中'}
                        </div>
                        {table.sessionToken && (
                          <div className="text-[0.5rem] text-gray-300 font-mono mt-1 truncate w-24">
                            Token: {table.sessionToken.substring(0, 8)}...
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2 w-full pt-2">
                        <button 
                          onClick={async () => {
                            const newToken = Math.random().toString(36).substring(2, 15);
                            try {
                              await updateDoc(doc(db, 'tables', table.id), { 
                                sessionToken: newToken,
                                status: 'idle' 
                              });
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, `tables/${table.id}`);
                            }
                          }}
                          className="flex-1 bg-gray-50 text-gray-600 py-2 rounded-xl text-[0.6rem] font-bold hover:bg-gray-100 transition-colors flex items-center justify-center"
                          title="重置二维码"
                        >
                          <RotateCcw size={12} className="mr-1" />
                          重置
                        </button>
                        <button 
                          onClick={() => {
                            const url = `${window.location.origin}/?table=${table.number}&token=${table.sessionToken}`;
                            window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`, '_blank');
                          }}
                          className="flex-1 bg-red-600 text-white py-2 rounded-xl text-[0.6rem] font-bold hover:bg-red-700 transition-colors flex items-center justify-center shadow-md shadow-red-50"
                        >
                          <QrCode size={12} className="mr-1" />
                          二维码
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full">
              <div className="mb-6">
                <h2 className="text-lg font-black text-gray-800">系统设置</h2>
                <p className="text-gray-400 text-[0.65rem] mt-0.5">配置应用全局显示参数、语言与货币</p>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-8">
                {/* Restaurant Name */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-gray-800 flex items-center">
                    <ClipboardList size={16} className="mr-2 text-red-600" />
                    餐厅名称
                  </h3>
                  <div className="flex space-x-2">
                    <input 
                      type="text"
                      value={localRestaurantName}
                      onChange={(e) => setLocalRestaurantName(e.target.value)}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-600 transition-colors"
                    />
                    <button
                      onClick={async () => {
                        try {
                          await setDoc(doc(db, 'settings', 'global'), { restaurantName: localRestaurantName }, { merge: true });
                          showToast('餐厅名称已保存', 'success');
                        } catch (error) {
                          handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                        }
                      }}
                      className="bg-red-600 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg shadow-red-100 active:scale-95 transition-all"
                    >
                      保存
                    </button>
                  </div>
                </div>

                {/* Currency Selection */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-gray-800 flex items-center">
                    <DollarSign size={16} className="mr-2 text-red-600" />
                    结算货币 (SKU)
                  </h3>
                  <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100 w-full">
                    {(['KRW', 'CNY', 'USD'] as const).map(curr => (
                      <button
                        key={curr}
                        onClick={async () => {
                          setAppSettings(prev => ({ ...prev, currency: curr }));
                          try {
                            await setDoc(doc(db, 'settings', 'global'), { currency: curr }, { merge: true });
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                          }
                        }}
                        className={`flex-1 h-10 rounded-lg font-black text-xs transition-all ${appSettings.currency === curr ? 'bg-red-600 text-white shadow-lg shadow-red-100 scale-105' : 'text-gray-400'}`}
                      >
                        {curr === 'KRW' ? '₩ 韩币' : curr === 'CNY' ? '¥ 人民币' : '$ 美元'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language Selection */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-gray-800 flex items-center">
                    <Languages size={16} className="mr-2 text-red-600" />
                    默认语言
                  </h3>
                  <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100 w-full">
                    {(['zh', 'en', 'ko'] as const).map(lang => (
                      <button
                        key={lang}
                        onClick={async () => {
                          setAppSettings(prev => ({ ...prev, language: lang }));
                          try {
                            await setDoc(doc(db, 'settings', 'global'), { language: lang }, { merge: true });
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                          }
                        }}
                        className={`flex-1 h-10 rounded-lg font-black text-xs transition-all ${appSettings.language === lang ? 'bg-red-600 text-white shadow-lg shadow-red-100 scale-105' : 'text-gray-400'}`}
                      >
                        {lang === 'zh' ? '中文' : lang === 'en' ? 'English' : '한국어'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid Columns Selection */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-gray-800 flex items-center">
                    <LayoutGrid size={16} className="mr-2 text-red-600" />
                    菜单显示列数
                  </h3>
                  <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100 w-full">
                    {[2, 3, 4].map(cols => (
                      <button
                        key={cols}
                        onClick={() => handleUpdateGridColumns(cols)}
                        className={`flex-1 h-10 rounded-lg font-black text-xs transition-all ${gridColumns === cols ? 'bg-red-600 text-white shadow-lg shadow-red-100 scale-105' : 'text-gray-400'}`}
                      >
                        {cols} 列
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start space-x-3">
                  <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[0.6rem] font-bold mt-0.5 flex-shrink-0">i</div>
                  <p className="text-[0.65rem] text-blue-700 leading-relaxed">
                    国际化提示：修改货币将影响所有菜品的价格显示符号。修改语言将影响系统默认的文本提示。
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingDish && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingDish(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              className="bg-white w-full h-full rounded-t-[2rem] overflow-hidden shadow-2xl relative z-10 flex flex-col"
            >
              <form onSubmit={handleSaveDish} className="p-6 flex-1 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black">{editingDish.id ? '编辑菜品' : '新增菜品'}</h2>
                  <button type="button" onClick={() => setEditingDish(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
                    <h3 className="text-[0.65rem] font-black text-gray-400 uppercase tracking-widest flex items-center">
                      <Languages size={12} className="mr-1" />
                      多语言名称 (SKU)
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-gray-400">中文 (默认)</label>
                        <input 
                          required
                          type="text" 
                          value={editingDish.name || ''}
                          onChange={e => setEditingDish({ ...editingDish, name: e.target.value })}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-red-600 transition-colors"
                          placeholder="例如: 经典香辣烤鱼"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-gray-400">English</label>
                        <input 
                          type="text" 
                          value={editingDish.name_en || ''}
                          onChange={e => setEditingDish({ ...editingDish, name_en: e.target.value })}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-red-600 transition-colors"
                          placeholder="Classic Spicy Grilled Fish"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-gray-400">한국어</label>
                        <input 
                          type="text" 
                          value={editingDish.name_ko || ''}
                          onChange={e => setEditingDish({ ...editingDish, name_ko: e.target.value })}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-red-600 transition-colors"
                          placeholder="클래식 매운 구운 생선"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center">
                        <DollarSign size={12} className="mr-1" />
                        价格 ({appSettings.currency === 'KRW' ? '₩' : appSettings.currency === 'CNY' ? '¥' : '$'})
                      </label>
                      <input 
                        required
                        type="number" 
                        value={editingDish.price || 0}
                        onChange={e => setEditingDish({ ...editingDish, price: Number(e.target.value) })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-600 transition-colors text-sm font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center">
                        <Zap size={12} className="mr-1" />
                        库存数量 (可选)
                      </label>
                      <input 
                        type="number" 
                        value={editingDish.stock ?? ''}
                        onChange={e => setEditingDish({ ...editingDish, stock: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-600 transition-colors text-sm font-bold"
                        placeholder="不填则不限"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center">
                      <LayoutGrid size={12} className="mr-1" />
                      所属分类
                    </label>
                    <select 
                      required
                      value={editingDish.category || ''}
                      onChange={e => setEditingDish({ ...editingDish, category: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-600 transition-colors appearance-none text-sm font-bold"
                    >
                      <option value="" disabled>选择分类</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
                    <h3 className="text-[0.65rem] font-black text-gray-400 uppercase tracking-widest flex items-center">
                      <ClipboardList size={12} className="mr-1" />
                      多语言描述
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-gray-400">中文描述</label>
                        <textarea 
                          value={editingDish.description || ''}
                          onChange={e => setEditingDish({ ...editingDish, description: e.target.value })}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-red-600 transition-colors h-16 resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-gray-400">English Description</label>
                        <textarea 
                          value={editingDish.description_en || ''}
                          onChange={e => setEditingDish({ ...editingDish, description_en: e.target.value })}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-red-600 transition-colors h-16 resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-gray-400">한국어 설명</label>
                        <textarea 
                          value={editingDish.description_ko || ''}
                          onChange={e => setEditingDish({ ...editingDish, description_ko: e.target.value })}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-red-600 transition-colors h-16 resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">图片链接</label>
                    <div className="flex space-x-3">
                      <input 
                        type="text" 
                        value={editingDish.image || ''}
                        onChange={e => setEditingDish({ ...editingDish, image: e.target.value })}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-600 transition-colors"
                        placeholder="https://..."
                      />
                      <div className="w-12 aspect-square bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden border border-gray-200">
                        {editingDish.image ? <img src={editingDish.image} className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-300" />}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">菜品描述</label>
                    <textarea 
                      value={editingDish.description || ''}
                      onChange={e => setEditingDish({ ...editingDish, description: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-600 transition-colors h-24 resize-none"
                      placeholder="简单介绍一下这道菜..."
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">规格与加料 (Modifiers)</label>
                      <button 
                        type="button"
                        onClick={() => {
                          const newModifiers = [...(editingDish.modifiers || []), { name: '', price: 0 }];
                          setEditingDish({ ...editingDish, modifiers: newModifiers });
                        }}
                        className="text-red-600 text-[0.65rem] font-black flex items-center"
                      >
                        <Plus size={14} className="mr-1" />
                        添加规格
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {(editingDish.modifiers || []).map((mod, idx) => (
                        <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 space-y-1">
                              <label className="text-[0.4rem] font-bold text-gray-400 uppercase">分组 (如: 辣度) & 必选</label>
                              <div className="flex items-center space-x-2">
                                <input 
                                  type="text" 
                                  value={mod.group || ''}
                                  onChange={e => {
                                    const newModifiers = [...(editingDish.modifiers || [])];
                                    newModifiers[idx].group = e.target.value;
                                    setEditingDish({ ...editingDish, modifiers: newModifiers });
                                  }}
                                  className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[0.6rem] outline-none focus:border-red-600"
                                  placeholder="分组名称"
                                />
                                <label className="flex items-center space-x-1 cursor-pointer">
                                  <input 
                                    type="checkbox"
                                    checked={mod.groupRequired || false}
                                    onChange={e => {
                                      const newModifiers = [...(editingDish.modifiers || [])];
                                      newModifiers[idx].groupRequired = e.target.checked;
                                      setEditingDish({ ...editingDish, modifiers: newModifiers });
                                    }}
                                    className="w-3 h-3 rounded text-red-600 focus:ring-red-500"
                                  />
                                  <span className="text-[0.5rem] font-bold text-gray-500">必选</span>
                                </label>
                              </div>
                            </div>
                            <div className="flex-1 space-y-1">
                              <label className="text-[0.4rem] font-bold text-gray-400 uppercase">名称 (中/EN/KO)</label>
                              <div className="grid grid-cols-3 gap-1.5">
                                <input 
                                  type="text" 
                                  value={mod.name}
                                  onChange={e => {
                                    const newModifiers = [...(editingDish.modifiers || [])];
                                    newModifiers[idx].name = e.target.value;
                                    setEditingDish({ ...editingDish, modifiers: newModifiers });
                                  }}
                                  className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[0.6rem] outline-none focus:border-red-600"
                                  placeholder="中文"
                                />
                                <input 
                                  type="text" 
                                  value={mod.name_en || ''}
                                  onChange={e => {
                                    const newModifiers = [...(editingDish.modifiers || [])];
                                    newModifiers[idx].name_en = e.target.value;
                                    setEditingDish({ ...editingDish, modifiers: newModifiers });
                                  }}
                                  className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[0.6rem] outline-none focus:border-red-600"
                                  placeholder="EN"
                                />
                                <input 
                                  type="text" 
                                  value={mod.name_ko || ''}
                                  onChange={e => {
                                    const newModifiers = [...(editingDish.modifiers || [])];
                                    newModifiers[idx].name_ko = e.target.value;
                                    setEditingDish({ ...editingDish, modifiers: newModifiers });
                                  }}
                                  className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[0.6rem] outline-none focus:border-red-600"
                                  placeholder="KO"
                                />
                              </div>
                            </div>
                            <div className="w-24 space-y-1">
                              <label className="text-[0.4rem] font-bold text-gray-400 uppercase">加价</label>
                              <div className="flex items-center bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                                <span className="text-[0.65rem] text-gray-400 mr-1">{appSettings.currency === 'KRW' ? '₩' : appSettings.currency === 'CNY' ? '¥' : '$'}</span>
                                <input 
                                  type="number" 
                                  value={mod.price}
                                  onChange={e => {
                                    const newModifiers = [...(editingDish.modifiers || [])];
                                    newModifiers[idx].price = Number(e.target.value);
                                    setEditingDish({ ...editingDish, modifiers: newModifiers });
                                  }}
                                  className="w-full text-[0.65rem] outline-none font-bold"
                                />
                              </div>
                            </div>
                            <button 
                              type="button"
                              onClick={() => {
                                const newModifiers = (editingDish.modifiers || []).filter((_, i) => i !== idx);
                                setEditingDish({ ...editingDish, modifiers: newModifiers });
                              }}
                              className="text-gray-300 hover:text-red-600 transition-colors pt-4"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(editingDish.modifiers || []).length === 0 && (
                        <div className="text-center py-4 border-2 border-dashed border-gray-100 rounded-2xl text-[0.65rem] text-gray-400">
                          暂无规格，点击上方“添加规格”开始配置
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-6 pt-2">
                    <label className="flex items-center space-x-2 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          checked={editingDish.isRecommended || false}
                          onChange={e => setEditingDish({ ...editingDish, isRecommended: e.target.checked })}
                          className="sr-only"
                        />
                        <div className={`w-10 h-6 rounded-full transition-colors ${editingDish.isRecommended ? 'bg-red-600' : 'bg-gray-200'}`} />
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editingDish.isRecommended ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className="text-xs font-bold text-gray-600">店长推荐</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          checked={editingDish.isSoldOut || false}
                          onChange={e => setEditingDish({ ...editingDish, isSoldOut: e.target.checked })}
                          className="sr-only"
                        />
                        <div className={`w-10 h-6 rounded-full transition-colors ${editingDish.isSoldOut ? 'bg-gray-800' : 'bg-gray-200'}`} />
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editingDish.isSoldOut ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className="text-xs font-bold text-gray-600">设为估清</span>
                    </label>
                  </div>
                </div>

                <div className="mt-10 flex space-x-4">
                  <button 
                    type="button"
                    onClick={() => setEditingDish(null)}
                    className="flex-1 py-4 rounded-2xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 rounded-2xl font-bold text-white bg-red-600 shadow-lg shadow-red-100 hover:bg-red-700 transition-colors"
                  >
                    保存修改
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {editingCategory && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingCategory(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl relative z-10"
            >
              <form onSubmit={handleSaveCategory} className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold">{editingCategory.id ? '编辑分类' : '新增分类'}</h2>
                  <button type="button" onClick={() => setEditingCategory(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">分类名称</label>
                    <input 
                      required
                      type="text" 
                      autoFocus
                      value={editingCategory.name || ''}
                      onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-600 transition-colors"
                      placeholder="例如: 招牌烤鱼"
                    />
                  </div>
                </div>

                <div className="mt-10 flex space-x-4">
                  <button 
                    type="button"
                    onClick={() => setEditingCategory(null)}
                    className="flex-1 py-4 rounded-2xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 rounded-2xl font-bold text-white bg-red-600 shadow-lg shadow-red-100 hover:bg-red-700 transition-colors"
                  >
                    保存
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {itemToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setItemToDelete(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl relative z-10 p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">确认删除</h3>
              <p className="text-gray-500 mb-8">
                确定要删除{itemToDelete.type === 'dish' ? '菜品' : '分类'} "{itemToDelete.name}" 吗？此操作不可撤销。
              </p>
              <div className="flex space-x-4">
                <button 
                  onClick={() => setItemToDelete(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    if (itemToDelete.type === 'dish') handleDeleteDish(itemToDelete.id);
                    else if (itemToDelete.type === 'category') handleDeleteCategory(itemToDelete.id);
                    else if (itemToDelete.type === 'order') handleDeleteOrder(itemToDelete.id);
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-20 left-4 right-4 z-[200] flex justify-center pointer-events-none"
          >
            <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 pointer-events-auto ${
              toast.type === 'success' ? 'bg-green-600' : 
              toast.type === 'error' ? 'bg-red-600' : 'bg-gray-800'
            } text-white`} id="admin-toast">
              {toast.type === 'success' ? <CheckCircle2 size={18} /> : 
               toast.type === 'error' ? <AlertTriangle size={18} /> : <Bell size={18} />}
              <span className="text-sm font-bold">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Order Alert */}
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
              <p className="text-xs text-white/80">请立即前往订单管理处理</p>
            </div>
            <button 
              onClick={() => {
                setShowNewOrderAlert(false);
                setView('orders');
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
        </>
      )}
    </div>
  );
}
