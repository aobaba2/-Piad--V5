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
  RotateCcw
} from 'lucide-react';
import { Dish, formatPrice } from './constants';
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
  getDocs
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

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editingDish, setEditingDish] = useState<Partial<Dish> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, name: string, type: 'dish' | 'category' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'menu' | 'settings'>('menu');
  const [gridColumns, setGridColumns] = useState(3);
  const isReorderingRef = React.useRef(false);

  useEffect(() => {
    // Real-time settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setGridColumns(snapshot.data().gridColumns || 3);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
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

    return () => {
      unsubscribeSettings();
      unsubscribeCats();
      unsubscribeDishes();
    };
  }, []);

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

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDish) return;

    const dishToSave = {
      name: editingDish.name,
      price: editingDish.price,
      image: editingDish.image,
      category: editingDish.category,
      description: editingDish.description || '',
      tags: editingDish.tags || [],
      isRecommended: editingDish.isRecommended || false,
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

  const filteredDishes = dishes
    .filter(dish => {
      const matchesCategory = activeCategory ? dish.category === activeCategory : true;
      const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="fixed inset-0 bg-[#f3f4f6] z-[100] flex flex-col overflow-hidden text-gray-800">
      {/* Admin Header */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold flex items-center">
            <Settings className="mr-2 text-red-600" size={24} />
            后台管理系统
          </h1>
        </div>
        <div className="flex items-center space-x-4">
          {view === 'menu' && (
            <button 
              onClick={() => setEditingDish({ name: '', price: 0, category: categories[0]?.name || '', description: '', tags: [] })}
              className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-md shadow-red-100 active:scale-95 transition-all"
            >
              <Plus size={20} className="mr-1" />
              新增菜品
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Category Management Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-gray-500 uppercase tracking-wider text-xs">内容管理</h2>
            </div>
            
            <div className="space-y-1 mb-8">
              <button 
                onClick={() => {
                  setView('menu');
                  setActiveCategory(null);
                }}
                className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-bold transition-all ${view === 'menu' && !activeCategory ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <ImageIcon size={18} className="mr-3" />
                全部菜品
              </button>
              <button 
                onClick={() => setView('settings')}
                className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-bold transition-all ${view === 'settings' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Settings size={18} className="mr-3" />
                系统设置
              </button>
            </div>

            {view === 'menu' && (
              <>
                <div className="flex items-center justify-between mb-4 mt-8 px-2">
                  <h2 className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">菜品分类</h2>
                  <button onClick={() => setEditingCategory({ id: '', name: '', order: categories.length })} className="text-red-600 hover:bg-red-50 p-1 rounded-lg transition-colors">
                    <Plus size={16} />
                  </button>
                </div>

                <Reorder.Group axis="y" values={categories} onReorder={handleReorder} className="space-y-1">
                  {categories.map(cat => (
                    <Reorder.Item 
                      key={cat.id} 
                      value={cat}
                      className={`group flex items-center justify-between p-3 rounded-xl transition-all border cursor-grab active:cursor-grabbing ${activeCategory === cat.name ? 'border-red-100 bg-red-50 text-red-600 font-bold' : 'border-transparent text-gray-600 hover:bg-gray-50'}`}
                      onClick={() => {
                        setView('menu');
                        setActiveCategory(cat.name);
                      }}
                    >
                      <div className="flex items-center overflow-hidden">
                        <GripVertical size={14} className="text-gray-300 mr-2 flex-shrink-0" />
                        <span className="text-sm truncate">{cat.name}</span>
                      </div>
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCategory(cat);
                          }}
                          className="text-gray-400 hover:text-blue-600 p-1"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete({ id: cat.id, name: cat.name, type: 'category' });
                          }}
                          className="text-gray-400 hover:text-red-600 p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              </>
            )}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-8 overflow-y-auto bg-gray-50/50">
          {view === 'menu' ? (
            <>
              <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-4">
                    <h2 className="text-2xl font-bold text-gray-800">
                      {activeCategory || '全部菜品'} 
                      <span className="text-sm font-normal text-gray-400 ml-2">({filteredDishes.length} 个项目)</span>
                    </h2>
                    {activeCategory && (
                      <button 
                        onClick={handleResetDishOrder}
                        className="flex items-center space-x-1 text-xs font-bold text-gray-400 hover:text-red-600 transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm"
                        title="按名称恢复默认排序"
                      >
                        <RotateCcw size={14} />
                        <span>恢复默认排序</span>
                      </button>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mt-1">管理您的菜单项和分类 {activeCategory && '（可拖动菜品卡片调整顺序）'}</p>
                </div>
                
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text"
                    placeholder="搜索菜品名称..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/5 transition-all shadow-sm"
                  />
                </div>
              </div>

              <Reorder.Group 
                axis="y" 
                values={filteredDishes} 
                onReorder={handleReorderDishes}
                className="space-y-4 max-w-4xl"
              >
                {filteredDishes.map(dish => (
                  <Reorder.Item 
                    key={dish.id} 
                    value={dish}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group hover:shadow-md transition-all cursor-grab active:cursor-grabbing flex items-center p-4"
                  >
                    <div className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden mr-6">
                      <img src={dish.image} alt={dish.name} className="w-full h-full object-cover" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-gray-800 text-lg truncate">{dish.name}</h3>
                          {dish.isRecommended && (
                            <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">推荐</span>
                          )}
                        </div>
                        <span className="text-red-600 font-bold text-lg">{formatPrice(dish.price)}</span>
                      </div>
                      
                      <p className="text-gray-400 text-sm line-clamp-1 mb-2">{dish.description || '暂无描述'}</p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                            {dish.category}
                          </span>
                          {dish.tags?.map(tag => (
                            <span key={tag} className="text-[10px] border border-gray-200 text-gray-400 px-2 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDish(dish);
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="编辑"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete({ id: dish.id, name: dish.name, type: 'dish' });
                            }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="删除"
                          >
                            <Trash2 size={18} />
                          </button>
                          <div className="p-2 text-gray-300">
                            <GripVertical size={20} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            </>
          ) : (
            <div className="max-w-2xl mx-auto">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800">系统设置</h2>
                <p className="text-gray-400 text-sm mt-1">配置应用全局显示参数</p>
              </div>

              <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-800">首页菜品显示列数</h3>
                      <p className="text-sm text-gray-400">设置首页每个分类中菜品卡片的每行显示数量</p>
                    </div>
                    <div className="flex items-center bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                      {[3, 4, 5, 6].map(num => (
                        <button
                          key={num}
                          onClick={() => handleUpdateGridColumns(num)}
                          className={`w-12 h-12 rounded-xl font-black text-lg transition-all ${gridColumns === num ? 'bg-red-600 text-white shadow-lg shadow-red-100 scale-105' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start space-x-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold mt-0.5">i</div>
                    <p className="text-xs text-blue-700 leading-relaxed">
                      提示：增加列数会使菜品卡片变小，适合在大屏幕设备上显示更多内容。减少列数则会使卡片更大，更醒目。
                    </p>
                  </div>
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xl rounded-[32px] overflow-hidden shadow-2xl relative z-10"
            >
              <form onSubmit={handleSaveDish} className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold">{editingDish.id ? '编辑菜品' : '新增菜品'}</h2>
                  <button type="button" onClick={() => setEditingDish(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase">菜品名称</label>
                      <input 
                        required
                        type="text" 
                        value={editingDish.name || ''}
                        onChange={e => setEditingDish({ ...editingDish, name: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-600 transition-colors"
                        placeholder="例如: 经典香辣烤鱼"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase">价格 (₩)</label>
                      <input 
                        required
                        type="number" 
                        value={editingDish.price || 0}
                        onChange={e => setEditingDish({ ...editingDish, price: Number(e.target.value) })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-600 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">所属分类</label>
                      <select 
                        required
                        value={editingDish.category || ''}
                        onChange={e => setEditingDish({ ...editingDish, category: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-600 transition-colors appearance-none"
                      >
                        <option value="" disabled>选择分类</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.name}>{cat.name}</option>
                        ))}
                      </select>
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
                      <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden border border-gray-200">
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

                  <div className="flex items-center space-x-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <input 
                      type="checkbox" 
                      id="isRecommended"
                      checked={editingDish.isRecommended || false}
                      onChange={e => setEditingDish({ ...editingDish, isRecommended: e.target.checked })}
                      className="w-5 h-5 accent-red-600"
                    />
                    <label htmlFor="isRecommended" className="text-sm font-bold text-gray-700 cursor-pointer">设为店长推荐</label>
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
              className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl relative z-10"
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
              className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl relative z-10 p-8 text-center"
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
                  onClick={() => itemToDelete.type === 'dish' ? handleDeleteDish(itemToDelete.id) : handleDeleteCategory(itemToDelete.id)}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
