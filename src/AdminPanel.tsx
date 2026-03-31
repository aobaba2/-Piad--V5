import React, { useState, useEffect, useRef } from 'react';
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
  LayoutGrid,
  LogOut
} from 'lucide-react';
import { Dish, DishModifier, formatPrice, Table, Settings as AppSettings } from './constants';
import { initializeApp } from 'firebase/app';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getAuth,
  User as FirebaseUser
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { db, auth } from './firebase';
import StaffPanel from './StaffPanel';
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
  getDoc,
  serverTimestamp
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

interface StaffMember {
  id: string;
  username: string;
  email: string;
  role: 'owner' | 'manager' | 'waiter';
  permissions: string[];
  password?: string;
}

interface Order {
  id: string;
  tableNumber: string;
  items: OrderItem[];
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'served' | 'completed' | 'cancelled';
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
  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'manager' | 'waiter'>('waiter');
  const [newStaffPermissions, setNewStaffPermissions] = useState<string[]>(['orders']);
  const [tables, setTables] = useState<Table[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    currency: 'KRW',
    language: 'zh',
    restaurantName: 'PIAD 点餐',
    searchPlaceholders: [],
    coverHistory: '',
    coverAddress: '',
    coverPhone: '',
    coverImage: ''
  });
  const [localRestaurantName, setLocalRestaurantName] = useState('PIAD 点餐');
  const lastOrderCountRef = useRef(0);

  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(auth.currentUser);

  // Super Admin Login State
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Audio notification for pending orders - removed looping audio to avoid conflict with voice
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [userRole, setUserRole] = useState<'owner' | 'manager' | 'waiter'>('waiter');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [gridColumns, setGridColumns] = useState(3);
  const isReorderingRef = React.useRef(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!user) return;

    // Fetch user role
    const fetchUserRole = async () => {
      if (!auth.currentUser) return;
      
      // Default admin check
      if (auth.currentUser.email === 'yujianfei2016@gmail.com' || auth.currentUser.email === 'aoba2026@admin.com') {
        setUserRole('owner');
        setUserPermissions(['orders', 'menu', 'analytics', 'access', 'tables', 'settings']);
        return;
      }

      try {
        if (auth.currentUser.email) {
          const staffDoc = await getDoc(doc(db, 'staff', auth.currentUser.email));
          if (staffDoc.exists()) {
            const data = staffDoc.data();
            setUserRole(data.role || 'waiter');
            setUserPermissions(data.permissions || (data.role === 'manager' ? ['orders', 'menu', 'analytics', 'tables'] : ['orders']));
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
        const newSettings: AppSettings = {
          currency: data.currency || 'KRW',
          language: data.language || 'zh',
          restaurantName: data.restaurantName || 'PIAD 点餐',
          theme: data.theme || 'default',
          searchPlaceholders: data.searchPlaceholders || [],
          coverHistory: data.coverHistory || '',
          coverAddress: data.coverAddress || '',
          coverPhone: data.coverPhone || '',
          coverImage: data.coverImage || ''
        };
        setAppSettings(newSettings);
        setLocalRestaurantName(data.restaurantName || 'PIAD 点餐');
        setGridColumns(data.gridColumns || 3);
        
        // Apply theme to body
        document.body.className = `theme-${newSettings.theme}`;
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
      
      if (ordersData.length > lastOrderCountRef.current && lastOrderCountRef.current !== 0) {
        setShowNewOrderAlert(true);
        // Voice reminder
        try {
          // Play a short notification sound first
          const ding = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          ding.volume = 0.5;
          ding.play().catch(e => console.log('Ding failed', e));

          const messages = [
            '叮咚！新的美味订单来啦，请老板快快查看哦~',
            '嘿！主人，又有客人下单啦，加油加油！',
            '哇！一份热腾腾的订单飞过来啦，请查收~'
          ];
          const randomMsg = messages[Math.floor(Math.random() * messages.length)];
          
          // Cancel any ongoing speech
          window.speechSynthesis.cancel();
          
          const utterance = new SpeechSynthesisUtterance(randomMsg);
          utterance.lang = 'zh-CN';
          
          // Try to find a Chinese voice explicitly
          const voices = window.speechSynthesis.getVoices();
          const chineseVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
          if (chineseVoice) {
            utterance.voice = chineseVoice;
          }
          
          utterance.rate = 1.0; 
          utterance.pitch = 1.1;
          
          // Some browsers need a small delay after cancel
          setTimeout(() => {
            window.speechSynthesis.speak(utterance);
          }, 200);
        } catch (e) {
          console.log('Voice synthesis failed');
        }
      }
      lastOrderCountRef.current = ordersData.length;
      setOrders(ordersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });

    return () => {
      unsubscribeSettings();
      unsubscribeCats();
      unsubscribeDishes();
      unsubscribeOrders();
      unsubscribeTables();
    };
  }, [user]);

  useEffect(() => {
    if (!user || userRole === 'waiter') return;

    const unsubscribeStaff = onSnapshot(collection(db, 'staff'), (snapshot) => {
      const staffData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StaffMember[];
      setStaff(staffData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'staff');
    });

    return () => unsubscribeStaff();
  }, [user, userRole]);

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
      const normalizedUsername = adminUsername.trim().toLowerCase();
      let email = normalizedUsername.includes('@') ? normalizedUsername : `${normalizedUsername}@admin.com`;
      
      // Check if it's a staff member by username
      if (!normalizedUsername.includes('@') && normalizedUsername !== 'aoba2026') {
        email = `${normalizedUsername}@staff.piad`;
      }

      try {
        await signInWithEmailAndPassword(auth, email, adminPassword);
      } catch (err: any) {
        // If user not found OR invalid credential (new Firebase security behavior)
        // and it's the requested super admin, try to create it
        if ((err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') && normalizedUsername === 'aoba2026') {
          try {
            await createUserWithEmailAndPassword(auth, email, adminPassword);
            showToast('管理员账号已初始化并登录', 'success');
          } catch (createErr: any) {
            // If creation fails because it already exists, then it's a real wrong password error
            if (createErr.code === 'auth/email-already-in-use') {
              throw err; // Throw the original sign-in error (wrong password)
            }
            throw createErr;
          }
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
      } else if (error.code === 'auth/operation-not-allowed') {
        setLoginError('登录方式未启用：请在 Firebase 控制台启用 邮箱/密码 登录');
      } else if (error.code === 'auth/unauthorized-domain') {
        setLoginError('域名未授权：请在 Firebase 控制台将 piad5.vercel.app 添加到授权域名列表');
      } else {
        setLoginError(`登录失败: ${error.message || '请稍后再试'}`);
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

  if (!user) {
    return (
      <div className="fixed inset-0 bg-piad-bg z-[100] flex flex-col overflow-hidden text-piad-text">
        <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-piad-primary/5 to-piad-bg">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-piad-card rounded-piad shadow-piad overflow-hidden border border-piad-primary/5"
          >
            <div className="p-10">
              <div className="w-20 h-20 bg-piad-primary rounded-piad flex items-center justify-center mb-8 shadow-xl shadow-piad-primary/20 mx-auto">
                <ShieldCheck className="text-white" size={40} />
              </div>
              <h2 className="text-3xl font-black text-center mb-2 text-piad-text">后台管理登录</h2>
              <p className="text-piad-subtext text-center mb-10 font-medium">PIAD 点餐系统管理后台</p>

              <form onSubmit={handleSuperAdminLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-piad-subtext uppercase ml-1">用户名</label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-piad-subtext" size={18} />
                    <input 
                      type="text"
                      required
                      value={adminUsername}
                      onChange={e => setAdminUsername(e.target.value)}
                      placeholder="请输入管理员账号"
                      className="w-full bg-piad-primary/5 border border-piad-primary/5 rounded-piad pl-12 pr-4 py-4 outline-none focus:border-piad-primary focus:bg-piad-card transition-all font-medium text-piad-text"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-piad-subtext uppercase ml-1">密码</label>
                  <div className="relative">
                    <Zap className="absolute left-4 top-1/2 -translate-y-1/2 text-piad-subtext" size={18} />
                    <input 
                      type="password"
                      required
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      placeholder="请输入登录密码"
                      className="w-full bg-piad-primary/5 border border-piad-primary/5 rounded-piad pl-12 pr-4 py-4 outline-none focus:border-piad-primary focus:bg-piad-card transition-all font-medium text-piad-text"
                    />
                  </div>
                </div>

                {loginError && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center space-x-2 text-red-600 bg-red-50 p-4 rounded-piad text-sm font-bold"
                  >
                    <AlertTriangle size={16} />
                    <span>{loginError}</span>
                  </motion.div>
                )}

                <button 
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-piad-primary text-white py-4 rounded-piad font-black shadow-xl shadow-piad-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
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

              <div className="mt-10 pt-8 border-t border-piad-border">
                <p className="text-center text-[10px] text-piad-subtext font-bold mb-4 uppercase tracking-widest">注意：请确保 Firebase 控制台已启用 邮箱/密码 登录方式</p>
                <p className="text-center text-xs text-piad-subtext font-bold mb-6 uppercase tracking-widest">或者使用</p>
                <button 
                  onClick={handleGoogleLogin}
                  className="w-full bg-piad-card border-2 border-piad-border text-piad-subtext py-4 rounded-piad font-bold hover:bg-piad-bg active:scale-[0.98] transition-all flex items-center justify-center space-x-3"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  <span>Google 账号登录</span>
                </button>
              </div>
            </div>
          </motion.div>
          
          <button 
            onClick={onClose}
            className="fixed top-6 right-6 w-12 h-12 bg-piad-card rounded-full shadow-piad flex items-center justify-center text-piad-subtext hover:text-piad-text transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      </div>
    );
  }

  if (isSimpleMode) {
    return <StaffPanel onClose={() => setIsSimpleMode(false)} />;
  }

  return (
    <div className="fixed inset-0 bg-piad-bg z-[100] flex flex-col overflow-hidden text-piad-text">
      {/* Admin Header */}
      <header className="h-14 bg-piad-card/80 backdrop-blur-md border-b border-piad-border flex items-center justify-between px-4 shadow-piad flex-shrink-0 sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-piad-primary/5 rounded-full transition-colors text-piad-subtext"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-black flex items-center text-piad-text">
            <Settings className="mr-2 text-piad-primary" size={18} />
            后台管理
            {user?.email === 'aoba2026@admin.com' && (
              <span className="ml-2 bg-piad-primary/10 text-piad-primary text-[0.6rem] px-2 py-0.5 rounded-full border border-piad-primary/20">
                超级管理员
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-piad-primary/5 rounded-piad transition-colors text-piad-subtext hover:text-piad-primary"
            title="退出登录"
          >
            <LogOut size={18} />
          </button>
          <button 
            onClick={() => {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance('语音功能已开启，祝您生意兴隆！');
              utterance.lang = 'zh-CN';
              window.speechSynthesis.speak(utterance);
              showToast('语音测试中...', 'info');
            }}
            className="p-2 hover:bg-piad-primary/5 rounded-piad transition-colors text-piad-subtext hover:text-piad-primary"
            title="测试语音"
          >
            <Bell size={18} />
          </button>
          {view === 'menu' && (
            <button 
              onClick={() => setEditingDish({ name: '', price: 0, category: categories[0]?.name || '', description: '', tags: [] })}
              className="bg-piad-primary text-white px-3 py-1.5 rounded-piad font-bold text-xs flex items-center shadow-piad active:scale-95 transition-all"
            >
              <Plus size={14} className="mr-1" />
              新增
            </button>
          )}
          <button 
            onClick={() => setIsSimpleMode(true)}
            className="p-2 hover:bg-piad-primary/5 rounded-piad transition-colors text-piad-subtext hover:text-piad-primary"
            title="极简模式"
          >
            <LayoutGrid size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Admin Navigation - Horizontal Scroll */}
        <nav className="bg-piad-card/80 backdrop-blur-md border-b border-piad-border px-4 py-2 flex items-center space-x-2 overflow-x-auto no-scrollbar flex-shrink-0 sticky top-0 z-40">
          <button 
            onClick={() => setView('orders')}
            className={`flex-shrink-0 flex items-center px-4 py-2 rounded-piad text-xs font-bold transition-all ${view === 'orders' ? 'bg-piad-primary text-white shadow-piad' : 'text-piad-subtext bg-piad-primary/5'}`}
          >
            <Zap size={14} className="mr-2" />
            实时看板
            {orders.filter(o => o.status === 'pending').length > 0 && (
              <span className="ml-2 bg-white text-piad-primary w-4 h-4 rounded-full flex items-center justify-center text-[0.5rem] font-black animate-pulse">
                {orders.filter(o => o.status === 'pending').length}
              </span>
            )}
          </button>
          {userPermissions.includes('menu') && (
            <button 
              onClick={() => {
                setView('menu');
                setActiveCategory(null);
              }}
              className={`flex-shrink-0 flex items-center px-4 py-2 rounded-piad text-xs font-bold transition-all ${view === 'menu' && !activeCategory ? 'bg-piad-primary text-white shadow-piad' : 'text-piad-subtext bg-piad-primary/5'}`}
            >
              <ImageIcon size={14} className="mr-2" />
              智能菜单
            </button>
          )}
          {userPermissions.includes('analytics') && (
            <button 
              onClick={() => setView('analytics')}
              className={`flex-shrink-0 flex items-center px-4 py-2 rounded-piad text-xs font-bold transition-all ${view === 'analytics' ? 'bg-piad-primary text-white shadow-piad' : 'text-piad-subtext bg-piad-primary/5'}`}
            >
              <TrendingUp size={14} className="mr-2" />
              数据中心
            </button>
          )}
          {userPermissions.includes('access') && (
            <button 
              onClick={() => setView('access')}
              className={`flex-shrink-0 flex items-center px-4 py-2 rounded-piad text-xs font-bold transition-all ${view === 'access' ? 'bg-piad-primary text-white shadow-piad' : 'text-piad-subtext bg-piad-primary/5'}`}
            >
              <ShieldCheck size={14} className="mr-2" />
              权限安全
            </button>
          )}
          {userPermissions.includes('tables') && (
            <button 
              onClick={() => setView('tables')}
              className={`flex-shrink-0 flex items-center px-4 py-2 rounded-piad text-xs font-bold transition-all ${view === 'tables' ? 'bg-piad-primary text-white shadow-piad' : 'text-piad-subtext bg-piad-primary/5'}`}
            >
              <QrCode size={14} className="mr-2" />
              桌位管理
            </button>
          )}
          {userPermissions.includes('settings') && (
            <button 
              onClick={() => setView('settings')}
              className={`flex-shrink-0 flex items-center px-4 py-2 rounded-piad text-xs font-bold transition-all ${view === 'settings' ? 'bg-piad-primary text-white shadow-piad' : 'text-piad-subtext bg-piad-primary/5'}`}
            >
              <Settings size={14} className="mr-2" />
              系统设置
            </button>
          )}
        </nav>

        {/* Content Area */}
        <main className="flex-1 p-4 overflow-y-auto bg-piad-bg/50 no-scrollbar">
          {view === 'orders' ? (
            <div className="w-full">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-piad-text">实时订单</h2>
                  <p className="text-piad-subtext text-[0.65rem] mt-0.5">第一时间掌握每桌客人的点餐动态</p>
                </div>
                <div className="flex items-center space-x-2 bg-piad-card px-3 py-1.5 rounded-piad border border-piad-border shadow-piad">
                  <div className="w-1.5 h-1.5 rounded-full bg-piad-primary animate-pulse" />
                  <span className="text-[0.65rem] font-bold text-piad-subtext">监听中</span>
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
                      className={`bg-piad-card rounded-piad p-5 border transition-all flex flex-col ${
                        order.status === 'pending' ? 'border-piad-primary shadow-piad ring-2 ring-piad-primary/10' : 'border-piad-border shadow-piad'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-12 h-12 rounded-piad flex items-center justify-center font-black text-xl ${
                            order.status === 'pending' 
                              ? 'bg-piad-primary text-white shadow-piad' 
                              : 'bg-piad-primary/5 text-piad-text'
                          }`}>
                            {order.tableNumber}
                          </div>
                          <div>
                            <h3 className="font-black text-base text-piad-text">桌号 {order.tableNumber}</h3>
                            <p className="text-xs text-piad-subtext">
                              {order.createdAt ? (
                                typeof order.createdAt === 'string' 
                                  ? new Date(order.createdAt).toLocaleTimeString()
                                  : (order.createdAt as any).toDate?.().toLocaleTimeString() || ''
                              ) : '刚刚'}
                            </p>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                          order.status === 'pending' ? 'bg-piad-primary/10 text-piad-primary' :
                          order.status === 'confirmed' ? 'bg-piad-primary/20 text-piad-primary border border-piad-primary/30' :
                          order.status === 'preparing' ? 'bg-piad-accent/10 text-piad-accent' :
                          order.status === 'served' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {order.status === 'pending' ? '待确认' : 
                           order.status === 'confirmed' ? '已确认' : 
                           order.status === 'preparing' ? '制作中' : 
                           order.status === 'served' ? '待配送' : '已完成'}
                        </div>
                      </div>

                      {/* Order items list */}
                      <div className="flex-1 bg-piad-bg rounded-piad p-3 mb-4 space-y-2 overflow-y-auto max-h-40 no-scrollbar">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <div className="flex-1">
                              <span className="font-bold text-piad-text">{item.name}</span>
                              {item.modifiers && item.modifiers.length > 0 && (
                                <div className="text-xs text-piad-subtext mt-0.5">
                                  {item.modifiers.map(m => m.name).join(', ')}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-3 ml-2">
                              <span className="text-piad-subtext font-medium">x{item.quantity}</span>
                              <span className="font-bold text-piad-text w-16 text-right">{formatPrice(item.price * item.quantity)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-piad-border">
                        <div className="text-lg font-black text-piad-primary">
                          {formatPrice(order.totalPrice)}
                        </div>
                        <div className="flex space-x-2">
                          {order.status === 'pending' && (
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.id, 'confirmed')}
                              className="bg-piad-primary text-white px-4 py-2.5 rounded-piad text-sm font-black shadow-piad active:scale-95 transition-all flex items-center"
                            >
                              <CheckCircle2 size={16} className="mr-1.5" />
                              确认订单
                            </button>
                          )}
                          {order.status === 'confirmed' && (
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                              className="bg-piad-accent text-white px-4 py-2.5 rounded-piad text-sm font-black shadow-piad active:scale-95 transition-all flex items-center"
                            >
                              <ChefHat size={16} className="mr-1.5" />
                              开始制作
                            </button>
                          )}
                          {order.status === 'preparing' && (
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.id, 'served')}
                              className="bg-blue-500 text-white px-4 py-2.5 rounded-piad text-sm font-black shadow-piad active:scale-95 transition-all flex items-center"
                            >
                              <Bell size={16} className="mr-1.5" />
                              呼叫配送
                            </button>
                          )}
                          {order.status === 'served' && (
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.id, 'completed')}
                              className="bg-green-600 text-white px-4 py-2.5 rounded-piad text-sm font-black shadow-piad active:scale-95 transition-all flex items-center"
                            >
                              <CheckCircle2 size={16} className="mr-1.5" />
                              完成订单
                            </button>
                          )}
                          <button 
                            onClick={() => setItemToDelete({ id: order.id, name: `桌号 ${order.tableNumber} 的订单`, type: 'order' })}
                            className="p-2.5 bg-piad-primary/5 rounded-piad text-piad-subtext hover:text-piad-primary hover:bg-piad-primary/10 transition-colors"
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
                  <div className="w-24 h-24 bg-piad-card rounded-full flex items-center justify-center text-piad-subtext/20 mb-6 shadow-piad">
                    <ClipboardList size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-piad-text mb-2">暂无新订单</h3>
                  <p className="text-piad-subtext">当客人下单后，这里会第一时间显示</p>
                </div>
              )}
            </div>
          ) : view === 'menu' ? (
            <div className="w-full">
              <div className="mb-6 flex flex-col gap-4">
                <div>
                  <div className="flex items-center space-x-3">
                    <h2 className="text-lg font-black text-piad-text">
                      {activeCategory || '全部菜品'} 
                      <span className="text-[0.65rem] font-normal text-piad-subtext ml-1">({filteredDishes.length})</span>
                    </h2>
                    {activeCategory && (
                      <button 
                        onClick={handleResetDishOrder}
                        className="flex items-center space-x-1 text-[0.65rem] font-bold text-piad-subtext hover:text-piad-primary transition-colors bg-piad-card px-2 py-1 rounded-piad border border-piad-border shadow-piad"
                      >
                        <RotateCcw size={12} />
                        <span>重置排序</span>
                      </button>
                    )}
                  </div>
                  <p className="text-piad-subtext text-[0.65rem] mt-0.5">管理菜单项和分类</p>
                </div>
                
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-piad-subtext" size={14} />
                  <input 
                    type="text"
                    placeholder="搜索菜品名称..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-piad-card border border-piad-border rounded-piad outline-none focus:border-piad-primary text-sm shadow-piad text-piad-text"
                  />
                </div>

                {/* Category Quick Switch for Menu View */}
                <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
                  <button 
                    onClick={() => setActiveCategory(null)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-piad text-[0.65rem] font-bold transition-all ${!activeCategory ? 'bg-piad-primary text-white shadow-piad' : 'bg-piad-card text-piad-subtext border border-piad-border'}`}
                  >
                    全部
                  </button>
                  {categories.map(cat => (
                    <button 
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.name)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-piad text-[0.65rem] font-bold transition-all ${activeCategory === cat.name ? 'bg-piad-primary text-white shadow-piad' : 'bg-piad-card text-piad-subtext border border-piad-border'}`}
                    >
                      {cat.name}
                    </button>
                  ))}
                  <button 
                    onClick={() => setEditingCategory({ id: '', name: '', order: categories.length })}
                    className="flex-shrink-0 w-8 h-8 rounded-piad bg-piad-bg flex items-center justify-center text-piad-subtext"
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
                    className="bg-piad-card rounded-piad shadow-piad border border-piad-border overflow-hidden group active:scale-[0.98] transition-all cursor-grab active:cursor-grabbing flex flex-col"
                  >
                    <div className="relative w-full aspect-square overflow-hidden bg-piad-bg">
                      <img src={dish.image} alt={dish.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      {dish.isRecommended && (
                        <div className="absolute top-2 left-2 bg-piad-primary text-white text-[0.65rem] font-black px-2 py-1 rounded-piad shadow-piad">
                          推荐
                        </div>
                      )}
                      {dish.isSoldOut && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[2px]">
                          <span className="bg-piad-text text-white px-3 py-1.5 rounded-piad text-sm font-black shadow-piad">已估清</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 p-1.5 bg-piad-card/80 backdrop-blur-md rounded-piad text-piad-subtext shadow-piad cursor-grab active:cursor-grabbing">
                        <GripVertical size={14} />
                      </div>
                    </div>
                    
                    <div className="p-3 flex-1 flex flex-col">
                      <h3 className="font-black text-piad-text text-sm line-clamp-1 mb-1">{dish.name}</h3>
                      <span className="text-piad-primary font-black text-sm mb-2">{formatPrice(dish.price)}</span>
                      
                      <div className="flex flex-wrap gap-1 mb-3">
                        <span className="text-[0.65rem] bg-piad-bg text-piad-subtext px-1.5 py-0.5 rounded-md font-bold">
                          {dish.category}
                        </span>
                        {dish.modifiers && dish.modifiers.length > 0 && (
                          <span className="text-[0.65rem] bg-piad-primary/10 text-piad-primary px-1.5 py-0.5 rounded-md font-bold">
                            {dish.modifiers.length} 个规格
                          </span>
                        )}
                      </div>
                      
                      <div className="mt-auto flex items-center justify-end space-x-1 pt-2 border-t border-piad-border">
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
                          className={`p-1.5 rounded-piad transition-colors ${dish.isSoldOut ? 'text-piad-primary bg-piad-primary/10' : 'text-piad-subtext hover:bg-piad-bg'}`}
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
                            className="p-1.5 text-piad-subtext hover:text-piad-primary hover:bg-piad-primary/10 rounded-piad transition-colors"
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
                            className="p-1.5 text-piad-subtext hover:text-piad-primary hover:bg-piad-primary/10 rounded-piad transition-colors"
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
                <h2 className="text-lg font-black text-piad-text">数据中心</h2>
                <p className="text-piad-subtext text-[0.65rem] mt-0.5">实时监控营业额、客单价及菜品热度</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-piad-card p-6 rounded-piad border border-piad-border shadow-piad">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-piad-primary/10 text-piad-primary rounded-piad">
                      <DollarSign size={24} />
                    </div>
                    <span className="text-sm font-bold text-piad-subtext">今日营收</span>
                  </div>
                  <div className="text-4xl font-black text-piad-text">
                    {formatPrice(orders.filter(o => o.status === 'completed').reduce((acc, o) => acc + o.totalPrice, 0))}
                  </div>
                  <div className="text-xs text-green-500 font-bold mt-2">↑ 12% 较昨日</div>
                </div>
                <div className="bg-piad-card p-6 rounded-piad border border-piad-border shadow-piad">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-piad">
                      <TrendingUp size={24} />
                    </div>
                    <span className="text-sm font-bold text-piad-subtext">平均客单价</span>
                  </div>
                  <div className="text-4xl font-black text-piad-text">
                    {formatPrice(orders.filter(o => o.status === 'completed').length > 0 
                      ? orders.filter(o => o.status === 'completed').reduce((acc, o) => acc + o.totalPrice, 0) / orders.filter(o => o.status === 'completed').length 
                      : 0)}
                  </div>
                  <div className="text-xs text-blue-500 font-bold mt-2">实时计算中</div>
                </div>
                <div className="bg-piad-card p-6 rounded-piad border border-piad-border shadow-piad">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-orange-50 text-orange-600 rounded-piad">
                      <ClipboardList size={24} />
                    </div>
                    <span className="text-sm font-bold text-piad-subtext">今日订单</span>
                  </div>
                  <div className="text-4xl font-black text-piad-text">
                    {orders.length} <span className="text-sm font-normal text-piad-subtext">单</span>
                  </div>
                  <div className="text-xs text-orange-500 font-bold mt-2">
                    {orders.filter(o => o.status === 'pending').length} 单待处理
                  </div>
                </div>
                <div className="bg-piad-card p-6 rounded-piad border border-piad-border shadow-piad">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-piad">
                      <Users size={24} />
                    </div>
                    <span className="text-sm font-bold text-piad-subtext">活跃桌位</span>
                  </div>
                  <div className="text-4xl font-black text-piad-text">
                    {tables.filter(t => t.status === 'active').length} <span className="text-sm font-normal text-piad-subtext">桌</span>
                  </div>
                  <div className="text-xs text-purple-500 font-bold mt-2">共 {tables.length} 个桌位</div>
                </div>
              </div>

              <div className="bg-piad-card p-4 rounded-piad border border-piad-border shadow-piad mb-6">
                <h3 className="text-sm font-black text-piad-text mb-4 flex items-center">
                  <BarChart3 size={16} className="mr-2 text-piad-primary" />
                  菜品热力图 (点击率)
                </h3>
                <div className="space-y-4">
                  {(() => {
                    const sortedDishes = [...dishes].sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0));
                    const maxClicks = sortedDishes[0]?.clickCount || 1;
                    return sortedDishes.slice(0, 8).map((dish, idx) => {
                      const heat = Math.min(100, ((dish.clickCount || 0) / maxClicks) * 100);
                      // Heatmap colors: from gray to orange to red
                      const heatColor = heat > 80 ? 'bg-piad-primary' : heat > 50 ? 'bg-orange-500' : heat > 20 ? 'bg-orange-300' : 'bg-piad-bg';
                      
                      return (
                        <div key={dish.id} className="space-y-1.5">
                          <div className="flex justify-between text-[0.65rem] font-bold">
                            <div className="flex items-center space-x-2">
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[0.5rem] ${idx < 3 ? 'bg-piad-primary text-white' : 'bg-piad-bg text-piad-subtext'}`}>
                                {idx + 1}
                              </span>
                              <span className="text-piad-subtext truncate max-w-[120px]">{dish.name}</span>
                            </div>
                            <span className="text-piad-subtext/60">{dish.clickCount || 0} 次点击</span>
                          </div>
                          <div className="h-2 bg-piad-bg rounded-full overflow-hidden">
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
                <h2 className="text-lg font-black text-piad-text">权限与安全</h2>
                <p className="text-piad-subtext text-[0.65rem] mt-0.5">管理员工角色及系统访问权限</p>
              </div>

              <div className="bg-piad-card rounded-piad border border-piad-border shadow-piad overflow-hidden">
                <div className="p-4 border-b border-piad-border bg-piad-bg/50">
                  <h3 className="text-xs font-black text-piad-subtext uppercase tracking-widest">角色定义</h3>
                </div>
                <div className="divide-y divide-piad-border">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-piad bg-piad-primary/10 text-piad-primary flex items-center justify-center">
                        <ShieldCheck size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-black text-piad-text">老板 (Owner)</div>
                        <div className="text-[0.65rem] text-piad-subtext">拥有所有权限，包括财务查看、价格修改</div>
                      </div>
                    </div>
                    <div className="text-[0.65rem] font-bold text-piad-primary bg-piad-primary/10 px-2 py-1 rounded-md">当前</div>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-piad bg-blue-100 text-blue-600 flex items-center justify-center">
                        <Users size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-black text-piad-text">店长 (Manager)</div>
                        <div className="text-[0.65rem] text-piad-subtext">管理菜单、处理订单、查看部分报表</div>
                      </div>
                    </div>
                    <button className="text-[0.65rem] font-bold text-piad-subtext hover:text-blue-600 transition-colors">配置</button>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-piad bg-piad-bg text-piad-subtext flex items-center justify-center">
                        <ClipboardList size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-black text-piad-text">服务员 (Waiter)</div>
                        <div className="text-[0.65rem] text-piad-subtext">仅限订单查看、状态流转，不可改价</div>
                      </div>
                    </div>
                    <button className="text-[0.65rem] font-bold text-piad-subtext hover:text-piad-text transition-colors">配置</button>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-piad-primary/5 rounded-piad border border-piad-primary/10 flex items-start space-x-3">
                <AlertTriangle size={16} className="text-piad-primary mt-0.5 flex-shrink-0" />
                <p className="text-[0.65rem] text-piad-primary leading-relaxed">
                  安全提示：服务员账号已锁定“价格修改”与“订单删除”权限。如需调整，请联系老板账号。
                </p>
              </div>

              {userRole === 'owner' && (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-piad-text">员工管理</h3>
                    <button 
                      onClick={() => setIsAddingStaff(!isAddingStaff)}
                      className="text-[0.65rem] font-bold text-piad-primary bg-piad-primary/10 px-3 py-1.5 rounded-piad active:scale-95 transition-all"
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
                        <div className="bg-piad-bg p-4 rounded-piad border border-piad-border space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[0.5rem] font-bold text-piad-subtext uppercase">用户名</label>
                              <input 
                                type="text" 
                                value={newStaffUsername}
                                onChange={e => setNewStaffUsername(e.target.value)}
                                placeholder="例如: waiter01"
                                className="w-full bg-piad-card border border-piad-border rounded-piad px-4 py-2.5 text-xs outline-none focus:border-piad-primary transition-colors text-piad-text"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[0.5rem] font-bold text-piad-subtext uppercase">密码</label>
                              <input 
                                type="password" 
                                value={newStaffPassword}
                                onChange={e => setNewStaffPassword(e.target.value)}
                                placeholder="设置登录密码"
                                className="w-full bg-piad-card border border-piad-border rounded-piad px-4 py-2.5 text-xs outline-none focus:border-piad-primary transition-colors text-piad-text"
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-[0.5rem] font-bold text-piad-subtext uppercase">权限设置</label>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { id: 'orders', name: '实时看板' },
                                { id: 'menu', name: '智能菜单' },
                                { id: 'analytics', name: '数据中心' },
                                { id: 'access', name: '权限安全' },
                                { id: 'tables', name: '桌位管理' },
                                { id: 'settings', name: '系统设置' }
                              ].map(perm => (
                                <label key={perm.id} className="flex items-center space-x-2 bg-piad-card p-2 rounded-piad border border-piad-border cursor-pointer">
                                  <input 
                                    type="checkbox"
                                    checked={newStaffPermissions.includes(perm.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setNewStaffPermissions([...newStaffPermissions, perm.id]);
                                      } else {
                                        setNewStaffPermissions(newStaffPermissions.filter(p => p !== perm.id));
                                      }
                                    }}
                                    className="w-3 h-3 text-piad-primary rounded focus:ring-piad-primary"
                                  />
                                  <span className="text-[0.6rem] font-bold text-piad-subtext">{perm.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center space-x-3">
                            <div className="flex-1 space-y-1">
                              <label className="text-[0.5rem] font-bold text-piad-subtext uppercase">分配角色</label>
                              <select 
                                value={newStaffRole}
                                onChange={e => setNewStaffRole(e.target.value as 'manager' | 'waiter')}
                                className="w-full bg-piad-card border border-piad-border rounded-piad px-4 py-2.5 text-xs outline-none focus:border-piad-primary transition-colors appearance-none text-piad-text"
                              >
                                <option value="manager">店长 (Manager)</option>
                                <option value="waiter">服务员 (Waiter)</option>
                              </select>
                            </div>
                            <button 
                              onClick={async () => {
                                if (!newStaffUsername || !newStaffPassword) {
                                  showToast('请填写用户名 and 密码', 'error');
                                  return;
                                }
                                try {
                                  const email = `${newStaffUsername.toLowerCase()}@staff.piad`;
                                  
                                  // Use a secondary auth instance to create the user without signing out the current admin
                                  const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
                                  const secondaryAuth = getAuth(secondaryApp);
                                  
                                  try {
                                    await createUserWithEmailAndPassword(secondaryAuth, email, newStaffPassword);
                                  } catch (authErr: any) {
                                    if (authErr.code !== 'auth/email-already-in-use') {
                                      throw authErr;
                                    }
                                  }

                                  await setDoc(doc(db, 'staff', email), {
                                    username: newStaffUsername,
                                    email: email,
                                    role: newStaffRole,
                                    permissions: newStaffPermissions,
                                    createdAt: serverTimestamp()
                                  });
                                  
                                  setNewStaffUsername('');
                                  setNewStaffPassword('');
                                  setNewStaffPermissions(['orders']);
                                  setIsAddingStaff(false);
                                  showToast('员工添加成功', 'success');
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.CREATE, 'staff');
                                }
                              }}
                              className="self-end bg-piad-primary text-white px-6 py-2.5 rounded-piad text-xs font-black shadow-piad active:scale-95 transition-all"
                            >
                              确认添加
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="bg-piad-card rounded-piad border border-piad-border shadow-piad overflow-hidden">
                    <div className="divide-y divide-piad-border">
                      {staff.length === 0 ? (
                        <div className="p-8 text-center text-piad-subtext text-xs">暂无员工信息</div>
                      ) : (
                        staff.map(member => (
                          <div key={member.id} className="p-4 flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-8 h-8 rounded-piad flex items-center justify-center ${
                                member.role === 'owner' ? 'bg-piad-primary/10 text-piad-primary' : 
                                member.role === 'manager' ? 'bg-blue-100 text-blue-600' : 'bg-piad-bg text-piad-subtext'
                              }`}>
                                {member.role === 'owner' ? <ShieldCheck size={16} /> : 
                                 member.role === 'manager' ? <Users size={16} /> : <ClipboardList size={16} />}
                              </div>
                              <div>
                                <div className="text-sm font-black text-piad-text">{member.username || member.email}</div>
                                <div className="flex items-center space-x-2">
                                  <div className="text-[0.65rem] text-piad-subtext uppercase tracking-widest font-bold">
                                    {member.role === 'owner' ? '老板' : member.role === 'manager' ? '店长' : '服务员'}
                                  </div>
                                  {member.permissions && member.permissions.length > 0 && (
                                    <div className="flex items-center space-x-1">
                                      <span className="text-[0.5rem] text-piad-subtext/30">•</span>
                                      <div className="flex flex-wrap gap-1">
                                        {member.permissions.map(p => (
                                          <span key={p} className="text-[0.5rem] bg-piad-bg text-piad-subtext px-1.5 py-0.5 rounded border border-piad-border">
                                            {p === 'orders' ? '看板' : p === 'menu' ? '菜单' : p === 'analytics' ? '数据' : p === 'access' ? '权限' : p === 'tables' ? '桌位' : '设置'}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
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
                                className="p-2 text-piad-subtext/30 hover:text-piad-primary transition-colors"
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
                  <h2 className="text-lg font-black text-piad-text">桌位管理</h2>
                  <p className="text-piad-subtext text-[0.65rem] mt-0.5">管理桌位状态与动态二维码</p>
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
                  className="bg-piad-primary text-white p-2 rounded-piad shadow-piad active:scale-95 transition-all"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {tables.map(table => (
                  <div key={table.id} className="bg-piad-card p-4 rounded-piad border border-piad-border shadow-piad relative overflow-hidden group">
                    <div className={`absolute top-0 right-0 w-12 h-12 -mr-6 -mt-6 rotate-45 ${table.status === 'active' ? 'bg-green-500' : 'bg-piad-bg'}`} />
                    
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-12 h-12 rounded-piad bg-piad-bg flex items-center justify-center text-piad-text font-black text-xl">
                        {table.number}
                      </div>
                      <div className="text-center">
                        <div className={`text-[0.6rem] font-black uppercase tracking-widest ${table.status === 'active' ? 'text-green-600' : 'text-piad-subtext'}`}>
                          {table.status === 'active' ? '正在用餐' : '空闲中'}
                        </div>
                        {table.sessionToken && (
                          <div className="text-[0.5rem] text-piad-subtext font-mono mt-1 truncate w-24">
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
                          className="flex-1 bg-piad-bg text-piad-subtext py-2 rounded-piad text-[0.6rem] font-bold hover:bg-piad-primary/10 hover:text-piad-primary transition-colors flex items-center justify-center"
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
                          className="flex-1 bg-piad-primary text-white py-2 rounded-piad text-[0.6rem] font-bold hover:opacity-90 transition-colors flex items-center justify-center shadow-piad"
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
                <h2 className="text-lg font-black text-piad-text">系统设置</h2>
                <p className="text-piad-subtext text-[0.65rem] mt-0.5">配置应用全局显示参数、语言与货币</p>
              </div>

              <div className="bg-piad-card rounded-piad p-6 border border-piad-border shadow-piad space-y-8">
                {/* Restaurant Name */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-piad-text flex items-center">
                    <ClipboardList size={16} className="mr-2 text-piad-primary" />
                    餐厅名称
                  </h3>
                  <div className="flex space-x-2">
                    <input 
                      type="text"
                      value={localRestaurantName}
                      onChange={(e) => setLocalRestaurantName(e.target.value)}
                      className="flex-1 bg-piad-bg border border-piad-border rounded-piad px-4 py-3 text-sm outline-none focus:border-piad-primary transition-colors text-piad-text"
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
                      className="bg-piad-primary text-white px-6 py-3 rounded-piad font-black text-sm shadow-piad active:scale-95 transition-all"
                    >
                      保存
                    </button>
                  </div>
                </div>

                {/* Currency Selection */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-piad-text flex items-center">
                    <DollarSign size={16} className="mr-2 text-piad-primary" />
                    结算货币 (SKU)
                  </h3>
                  <div className="flex items-center bg-piad-bg p-1 rounded-piad border border-piad-border w-full">
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
                        className={`flex-1 h-10 rounded-piad font-black text-xs transition-all ${appSettings.currency === curr ? 'bg-piad-primary text-white shadow-piad scale-105' : 'text-piad-subtext'}`}
                      >
                        {curr === 'KRW' ? '₩ 韩币' : curr === 'CNY' ? '¥ 人民币' : '$ 美元'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language Selection */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-piad-text flex items-center">
                    <Languages size={16} className="mr-2 text-piad-primary" />
                    默认语言
                  </h3>
                  <div className="flex items-center bg-piad-bg p-1 rounded-piad border border-piad-border w-full">
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
                        className={`flex-1 h-10 rounded-piad font-black text-xs transition-all ${appSettings.language === lang ? 'bg-piad-primary text-white shadow-piad scale-105' : 'text-piad-subtext'}`}
                      >
                        {lang === 'zh' ? '中文' : lang === 'en' ? 'English' : '한국어'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid Columns Selection */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-piad-text flex items-center">
                    <LayoutGrid size={16} className="mr-2 text-piad-primary" />
                    菜单显示列数
                  </h3>
                  <div className="flex items-center bg-piad-bg p-1 rounded-piad border border-piad-border w-full">
                    {[2, 3, 4].map(cols => (
                      <button
                        key={cols}
                        onClick={() => handleUpdateGridColumns(cols)}
                        className={`flex-1 h-10 rounded-piad font-black text-xs transition-all ${gridColumns === cols ? 'bg-piad-primary text-white shadow-piad scale-105' : 'text-piad-subtext'}`}
                      >
                        {cols} 列
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme Selection */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-piad-text flex items-center">
                    <Zap size={16} className="mr-2 text-piad-primary" />
                    系统主题风格
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'default', name: '经典味觉红', color: 'bg-[#E60012]' },
                      { id: 'luxury', name: '黑金饕餮', color: 'bg-[#D4AF37]' },
                      { id: 'nature', name: '清新抹茶', color: 'bg-[#487E4C]' },
                      { id: 'sweet', name: '多巴胺蜜桃', color: 'bg-[#FF6B6B]' }
                    ].map(theme => (
                      <button
                        key={theme.id}
                        onClick={async () => {
                          setAppSettings(prev => ({ ...prev, theme: theme.id as any }));
                          try {
                            await setDoc(doc(db, 'settings', 'global'), { theme: theme.id }, { merge: true });
                            showToast(`已切换至 ${theme.name}`, 'success');
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                          }
                        }}
                        className={`flex items-center p-3 rounded-piad border transition-all ${
                          appSettings.theme === theme.id 
                            ? 'border-piad-primary bg-piad-primary/5 shadow-sm' 
                            : 'border-piad-primary/10 bg-piad-card hover:border-piad-primary/20'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${theme.color} mr-2 shadow-sm`} />
                        <span className={`text-[0.65rem] font-black ${appSettings.theme === theme.id ? 'text-piad-primary' : 'text-piad-subtext'}`}>
                          {theme.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Placeholders Management */}
                <div className="space-y-3">
                  <h3 className="font-black text-sm text-piad-text flex items-center">
                    <Search size={16} className="mr-2 text-piad-primary" />
                    搜索栏滚动字幕内容
                  </h3>
                  <div className="space-y-2">
                    {(appSettings.searchPlaceholders || []).map((placeholder, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={placeholder}
                          onChange={(e) => {
                            const newList = [...(appSettings.searchPlaceholders || [])];
                            newList[index] = e.target.value;
                            setAppSettings(prev => ({ ...prev, searchPlaceholders: newList }));
                          }}
                          onBlur={async () => {
                            try {
                              await setDoc(doc(db, 'settings', 'global'), { searchPlaceholders: appSettings.searchPlaceholders }, { merge: true });
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                            }
                          }}
                          className="flex-1 bg-piad-bg border border-piad-border rounded-piad px-4 py-2 text-sm focus:ring-2 focus:ring-piad-primary/20 outline-none text-piad-text"
                        />
                        <button
                          onClick={async () => {
                            const newList = (appSettings.searchPlaceholders || []).filter((_, i) => i !== index);
                            try {
                              await setDoc(doc(db, 'settings', 'global'), { searchPlaceholders: newList }, { merge: true });
                              showToast('已删除字幕', 'success');
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                            }
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={async () => {
                        const newList = [...(appSettings.searchPlaceholders || []), ''];
                        try {
                          await setDoc(doc(db, 'settings', 'global'), { searchPlaceholders: newList }, { merge: true });
                        } catch (error) {
                          handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                        }
                      }}
                      className="w-full py-2 border-2 border-dashed border-piad-border rounded-piad text-piad-subtext text-xs font-black hover:border-piad-primary hover:text-piad-primary transition-all flex items-center justify-center"
                    >
                      <Plus size={14} className="mr-1" /> 添加新字幕
                    </button>
                  </div>
                </div>

                {/* Cover Page Management */}
                <div className="space-y-4 border-t border-piad-primary/5 pt-4">
                  <h3 className="font-black text-sm text-piad-text flex items-center">
                    <ImageIcon size={16} className="mr-2 text-piad-primary" />
                    品牌首页/封面设置
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[0.65rem] font-black text-piad-subtext uppercase tracking-wider">封面背景图 URL</label>
                      <input
                        type="text"
                        value={appSettings.coverImage || ''}
                        placeholder="https://images.unsplash.com/..."
                        onChange={(e) => setAppSettings(prev => ({ ...prev, coverImage: e.target.value }))}
                        onBlur={async () => {
                          try {
                            await setDoc(doc(db, 'settings', 'global'), { coverImage: appSettings.coverImage || '' }, { merge: true });
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                          }
                        }}
                        className="w-full bg-piad-bg border border-piad-border rounded-piad px-4 py-2 text-sm outline-none text-piad-text"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[0.65rem] font-black text-piad-subtext uppercase tracking-wider">品牌故事/特色 (约100字)</label>
                      <textarea
                        value={appSettings.coverHistory || ''}
                        onChange={(e) => setAppSettings(prev => ({ ...prev, coverHistory: e.target.value }))}
                        onBlur={async () => {
                          try {
                            await setDoc(doc(db, 'settings', 'global'), { coverHistory: appSettings.coverHistory || '' }, { merge: true });
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                          }
                        }}
                        rows={4}
                        className="w-full bg-piad-bg border border-piad-border rounded-piad px-4 py-2 text-sm outline-none text-piad-text resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[0.65rem] font-black text-piad-subtext uppercase tracking-wider">店铺地址</label>
                        <input
                          type="text"
                          value={appSettings.coverAddress || ''}
                          onChange={(e) => setAppSettings(prev => ({ ...prev, coverAddress: e.target.value }))}
                          onBlur={async () => {
                            try {
                              await setDoc(doc(db, 'settings', 'global'), { coverAddress: appSettings.coverAddress || '' }, { merge: true });
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                            }
                          }}
                          className="w-full bg-piad-bg border border-piad-border rounded-piad px-4 py-2 text-sm outline-none text-piad-text"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[0.65rem] font-black text-piad-subtext uppercase tracking-wider">联系电话</label>
                        <input
                          type="text"
                          value={appSettings.coverPhone || ''}
                          onChange={(e) => setAppSettings(prev => ({ ...prev, coverPhone: e.target.value }))}
                          onBlur={async () => {
                            try {
                              await setDoc(doc(db, 'settings', 'global'), { coverPhone: appSettings.coverPhone || '' }, { merge: true });
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
                            }
                          }}
                          className="w-full bg-piad-bg border border-piad-border rounded-piad px-4 py-2 text-sm outline-none text-piad-text"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-piad-bg rounded-piad border border-piad-border flex items-start space-x-3">
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
              className="bg-piad-card w-full h-full rounded-t-piad overflow-hidden shadow-piad relative z-10 flex flex-col"
            >
              <form onSubmit={handleSaveDish} className="p-6 flex-1 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-piad-text">{editingDish.id ? '编辑菜品' : '新增菜品'}</h2>
                  <button type="button" onClick={() => setEditingDish(null)} className="text-piad-subtext hover:text-piad-text">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="bg-piad-bg p-4 rounded-piad border border-piad-border space-y-4">
                    <h3 className="text-[0.65rem] font-black text-piad-subtext uppercase tracking-widest flex items-center">
                      <Languages size={12} className="mr-1" />
                      多语言名称 (SKU)
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-piad-subtext">中文 (默认)</label>
                        <input 
                          required
                          type="text" 
                          value={editingDish.name || ''}
                          onChange={e => setEditingDish({ ...editingDish, name: e.target.value })}
                          className="w-full bg-piad-card border border-piad-border rounded-piad px-3 py-2 text-xs outline-none focus:border-piad-primary transition-colors text-piad-text"
                          placeholder="例如: 经典香辣烤鱼"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-piad-subtext">English</label>
                        <input 
                          type="text" 
                          value={editingDish.name_en || ''}
                          onChange={e => setEditingDish({ ...editingDish, name_en: e.target.value })}
                          className="w-full bg-piad-card border border-piad-border rounded-piad px-3 py-2 text-xs outline-none focus:border-piad-primary transition-colors text-piad-text"
                          placeholder="Classic Spicy Grilled Fish"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-piad-subtext">한국어</label>
                        <input 
                          type="text" 
                          value={editingDish.name_ko || ''}
                          onChange={e => setEditingDish({ ...editingDish, name_ko: e.target.value })}
                          className="w-full bg-piad-card border border-piad-border rounded-piad px-3 py-2 text-xs outline-none focus:border-piad-primary transition-colors text-piad-text"
                          placeholder="클래식 매운 구운 생선"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-piad-subtext uppercase tracking-widest flex items-center">
                        <DollarSign size={12} className="mr-1" />
                        价格 ({appSettings.currency === 'KRW' ? '₩' : appSettings.currency === 'CNY' ? '¥' : '$'})
                      </label>
                      <input 
                        required
                        type="number" 
                        value={editingDish.price || 0}
                        onChange={e => setEditingDish({ ...editingDish, price: Number(e.target.value) })}
                        className="w-full bg-piad-bg border border-piad-border rounded-piad px-4 py-3 outline-none focus:border-piad-primary transition-colors text-sm font-bold text-piad-text"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-piad-subtext uppercase tracking-widest flex items-center">
                        <Zap size={12} className="mr-1" />
                        库存数量 (可选)
                      </label>
                      <input 
                        type="number" 
                        value={editingDish.stock ?? ''}
                        onChange={e => setEditingDish({ ...editingDish, stock: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className="w-full bg-piad-bg border border-piad-border rounded-piad px-4 py-3 outline-none focus:border-piad-primary transition-colors text-sm font-bold text-piad-text"
                        placeholder="不填则不限"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-piad-subtext uppercase tracking-widest flex items-center">
                      <LayoutGrid size={12} className="mr-1" />
                      所属分类
                    </label>
                    <select 
                      required
                      value={editingDish.category || ''}
                      onChange={e => setEditingDish({ ...editingDish, category: e.target.value })}
                      className="w-full bg-piad-bg border border-piad-border rounded-piad px-4 py-3 outline-none focus:border-piad-primary transition-colors appearance-none text-sm font-bold text-piad-text"
                    >
                      <option value="" disabled className="bg-piad-card">选择分类</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name} className="bg-piad-card">{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-piad-bg p-4 rounded-piad border border-piad-border space-y-4">
                    <h3 className="text-[0.65rem] font-black text-piad-subtext uppercase tracking-widest flex items-center">
                      <ClipboardList size={12} className="mr-1" />
                      多语言描述
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-piad-subtext">中文描述</label>
                        <textarea 
                          value={editingDish.description || ''}
                          onChange={e => setEditingDish({ ...editingDish, description: e.target.value })}
                          className="w-full bg-piad-card border border-piad-border rounded-piad px-3 py-2 text-xs outline-none focus:border-piad-primary transition-colors h-16 resize-none text-piad-text"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-piad-subtext">English Description</label>
                        <textarea 
                          value={editingDish.description_en || ''}
                          onChange={e => setEditingDish({ ...editingDish, description_en: e.target.value })}
                          className="w-full bg-piad-card border border-piad-border rounded-piad px-3 py-2 text-xs outline-none focus:border-piad-primary transition-colors h-16 resize-none text-piad-text"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[0.5rem] font-bold text-piad-subtext">한국어 설명</label>
                        <textarea 
                          value={editingDish.description_ko || ''}
                          onChange={e => setEditingDish({ ...editingDish, description_ko: e.target.value })}
                          className="w-full bg-piad-card border border-piad-border rounded-piad px-3 py-2 text-xs outline-none focus:border-piad-primary transition-colors h-16 resize-none text-piad-text"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-piad-subtext uppercase">图片链接</label>
                    <div className="flex space-x-3">
                      <input 
                        type="text" 
                        value={editingDish.image || ''}
                        onChange={e => setEditingDish({ ...editingDish, image: e.target.value })}
                        className="flex-1 bg-piad-bg border border-piad-border rounded-piad px-4 py-3 outline-none focus:border-piad-primary transition-colors text-piad-text"
                        placeholder="https://..."
                      />
                      <div className="w-12 aspect-square bg-piad-bg rounded-piad flex items-center justify-center overflow-hidden border border-piad-border">
                        {editingDish.image ? <img src={editingDish.image} className="w-full h-full object-cover" /> : <ImageIcon className="text-piad-subtext" />}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-piad-subtext uppercase">菜品描述</label>
                    <textarea 
                      value={editingDish.description || ''}
                      onChange={e => setEditingDish({ ...editingDish, description: e.target.value })}
                      className="w-full bg-piad-bg border border-piad-border rounded-piad px-4 py-3 outline-none focus:border-piad-primary transition-colors h-24 resize-none text-piad-text"
                      placeholder="简单介绍一下这道菜..."
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-piad-subtext uppercase tracking-widest">规格与加料 (Modifiers)</label>
                      <button 
                        type="button"
                        onClick={() => {
                          const newModifiers = [...(editingDish.modifiers || []), { name: '', price: 0 }];
                          setEditingDish({ ...editingDish, modifiers: newModifiers });
                        }}
                        className="text-piad-primary text-[0.65rem] font-black flex items-center"
                      >
                        <Plus size={14} className="mr-1" />
                        添加规格
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {(editingDish.modifiers || []).map((mod, idx) => (
                        <div key={idx} className="bg-piad-bg p-3 rounded-piad border border-piad-border space-y-2">
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 space-y-1">
                              <label className="text-[0.4rem] font-bold text-piad-subtext uppercase">分组 (如: 辣度) & 必选</label>
                              <div className="flex items-center space-x-2">
                                <input 
                                  type="text" 
                                  value={mod.group || ''}
                                  onChange={e => {
                                    const newModifiers = [...(editingDish.modifiers || [])];
                                    newModifiers[idx].group = e.target.value;
                                    setEditingDish({ ...editingDish, modifiers: newModifiers });
                                  }}
                                  className="flex-1 bg-piad-card border border-piad-border rounded-piad px-2 py-1.5 text-[0.6rem] outline-none focus:border-piad-primary text-piad-text"
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
                                    className="w-3 h-3 rounded text-piad-primary focus:ring-piad-primary"
                                  />
                                  <span className="text-[0.5rem] font-bold text-piad-subtext">必选</span>
                                </label>
                              </div>
                            </div>
                            <div className="flex-1 space-y-1">
                              <label className="text-[0.4rem] font-bold text-piad-subtext uppercase">名称 (中/EN/KO)</label>
                              <div className="grid grid-cols-3 gap-1.5">
                                <input 
                                  type="text" 
                                  value={mod.name}
                                  onChange={e => {
                                    const newModifiers = [...(editingDish.modifiers || [])];
                                    newModifiers[idx].name = e.target.value;
                                    setEditingDish({ ...editingDish, modifiers: newModifiers });
                                  }}
                                  className="bg-piad-card border border-piad-border rounded-piad px-2 py-1.5 text-[0.6rem] outline-none focus:border-piad-primary text-piad-text"
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
                                  className="bg-piad-card border border-piad-border rounded-piad px-2 py-1.5 text-[0.6rem] outline-none focus:border-piad-primary text-piad-text"
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
                                  className="bg-piad-card border border-piad-border rounded-piad px-2 py-1.5 text-[0.6rem] outline-none focus:border-piad-primary text-piad-text"
                                  placeholder="KO"
                                />
                              </div>
                            </div>
                            <div className="w-24 space-y-1">
                              <label className="text-[0.4rem] font-bold text-piad-subtext uppercase">加价</label>
                              <div className="flex items-center bg-piad-card border border-piad-border rounded-piad px-2 py-1.5">
                                <span className="text-[0.65rem] text-piad-subtext mr-1">{appSettings.currency === 'KRW' ? '₩' : appSettings.currency === 'CNY' ? '¥' : '$'}</span>
                                <input 
                                  type="number" 
                                  value={mod.price}
                                  onChange={e => {
                                    const newModifiers = [...(editingDish.modifiers || [])];
                                    newModifiers[idx].price = Number(e.target.value);
                                    setEditingDish({ ...editingDish, modifiers: newModifiers });
                                  }}
                                  className="w-full text-[0.65rem] outline-none font-bold bg-transparent text-piad-text"
                                />
                              </div>
                            </div>
                            <button 
                              type="button"
                              onClick={() => {
                                const newModifiers = (editingDish.modifiers || []).filter((_, i) => i !== idx);
                                setEditingDish({ ...editingDish, modifiers: newModifiers });
                              }}
                              className="text-piad-subtext hover:text-piad-primary transition-colors pt-4"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(editingDish.modifiers || []).length === 0 && (
                        <div className="text-center py-4 border-2 border-dashed border-piad-border rounded-piad text-[0.65rem] text-piad-subtext">
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
                        <div className={`w-10 h-6 rounded-full transition-colors ${editingDish.isRecommended ? 'bg-piad-primary' : 'bg-piad-border'}`} />
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editingDish.isRecommended ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className="text-xs font-bold text-piad-text">店长推荐</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          checked={editingDish.isSoldOut || false}
                          onChange={e => setEditingDish({ ...editingDish, isSoldOut: e.target.checked })}
                          className="sr-only"
                        />
                        <div className={`w-10 h-6 rounded-full transition-colors ${editingDish.isSoldOut ? 'bg-gray-800' : 'bg-piad-border'}`} />
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editingDish.isSoldOut ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className="text-xs font-bold text-piad-text">设为估清</span>
                    </label>
                  </div>
                </div>

                <div className="mt-10 flex space-x-4">
                  <button 
                    type="button"
                    onClick={() => setEditingDish(null)}
                    className="flex-1 py-4 rounded-piad font-bold text-piad-subtext bg-piad-bg hover:bg-piad-border transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 rounded-piad font-bold text-white bg-piad-primary shadow-piad hover:opacity-90 transition-colors"
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
              className="bg-piad-card w-full max-w-md rounded-piad overflow-hidden shadow-piad relative z-10"
            >
              <form onSubmit={handleSaveCategory} className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold text-piad-text">{editingCategory.id ? '编辑分类' : '新增分类'}</h2>
                  <button type="button" onClick={() => setEditingCategory(null)} className="text-piad-subtext hover:text-piad-text">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-piad-subtext uppercase">分类名称</label>
                    <input 
                      required
                      type="text" 
                      autoFocus
                      value={editingCategory.name || ''}
                      onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                      className="w-full bg-piad-bg border border-piad-border rounded-piad px-4 py-3 outline-none focus:border-piad-primary transition-colors text-piad-text"
                      placeholder="例如: 招牌烤鱼"
                    />
                  </div>
                </div>

                <div className="mt-10 flex space-x-4">
                  <button 
                    type="button"
                    onClick={() => setEditingCategory(null)}
                    className="flex-1 py-4 rounded-piad font-bold text-piad-subtext bg-piad-bg hover:bg-piad-border transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 rounded-piad font-bold text-white bg-piad-primary shadow-piad hover:opacity-90 transition-colors"
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
              className="bg-piad-card w-full max-w-sm rounded-piad overflow-hidden shadow-piad relative z-10 p-8 text-center"
            >
              <div className="w-16 h-16 bg-piad-primary/10 text-piad-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2 text-piad-text">确认删除</h3>
              <p className="text-piad-subtext mb-8">
                确定要删除{itemToDelete.type === 'dish' ? '菜品' : '分类'} "{itemToDelete.name}" 吗？此操作不可撤销。
              </p>
              <div className="flex space-x-4">
                <button 
                  onClick={() => setItemToDelete(null)}
                  className="flex-1 py-3 rounded-piad font-bold text-piad-subtext bg-piad-bg hover:bg-piad-border transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    if (itemToDelete.type === 'dish') handleDeleteDish(itemToDelete.id);
                    else if (itemToDelete.type === 'category') handleDeleteCategory(itemToDelete.id);
                    else if (itemToDelete.type === 'order') handleDeleteOrder(itemToDelete.id);
                  }}
                  className="flex-1 py-3 rounded-piad font-bold text-white bg-piad-primary hover:opacity-90 transition-colors"
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
            <div className={`px-6 py-3 rounded-piad shadow-piad flex items-center space-x-3 pointer-events-auto ${
              toast.type === 'success' ? 'bg-green-600' : 
              toast.type === 'error' ? 'bg-piad-primary' : 'bg-gray-800'
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
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[200] bg-piad-primary text-white px-8 py-4 rounded-piad shadow-piad flex items-center space-x-4 border-2 border-white/20"
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
              className="bg-white text-piad-primary px-4 py-2 rounded-piad font-black text-xs hover:bg-gray-100 transition-colors"
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
