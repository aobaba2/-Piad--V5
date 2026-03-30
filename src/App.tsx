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
  const [localLanguage, setLocalLanguage] = useState<'zh' | 'ko' | null>(null);
  const currentLanguage = localLanguage || appSettings.language;
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

  const t = {
    zh: {
      searchPlaceholder: '搜索菜品...',
      all: '全部',
      soldOut: '已估清 Sold Out',
      recommended: '店长推荐',
      selectSpecs: '选',
      addToCart: '加入',
      myOrder: '我的点餐单',
      clearAll: '清空全部',
      emptyCartTitle: '购物车还是空的',
      emptyCartDesc: '快去挑选您心仪的美味吧',
      itemsSelected: (count: number) => `共选择了 ${count} 件菜品`,
      selectTable: '选择餐桌号',
      required: '* 必选',
      totalAmount: '应付总额',
      noTableSelected: '未选桌号',
      confirmOrder: (table: string) => `确认下单 (${table}号桌)`,
      confirmOrderNoTable: '请先选择餐桌号',
      submitting: '提交中...',
      specSelection: '选择规格/加料',
      specRequired: '必选',
      specOptional: '可选',
      specMax: (max: number) => `最多选 ${max} 项`,
      tableNumber: (num: string) => `${num} 号桌`,
      currency: '₩',
      adminPanel: '后台管理',
      login: '登录',
      logout: '退出',
      scanQr: '扫码点餐',
      scanDesc: '请使用微信或相机扫描桌台二维码',
      close: '关闭',
      confirm: '确认',
      cancel: '取消',
      defaultDesc: '精选食材，匠心制作',
      selected: '已选：',
      none: '无',
      checkout: '去结算',
      confirmAddToCart: '确认加入购物车',
      hotRecommended: '热门推荐',
      invalidQr: '二维码已失效',
      invalidQrDesc: '该桌位的用餐会话已结束或二维码已过期，请重新扫码或联系服务员。',
      reload: '重新加载',
      orderedItems: (count: number) => `已点 ${count} 件`,
      orderSuccessTitle: '下单成功！',
      orderSuccessDesc: (table: string) => `餐桌 ${table} 的美味正在准备中`,
      kitchenNotified: '已实时通知后厨',
      newOrderTitle: '收到新订单！',
      newOrderDesc: '请立即前往后台处理',
      viewNow: '立即查看',
      categories: {
        "招牌烤鱼": "招牌烤鱼",
        "东北菜": "东北菜",
        "川菜": "川菜",
        "肉菜类": "肉菜类",
        "素菜类": "素菜类",
        "海鲜类": "海鲜类",
        "主食类": "主食类",
        "酒水类": "酒水类",
        "啤酒菜": "啤酒菜"
      },
      dishes: {
        "巫山招牌香辣烤鱼": "巫山招牌香辣烤鱼",
        "金牌蒜香烤鱼": "金牌蒜香烤鱼",
        "东北锅包肉": "东北锅包肉",
        "小鸡炖蘑菇": "小鸡炖蘑菇",
        "四川毛血旺": "四川毛血旺",
        "鱼香肉丝": "鱼香肉丝",
        "辣炒花蛤": "辣炒花蛤",
        "椒盐皮皮虾": "椒盐皮皮虾",
        "红烧肉": "红烧肉",
        "清炒时蔬": "清炒时蔬",
        "扬州炒饭": "扬州炒饭",
        "青岛原浆啤酒": "青岛原浆啤酒"
      },
      dishDesc: {
        "选用3斤以上活草鱼，秘制红油炒制，外焦里嫩。": "选用3斤以上活草鱼，秘制红油炒制，外焦里嫩。",
        "浓郁蒜香，不辣首选，汤汁拌饭一绝。": "浓郁蒜香，不辣首选，汤汁拌饭一绝。",
        "经典老式做法，酸甜适口，酥脆掉渣。": "经典老式做法，酸甜适口，酥脆掉渣。",
        "选用长白山榛蘑，鸡肉鲜嫩入味。": "选用长白山榛蘑，鸡肉鲜嫩入味。",
        "麻辣鲜香，配料丰富，正宗川味。": "麻辣鲜香，配料丰富，正宗川味。",
        "酸辣甜咸四味俱全，下饭神器。": "酸辣甜咸四味俱全，下饭神器。",
        "鲜活花蛤，爆炒入味，下酒必备。": "鲜活花蛤，爆炒入味，下酒必备。",
        "外酥里嫩，椒香浓郁。": "外酥里嫩，椒香浓郁。",
        "肥而不腻，入口即化。": "肥而不腻，入口即化。",
        "时令鲜菜，清脆爽口。": "时令鲜菜，清脆爽口。",
        "粒粒分明，配料丰富。": "粒粒分明，配料丰富。",
        "新鲜原浆，口感醇厚。": "新鲜原浆，口感醇厚。"
      }
    },
    ko: {
      searchPlaceholder: '메뉴 검색...',
      all: '전체',
      soldOut: '품절 Sold Out',
      recommended: '추천 메뉴',
      selectSpecs: '옵션',
      addToCart: '담기',
      myOrder: '내 주문',
      clearAll: '전체 삭제',
      emptyCartTitle: '장바구니가 비어 있습니다',
      emptyCartDesc: '원하시는 메뉴를 선택해주세요',
      itemsSelected: (count: number) => `총 ${count}개 메뉴 선택`,
      selectTable: '테이블 번호 선택',
      required: '* 필수',
      totalAmount: '총 결제 금액',
      noTableSelected: '테이블 미선택',
      confirmOrder: (table: string) => `주문하기 (${table}번 테이블)`,
      confirmOrderNoTable: '테이블 번호를 선택해주세요',
      submitting: '제출 중...',
      specSelection: '옵션/추가 선택',
      specRequired: '필수',
      specOptional: '선택',
      specMax: (max: number) => `최대 ${max}개 선택 가능`,
      tableNumber: (num: string) => `${num}번 테이블`,
      currency: '₩',
      adminPanel: '관리자 패널',
      login: '로그인',
      logout: '로그아웃',
      scanQr: 'QR 주문',
      scanDesc: '위챗이나 카메라로 테이블 QR을 스캔해주세요',
      close: '닫기',
      confirm: '확인',
      cancel: '취소',
      defaultDesc: '신선한 재료로 정성껏 만들었습니다',
      selected: '선택됨: ',
      none: '없음',
      checkout: '결제하기',
      confirmAddToCart: '장바구니 담기 확인',
      hotRecommended: '인기 추천',
      invalidQr: 'QR 코드가 만료되었습니다',
      invalidQrDesc: '해당 테이블의 식사 세션이 종료되었거나 QR 코드가 만료되었습니다. 다시 스캔하거나 직원에게 문의해주세요.',
      reload: '새로고침',
      orderedItems: (count: number) => `총 ${count}개 주문`,
      orderSuccessTitle: '주문 완료!',
      orderSuccessDesc: (table: string) => `${table}번 테이블의 맛있는 요리가 준비 중입니다`,
      kitchenNotified: '주방에 실시간으로 전달되었습니다',
      newOrderTitle: '새 주문이 접수되었습니다!',
      newOrderDesc: '관리자 페이지에서 확인해주세요',
      viewNow: '지금 확인',
      categories: {
        "招牌烤鱼": "시그니처 생선구이",
        "东北菜": "동북 요리",
        "川菜": "사천 요리",
        "肉菜类": "고기류",
        "素菜类": "채소류",
        "海鲜类": "해산물",
        "主食类": "식사류",
        "酒水类": "주류/음료",
        "啤酒菜": "맥주 안주"
      },
      dishes: {
        "巫山招牌香辣烤鱼": "우산 시그니처 마라 생선구이",
        "金牌蒜香烤鱼": "골드 마늘 생선구이",
        "东北锅包肉": "동북 꿔바로우",
        "小鸡炖蘑菇": "닭고기 버섯 조림",
        "四川毛血旺": "사천 마오쉐왕",
        "鱼香肉丝": "어향육사",
        "辣炒花蛤": "매운 바지락 볶음",
        "椒盐皮皮虾": "소금후추 쏙새우 튀김",
        "红烧肉": "홍샤오로우",
        "清炒时蔬": "제철 채소 볶음",
        "扬州炒饭": "양저우 볶음밥",
        "青岛原浆啤酒": "칭다오 생맥주"
      },
      dishDesc: {
        "选用3斤以上活草鱼，秘制红油炒制，外焦里嫩。": "1.5kg 이상의 활어를 사용하여 비법 고추기름으로 볶아 겉은 바삭하고 속은 촉촉합니다.",
        "浓郁蒜香，不辣首选，汤汁拌饭一绝。": "진한 마늘향, 맵지 않은 최고의 선택, 국물에 밥을 비벼 먹으면 일품입니다.",
        "经典老式做法，酸甜适口，酥脆掉渣。": "전통 방식 그대로, 새콤달콤하고 바삭바삭합니다.",
        "选用长白山榛蘑，鸡肉鲜嫩入味。": "백두산 개암버섯을 사용하여 닭고기가 부드럽고 간이 잘 배어 있습니다.",
        "麻辣鲜香，配料丰富，正宗川味。": "마라의 매콤하고 신선한 향, 풍부한 재료, 정통 사천의 맛.",
        "酸辣甜咸四味俱全，下饭神器。": "새콤, 매콤, 달콤, 짭짤한 네 가지 맛이 어우러진 밥도둑.",
        "鲜活花蛤，爆炒入味，下酒必备。": "신선한 바지락을 센 불에 볶아 술안주로 필수입니다.",
        "外酥里嫩，椒香浓郁。": "겉은 바삭하고 속은 부드러우며, 산초향이 진합니다.",
        "肥而不腻，入口即化。": "비계가 있지만 느끼하지 않고 입안에서 녹습니다.",
        "时令鲜菜，清脆爽口。": "제철 신선한 채소로 아삭하고 상쾌합니다.",
        "粒粒分明，配料丰富。": "밥알이 살아있고 재료가 풍부합니다.",
        "新鲜原浆，口感醇厚。": "신선한 생맥주, 깊고 진한 맛."
      }
    }
  }[currentLanguage as 'zh' | 'ko'] || {
    searchPlaceholder: '搜索菜品...',
    all: '全部',
    soldOut: '已估清 Sold Out',
    recommended: '店长推荐',
    selectSpecs: '选',
    addToCart: '加入',
    myOrder: '我的点餐单',
    clearAll: '清空全部',
    emptyCartTitle: '购物车还是空的',
    emptyCartDesc: '快去挑选您心仪的美味吧',
    itemsSelected: (count: number) => `共选择了 ${count} 件菜品`,
    selectTable: '选择餐桌号',
    required: '* 必选',
    totalAmount: '应付总额',
    noTableSelected: '未选桌号',
    confirmOrder: (table: string) => `确认下单 (${table}号桌)`,
    confirmOrderNoTable: '请先选择餐桌号',
    submitting: '提交中...',
    specSelection: '选择规格/加料',
    specRequired: '必选',
    specOptional: '可选',
    specMax: (max: number) => `最多选 ${max} 项`,
    tableNumber: (num: string) => `${num} 号桌`,
    currency: '₩',
    adminPanel: '后台管理',
    login: '登录',
    logout: '退出',
    scanQr: '扫码点餐',
    scanDesc: '请使用微信或相机扫描桌台二维码',
    close: '关闭',
    confirm: '确认',
    cancel: '取消',
    defaultDesc: '精选食材，匠心制作',
    selected: '已选：',
    none: '无',
    checkout: '去结算',
    confirmAddToCart: '确认加入购物车',
    hotRecommended: '热门推荐',
    invalidQr: '二维码已失效',
    invalidQrDesc: '该桌位的用餐会话已结束或二维码已过期，请重新扫码或联系服务员。',
    reload: '重新加载',
    orderedItems: (count: number) => `已点 ${count} 件`,
    orderSuccessTitle: '下单成功！',
    orderSuccessDesc: (table: string) => `餐桌 ${table} 的美味正在准备中`,
    kitchenNotified: '已实时通知后厨',
    newOrderTitle: '收到新订单！',
    newOrderDesc: '请立即前往后台处理',
    viewNow: '立即查看',
    categories: {
      "招牌烤鱼": "招牌烤鱼",
      "东北菜": "东北菜",
      "川菜": "川菜",
      "肉菜类": "肉菜类",
      "素菜类": "素菜类",
      "海鲜类": "海鲜类",
      "主食类": "主食类",
      "酒水类": "酒水类",
      "啤酒菜": "啤酒菜"
    },
    dishes: {
      "巫山招牌香辣烤鱼": "巫山招牌香辣烤鱼",
      "金牌蒜香烤鱼": "金牌蒜香烤鱼",
      "东北锅包肉": "东北锅包肉",
      "小鸡炖蘑菇": "小鸡炖蘑菇",
      "四川毛血旺": "四川毛血旺",
      "鱼香肉丝": "鱼香肉丝",
      "辣炒花蛤": "辣炒花蛤",
      "椒盐皮皮虾": "椒盐皮皮虾",
      "红烧肉": "红烧肉",
      "清炒时蔬": "清炒时蔬",
      "扬州炒饭": "扬州炒饭",
      "青岛原浆啤酒": "青岛原浆啤酒"
    },
    dishDesc: {
      "选用3斤以上活草鱼，秘制红油炒制，外焦里嫩。": "选用3斤以上活草鱼，秘制红油炒制，外焦里嫩。",
      "浓郁蒜香，不辣首选，汤汁拌饭一绝。": "浓郁蒜香，不辣首选，汤汁拌饭一绝。",
      "经典老式做法，酸甜适口，酥脆掉渣。": "经典老式做法，酸甜适口，酥脆掉渣。",
      "选用长白山榛蘑，鸡肉鲜嫩入味。": "选用长白山榛蘑，鸡肉鲜嫩入味。",
      "麻辣鲜香，配料丰富，正宗川味。": "麻辣鲜香，配料丰富，正宗川味。",
      "酸辣甜咸四味俱全，下饭神器。": "酸辣甜咸四味俱全，下饭神器。",
      "鲜活花蛤，爆炒入味，下酒必备。": "鲜活花蛤，爆炒入味，下酒必备。",
      "外酥里嫩，椒香浓郁。": "外酥里嫩，椒香浓郁。",
      "肥而不腻，入口即化。": "肥而不腻，入口即化。",
      "时令鲜菜，清脆爽口。": "时令鲜菜，清脆爽口。",
      "粒粒分明，配料丰富。": "粒粒分明，配料丰富。",
      "新鲜原浆，口感醇厚。": "新鲜原浆，口感醇厚。"
    }
  };

  const getLocalizedName = (dish: Dish) => {
    if (currentLanguage === 'en' && dish.name_en) return dish.name_en;
    if (currentLanguage === 'ko' && dish.name_ko) return dish.name_ko;
    return (t.dishes as Record<string, string>)[dish.name] || dish.name;
  };

  const getLocalizedDesc = (dish: Dish) => {
    if (currentLanguage === 'en' && dish.description_en) return dish.description_en;
    if (currentLanguage === 'ko' && dish.description_ko) return dish.description_ko;
    return (t.dishDesc as Record<string, string>)[dish.description || ''] || dish.description;
  };

  const getLocalizedModifierName = (mod: DishModifier) => {
    if (currentLanguage === 'en' && mod.name_en) return mod.name_en;
    if (currentLanguage === 'ko' && mod.name_ko) return mod.name_ko;
    return mod.name;
  };

  const getLocalizedCategory = (category: string) => {
    if (category === '店长推荐') return t.hotRecommended;
    return (t.categories as Record<string, string>)[category] || category;
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
        <h1 className="text-2xl font-black text-gray-800 mb-2">{t.invalidQr}</h1>
        <p className="text-gray-500 text-sm mb-8">{t.invalidQrDesc}</p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-red-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-red-100 active:scale-95 transition-all"
        >
          {t.reload}
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
            <span className={`text-[0.65rem] font-bold ${activeCategory === '店长推荐' ? 'text-green-600' : 'text-gray-400'}`}>{t.hotRecommended}</span>
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
              <span className={`text-[0.65rem] font-bold ${activeCategory === category ? 'text-green-600' : 'text-gray-400'}`}>{getLocalizedCategory(category)}</span>
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
            <button
              onClick={() => setLocalLanguage(currentLanguage === 'zh' ? 'ko' : 'zh')}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex items-center space-x-1"
            >
              <span>{currentLanguage === 'zh' ? '🇨🇳 中文' : '🇰🇷 한국어'}</span>
              <span className="text-gray-400 mx-1">|</span>
              <span className="text-gray-400">{currentLanguage === 'zh' ? 'KO' : 'ZH'}</span>
            </button>
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
              placeholder={t.searchPlaceholder}
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
              {getLocalizedCategory(activeCategory)} {CATEGORY_ICONS[activeCategory]}
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
                        {t.soldOut}
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
                        {t.recommended}
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
                      <p className="text-[0.65rem] text-gray-400 line-clamp-1">{getLocalizedDesc(dish) || t.defaultDesc}</p>
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
                            <span className="text-[0.65rem] font-black">{t.selectSpecs}</span>
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
                <span className="text-[0.6rem] text-gray-400 font-bold">{t.orderedItems(totalItems)}</span>
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
              <span>{isOrdering ? t.submitting : t.checkout}</span>
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
                {/* Step 1: Handle */}
                <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-1 shrink-0" />
                
                {/* Step 1 & 2: Header & Actions */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 shrink-0">
                  <div className="flex items-center space-x-2">
                    <ShoppingCart size={20} className="text-red-600" />
                    <h3 className="text-lg font-black text-gray-900">{t.myOrder}</h3>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button onClick={clearCart} className="text-sm font-bold text-gray-400 hover:text-red-600">{t.clearAll}</button>
                    <button onClick={() => setIsCartOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                  {cart.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                      <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mb-6">
                        <ShoppingCart size={48} />
                      </div>
                      <h4 className="text-xl font-bold text-gray-800 mb-2">{t.emptyCartTitle}</h4>
                      <p className="text-gray-400">{t.emptyCartDesc}</p>
                    </div>
                  ) : (
                    <>
                      {/* Step 2: Sub-header */}
                      <div className="text-xs font-bold text-gray-400 mb-2">
                        {t.itemsSelected(totalItems)}
                      </div>
                      
                      {/* Single Column List View for Cart Items */}
                      <section className="flex-1">
                        <div className="space-y-4">
                          {cart.map(item => (
                            <motion.div 
                              layout
                              key={item.id} 
                              className="flex items-center bg-white p-3 rounded-2xl shadow-sm border border-gray-100"
                            >
                              <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden mr-4">
                                <img src={getOptimizedImage(item.image)} alt={item.name} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 min-w-0 mr-4">
                                <h4 className="font-bold text-base text-gray-900 truncate">{getLocalizedName(item)}</h4>
                                <div className="text-red-600 text-sm font-bold mt-1">{formatPrice(item.price, appSettings.currency)}</div>
                                {item.modifiers && item.modifiers.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {item.modifiers.map((m, idx) => (
                                      <span key={idx} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                                        {getLocalizedModifierName(m)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center bg-gray-50 rounded-full p-1 shrink-0">
                                <button 
                                  onClick={() => removeFromCart(item)}
                                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-white rounded-full transition-colors"
                                >
                                  <Minus size={16} strokeWidth={3} />
                                </button>
                                <span className="w-8 text-center font-bold text-sm text-gray-900">{item.quantity}</span>
                                <button 
                                  onClick={() => handleAddToCart(item)}
                                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-white rounded-full transition-colors"
                                >
                                  <Plus size={16} strokeWidth={3} />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </section>

                      {/* Table Selection Section */}
                      <section className="mt-6 pt-6 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-base font-bold text-gray-900">{t.selectTable}</h4>
                          <span className="text-xs text-red-600 font-medium">{t.required}</span>
                        </div>
                        <div className="flex overflow-x-auto gap-3 pb-2 no-scrollbar">
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                            <button
                              key={num}
                              onClick={() => setSelectedTable(num)}
                              className={`shrink-0 w-14 h-14 rounded-2xl font-bold text-lg transition-all border-2 flex items-center justify-center ${
                                selectedTable === num
                                ? 'bg-red-600 border-red-600 text-white shadow-md'
                                : 'bg-white border-gray-100 text-gray-400 hover:border-red-200 hover:text-red-600'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </div>

                {/* Step 4: Checkout Bar */}
                {cart.length > 0 && (
                  <div className="p-6 bg-white border-t border-gray-100 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-gray-900">{t.totalAmount}</span>
                        <span className="text-2xl font-black text-red-600">{formatPrice(totalAmount, appSettings.currency)}</span>
                      </div>
                      <div className="text-gray-500 text-sm font-medium">
                        {selectedTable ? t.tableNumber(selectedTable) : t.noTableSelected}
                      </div>
                    </div>
                    <button 
                      onClick={handleOrderSubmit}
                      disabled={!selectedTable || isOrdering}
                      className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center space-x-2 transition-all ${
                        selectedTable 
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-200 active:scale-[0.98]' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {isOrdering ? (
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
                        />
                      ) : (
                        <UtensilsCrossed size={20} />
                      )}
                      <span>{isOrdering ? t.submitting : selectedTable ? t.confirmOrder(selectedTable) : t.confirmOrderNoTable}</span>
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
                  <h4 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-widest">{t.specSelection}</h4>
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
                  <div className="text-xs text-gray-400 font-bold">{t.selected}{selectedModifiers.length > 0 ? selectedModifiers.map(m => getLocalizedModifierName(m)).join(', ') : t.none}</div>
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
                  {t.confirm}
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
            <h2 className="text-4xl font-black mb-2">{t.orderSuccessTitle}</h2>
            <p className="text-xl text-white/80 font-bold">{t.orderSuccessDesc(selectedTable || '')}</p>
            <div className="mt-12 flex items-center space-x-2 bg-white/10 px-6 py-3 rounded-2xl backdrop-blur-md border border-white/10">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-sm font-bold">{t.kitchenNotified}</span>
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
              <h4 className="font-black">{t.newOrderTitle}</h4>
              <p className="text-xs text-white/80">{t.newOrderDesc}</p>
            </div>
            <button 
              onClick={() => {
                setShowNewOrderAlert(false);
                setIsAdminOpen(true);
              }}
              className="bg-white text-red-600 px-4 py-2 rounded-xl font-black text-xs hover:bg-gray-100 transition-colors"
            >
              {t.viewNow}
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
