/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  getDoc,
  getDocFromServer,
  updateDoc,
  serverTimestamp
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

// New Components for Enhanced UI/UX
// Global image cache to prevent re-fading already loaded images
const loadedImagesCache = new Set<string>();

const DishImage = ({ src, alt, className = "" }: { src: string; alt: string; className?: string }) => {
  const [isLoaded, setIsLoaded] = useState(loadedImagesCache.has(src));
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // Derive a low-res placeholder for blur-up effect if it's a picsum URL
  const placeholderSrc = useMemo(() => {
    if (src.includes('picsum.photos')) {
      return src.replace(/\/\d+\/\d+/, '/20/20') + (src.includes('?') ? '&' : '?') + 'blur=10';
    }
    return null;
  }, [src]);

  useEffect(() => {
    if (loadedImagesCache.has(src)) {
      setIsLoaded(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' } // Load even earlier for smoother experience
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src]);

  const handleLoad = () => {
    loadedImagesCache.add(src);
    setIsLoaded(true);
  };

  return (
    <div ref={imgRef} className={`relative w-full h-full overflow-hidden bg-piad-primary/5 ${className}`}>
      {/* Low-res placeholder for blur-up */}
      {placeholderSrc && !isLoaded && (
        <img
          src={placeholderSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-50 transition-opacity duration-500"
          aria-hidden="true"
        />
      )}

      {/* Skeleton/Placeholder fallback */}
      {!isLoaded && !placeholderSrc && (
        <div className="absolute inset-0 bg-gradient-to-br from-piad-primary/5 to-piad-primary/10 animate-pulse flex items-center justify-center">
          <UtensilsCrossed className="text-piad-subtext/10" size={24} />
        </div>
      )}
      
      {/* Image with smooth transition */}
      {(isInView || isLoaded) && (
        <img
          src={src}
          alt={alt}
          onLoad={handleLoad}
          className={`w-full h-full object-cover transition-all duration-500 ease-out ${
            isLoaded ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-105 blur-md'
          }`}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      )}
    </div>
  );
};

const FlyToCart: React.FC<{ start: { x: number; y: number }; end: { x: number; y: number }; onComplete: () => void }> = ({ start, end, onComplete }) => {
  return (
    <motion.div
      initial={{ x: start.x - 12, y: start.y - 12, scale: 1, opacity: 1 }}
      animate={{ 
        x: [start.x - 12, (start.x + end.x) / 2, end.x - 12],
        y: [start.y - 12, Math.min(start.y, end.y) - 100, end.y - 12],
        scale: [1, 1.2, 0.2],
        opacity: [1, 1, 0],
      }}
      transition={{
        duration: 0.6,
        ease: "easeInOut"
      }}
      onAnimationComplete={onComplete}
      className="fixed top-0 left-0 w-6 h-6 bg-red-600 rounded-full z-[100] shadow-lg pointer-events-none flex items-center justify-center"
    >
      <Plus size={12} className="text-white" />
    </motion.div>
  );
};

export default function App() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartHeight, setCartHeight] = useState<'half' | 'full'>('half');
  const [flyItems, setFlyItems] = useState<{ id: number; start: { x: number; y: number } }[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userRole, setUserRole] = useState<'owner' | 'manager' | 'waiter' | null>(null);
  const [gridColumns, setGridColumns] = useState(3);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    currency: 'KRW',
    language: 'zh',
    restaurantName: 'PIAD 点餐'
  });
  const [localLanguage, setLocalLanguage] = useState<'zh' | 'ko' | null>(null);
  const currentLanguage = localLanguage || appSettings.language;
  const t = useMemo(() => ({
    zh: {
      searchPlaceholder: '搜索菜品...',
      all: '全部',
      soldOut: '已估清 Sold Out',
      recommended: '店长推荐',
      selectSpecs: '选',
      addToCart: '加入购物车',
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
      viewCart: '查看购物车',
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
      },
      stockLeft: (count: number) => `仅剩 ${count} 份`,
      offlineTitle: '网络连接已断开',
      offlineDesc: '请检查网络连接，以免影响下单',
      upsellTitle: '超值加购',
      upsellDesc: '再加一点，美味翻倍',
      emptyCartHint: '肚子空空，快去点餐吧~',
      searchPlaceholders: [
        '想吃点辣的？',
        '招牌烤鱼正在热销',
        '东北锅包肉，酥脆酸甜',
        '来杯冰镇啤酒解解腻？'
      ]
    },
    ko: {
      searchPlaceholder: '메뉴 검색...',
      all: '전체',
      soldOut: '품절 Sold Out',
      recommended: '추천 메뉴',
      selectSpecs: '옵션',
      addToCart: '장바구니 담기',
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
      invalidQr: '비정상적인 접근',
      invalidQrDesc: '테이블 QR 코드를 다시 스캔해 주세요.',
      reload: '새로고침',
      orderedItems: (count: number) => `총 ${count}개 주문`,
      orderSuccessTitle: '주문 완료!',
      orderSuccessDesc: (table: string) => `${table}번 테이블의 맛있는 요리가 준비 중입니다`,
      waitingForConfirmation: '주문 대기 중',
      waitingForConfirmationDesc: '주문이 전송되었습니다. 직원의 확인을 기다려주세요...',
      kitchenNotified: '주방에 실시간으로 전달되었습니다',
      newOrderTitle: '새 주문이 접수되었습니다!',
      newOrderDesc: '관리자 페이지에서 확인해주세요',
      viewNow: '지금 확인',
      viewCart: '장바구니 보기',
      stockLeft: (count: number) => `남은 수량 ${count}개`,
      offlineTitle: '네트워크 연결 끊김',
      offlineDesc: '주문 실패를 방지하기 위해 네트워크 연결을 확인해주세요',
      upsellTitle: '가성비 추가',
      upsellDesc: '조금만 더하면 맛이 두 배!',
      emptyCartHint: '배가 비어있어요, 주문하러 가볼까요?~',
      searchPlaceholders: [
        '매운 음식이 당기나요?',
        '시그니처 생선구이 인기 판매 중',
        '동북 꿔바로우, 바삭하고 새콤달콤',
        '시원한 맥주 한 잔 어떠세요?'
      ],
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
    invalidQr: '非法进入',
    invalidQrDesc: '请重新扫描餐桌二维码',
    reload: '重新加载',
    orderedItems: (count: number) => `已点 ${count} 件`,
    orderSuccessTitle: '下单成功！',
    orderSuccessDesc: (table: string) => `餐桌 ${table} 的美味正在准备中`,
    waitingForConfirmation: '订单待确认',
    waitingForConfirmationDesc: '订单已发送，请等待服务员确认...',
    kitchenNotified: '已实时通知后厨',
    newOrderTitle: '收到新订单！',
    newOrderDesc: '请立即前往后台处理',
    viewCart: '查看购物车',
    stockLeft: (count: number) => `仅剩 ${count} 份`,
    offlineTitle: '网络连接已断开',
    offlineDesc: '请检查网络连接，以免影响下单',
    upsellTitle: '超值加购',
    upsellDesc: '再加一点，美味翻倍',
    emptyCartHint: '肚子空空，快去点餐吧~',
    searchPlaceholders: [
      '想吃点辣的？',
      '招牌烤鱼正在热销',
      '东北锅包肉，酥脆酸甜',
      '来杯冰镇啤酒解解腻？'
    ]
  }), [currentLanguage]);
  const [sessionInfo, setSessionInfo] = useState<{ table: string, token: string } | null>(null);
  const [isSessionValid, setIsSessionValid] = useState<boolean | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'info' | 'success' } | null>(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [isWaitingForConfirmation, setIsWaitingForConfirmation] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [lastOrderCount, setLastOrderCount] = useState(0);
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [selectedDishForSpecs, setSelectedDishForSpecs] = useState<Dish | null>(null);
  const [selectedDishForDetail, setSelectedDishForDetail] = useState<Dish | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<DishModifier[]>([]);
  const [isCartPopping, setIsCartPopping] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [searchPlaceholderIndex, setSearchPlaceholderIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const [logoTapCount, setLogoTapCount] = useState(0);
  const lastLogoTapTime = useRef(0);

  const handleLogoTap = () => {
    const now = Date.now();
    if (now - lastLogoTapTime.current < 500) {
      const newCount = logoTapCount + 1;
      setLogoTapCount(newCount);
      if (newCount >= 12) {
        setIsAdminOpen(true);
        setLogoTapCount(0);
      }
    } else {
      setLogoTapCount(1);
    }
    lastLogoTapTime.current = now;
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const placeholders = useMemo(() => {
    if (appSettings.searchPlaceholders && appSettings.searchPlaceholders.length > 0) {
      return appSettings.searchPlaceholders;
    }
    return t.searchPlaceholders;
  }, [appSettings.searchPlaceholders, t.searchPlaceholders]);

  useEffect(() => {
    if (searchQuery) return;
    const interval = setInterval(() => {
      setSearchPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [placeholders, searchQuery]);

  const handleScroll = () => {
    if (isScrollingRef.current || searchQuery) return;
    
    const container = scrollContainerRef.current;
    if (!container) return;

    const sections = container.querySelectorAll('.category-section');
    let currentCategory = activeCategory;

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      // If the top of the section is near the top of the container
      if (rect.top <= containerRect.top + 100) {
        currentCategory = section.id.replace('category-', '');
      }
    });

    if (currentCategory !== activeCategory) {
      setActiveCategory(currentCategory);
    }
  };

  const handleCategoryClick = (category: string) => {
    setActiveCategory(category);
    const element = document.getElementById(`category-${category}`);
    if (element && scrollContainerRef.current) {
      isScrollingRef.current = true;
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Reset the scrolling flag after animation
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 800);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Fetch user role
        try {
          if (user.email === 'yujianfei2016@gmail.com' || user.email === 'aoba2026@admin.com') {
            setUserRole('owner');
          } else if (user.email) {
            const staffDoc = await getDoc(doc(db, 'staff', user.email));
            if (staffDoc.exists()) {
              setUserRole(staffDoc.data().role || 'waiter');
            } else {
              setUserRole('waiter');
            }
          } else {
            setUserRole('waiter');
          }
        } catch (error) {
          console.error('Failed to fetch user role:', error);
          setUserRole('waiter');
        }
      } else {
        setUserRole(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Parse URL parameters for QR code session
    const params = new URLSearchParams(window.location.search);
    let table = params.get('table');
    let token = params.get('token');
    
    // If not in URL, try localStorage
    if (!table || !token) {
      table = localStorage.getItem('piad_table');
      token = localStorage.getItem('piad_token');
    } else {
      // If found in URL, store in localStorage for persistence
      localStorage.setItem('piad_table', table);
      localStorage.setItem('piad_token', token);
    }
    
    if (table && token) {
      setSessionInfo({ table, token });
      setSelectedTable(Number(table));
    } else {
      // No session found in URL or localStorage
      setIsSessionValid(false);
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
        const newSettings: AppSettings = {
          currency: data.currency || 'KRW',
          language: data.language || 'zh',
          restaurantName: data.restaurantName || 'PIAD 点餐'
        };
        setAppSettings(newSettings);
        setGridColumns(data.gridColumns || 3);
        
        // Apply theme to body
        document.body.className = 'theme-default';
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
    }

    return () => {
      unsubscribeSettings();
      unsubscribeCats();
      unsubscribeDishes();
      unsubscribeOrders();
    };
  }, [isAuthReady, user, lastOrderCount, sessionInfo]);


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

  const handleAddToCart = async (dish: Dish, e?: React.MouseEvent) => {
    if (dish.isSoldOut) return;

    // Trigger fly animation
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const newItem = {
        id: Date.now(),
        start: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      };
      setFlyItems(prev => [...prev, newItem]);
    }

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

  const handleAddWithModifiers = (dish: Dish, selectedModifiers: DishModifier[], e?: React.MouseEvent) => {
    // Trigger fly animation
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const newItem = {
        id: Date.now(),
        start: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      };
      setFlyItems(prev => [...prev, newItem]);
    }

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
      createdAt: serverTimestamp(),
      sessionToken: sessionInfo?.token || ''
    };

    try {
      const docRef = await addDoc(collection(db, 'orders'), orderData);
      setPendingOrderId(docRef.id);
      setIsWaitingForConfirmation(true);
      setIsCartOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    } finally {
      setIsOrdering(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isWaitingForConfirmation && pendingOrderId) {
      interval = setInterval(async () => {
        try {
          const orderDoc = await getDocFromServer(doc(db, 'orders', pendingOrderId));
          if (orderDoc.exists() && orderDoc.data().status === 'confirmed') {
            setIsWaitingForConfirmation(false);
            setPendingOrderId(null);
            setOrderSuccess(true);
            setTimeout(() => {
              setOrderSuccess(false);
              clearCart();
            }, 3000);
          }
        } catch (error) {
          console.error('Polling order status failed:', error);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isWaitingForConfirmation, pendingOrderId]);

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

  if (isSessionValid === false && !isAdminOpen && !(userRole === 'owner' || userRole === 'manager')) {
    return (
      <div className="min-h-screen bg-piad-bg flex flex-col items-center justify-center p-6 text-center">
        <div 
          onClick={handleLogoTap}
          className="w-20 h-20 bg-piad-primary/10 text-piad-primary rounded-full flex items-center justify-center mb-6 cursor-pointer active:scale-95 transition-transform"
        >
          <X size={40} />
        </div>
        <h1 className="text-2xl font-black text-piad-text mb-2">{t.invalidQr}</h1>
        <p className="text-piad-subtext text-sm mb-8">{t.invalidQrDesc}</p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-piad-primary text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-piad-primary/20 active:scale-95 transition-all"
        >
          {t.reload}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-piad-bg text-piad-text font-sans overflow-hidden select-none relative">
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-4 right-4 z-[200] flex justify-center pointer-events-none"
          >
            <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 pointer-events-auto ${notification.type === 'success' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
              <Bell size={18} className="animate-bounce" />
              <span className="text-sm font-bold">{notification.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Mobile Sidebar Navigation */}
      <aside className="flex w-24 bg-piad-bg border-r border-piad-primary/5 flex-col py-4 z-10 overflow-y-auto no-scrollbar">
        <div className="flex flex-col space-y-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handleCategoryClick('店长推荐')}
            className={`flex flex-col items-center py-5 relative transition-all ${
              activeCategory === '店长推荐' ? 'bg-piad-card text-piad-primary' : 'text-piad-subtext'
            }`}
          >
            {activeCategory === '店长推荐' && (
              <motion.div 
                layoutId="active-indicator"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-piad-primary rounded-r-full" 
              />
            )}
            <motion.span 
              animate={{ scale: activeCategory === '店长推荐' ? 1.1 : 1 }}
              className="text-3xl mb-2"
            >
              {CATEGORY_ICONS['店长推荐']}
            </motion.span>
            <span className={`text-[0.8rem] font-black leading-tight text-center px-1 ${activeCategory === '店长推荐' ? 'text-piad-primary' : 'text-piad-subtext'}`}>{t.hotRecommended}</span>
          </motion.button>
          {categories.map(category => (
            <motion.button
              key={category}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleCategoryClick(category)}
              className={`flex flex-col items-center py-5 relative transition-all ${
                activeCategory === category ? 'bg-piad-card text-piad-primary' : 'text-piad-subtext'
              }`}
            >
              {activeCategory === category && (
                <motion.div 
                  layoutId="active-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-piad-primary rounded-r-full" 
                />
              )}
              <motion.span 
                animate={{ scale: activeCategory === category ? 1.1 : 1 }}
                className="text-3xl mb-2"
              >
                {CATEGORY_ICONS[category] || '🍽️'}
              </motion.span>
              <span className={`text-[0.8rem] font-black leading-tight text-center px-1 ${activeCategory === category ? 'text-piad-primary' : 'text-piad-subtext'}`}>{getLocalizedCategory(category)}</span>
            </motion.button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-piad-bg">
        {/* Sticky Header with Glassmorphism */}
        <div className="sticky top-0 z-30 bg-piad-card/80 backdrop-blur-md border-b border-piad-primary/5">
          <div className="pt-[env(safe-area-inset-top)]">
            <div className="h-14 flex items-center justify-between px-4">
              <div className="w-8" />
              <h1 
                className="text-base sm:text-lg md:text-xl font-black tracking-tight text-piad-text cursor-pointer select-none active:scale-95 transition-transform truncate max-w-[140px] sm:max-w-none"
                onClick={handleLogoTap}
              >
                {appSettings.restaurantName}
              </h1>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setLocalLanguage(currentLanguage === 'zh' ? 'ko' : 'zh')}
                  className="px-4 py-2 text-sm font-bold rounded-lg bg-piad-primary/5 text-piad-subtext hover:bg-piad-primary/10 transition-colors flex items-center space-x-1"
                >
                  <span>{currentLanguage === 'zh' ? '🇨🇳' : '🇰🇷'}</span>
                </button>
                {/* Admin buttons removed as requested */}
              </div>
            </div>
          </div>

          {/* Search Bar inside Sticky Header */}
          <div className="px-4 pb-3">
            <div className="bg-piad-primary/5 rounded-xl flex items-center px-4 py-2 border border-piad-primary/5">
              <Search size={18} className="text-piad-subtext mr-2 shrink-0" />
              <div className="relative flex-1 h-5 overflow-hidden">
                <AnimatePresence mode="wait">
                  {!searchQuery && (
                    <motion.div
                      key={searchPlaceholderIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute inset-0 flex items-center text-sm text-piad-subtext pointer-events-none"
                    >
                      {placeholders[searchPlaceholderIndex % placeholders.length]}
                    </motion.div>
                  )}
                </AnimatePresence>
                <input 
                  type="text" 
                  className="absolute inset-0 bg-transparent border-none outline-none text-sm w-full text-piad-text placeholder-transparent"
                  value={searchQuery || ''}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="ml-2 text-piad-subtext hover:text-piad-primary">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Offline Banner */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-center space-x-2 z-30"
            >
              <div className="w-2 h-2 bg-white rounded-full animate-ping" />
              <span>{t.offlineTitle}: {t.offlineDesc}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dish Grid/List */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 pb-32 no-scrollbar bg-piad-bg"
        >
          {searchQuery ? (
            <div className="grid grid-cols-1 gap-4 pt-4">
              <AnimatePresence mode="popLayout">
                {filteredDishes.map(dish => (
                  <motion.div
                    key={dish.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-piad-card rounded-2xl p-2 shadow-piad border border-piad-primary/5 transition-all duration-300 group relative flex ${dish.isSoldOut ? 'opacity-60 grayscale-[0.5]' : 'hover:shadow-md hover:border-piad-primary/20'}`}
                  >
                    {dish.isSoldOut && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px] rounded-2xl">
                        <div className="bg-piad-text text-piad-bg px-3 py-1 rounded-full text-[0.65rem] font-black uppercase tracking-widest shadow-xl">
                          {t.soldOut}
                        </div>
                      </div>
                    )}
                    <div 
                      onClick={() => !dish.isSoldOut && setSelectedDishForDetail(dish)}
                      className="relative w-[35%] aspect-square overflow-hidden flex-shrink-0 rounded-xl bg-gray-100 cursor-pointer group-hover:shadow-lg transition-shadow"
                    >
                      <motion.div 
                        layoutId={`dish-image-${dish.id}`} 
                        className="w-full h-full"
                        whileHover={{ scale: 1.05 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      >
                        <DishImage src={getOptimizedImage(dish.image)} alt={dish.name} />
                      </motion.div>
                      
                      {dish.isRecommended && (
                        <div className="absolute top-2 left-2 bg-red-600/90 backdrop-blur-sm text-white text-[0.5rem] font-bold px-1.5 py-0.5 rounded-md shadow-lg z-10">
                          {t.recommended}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 pl-3 py-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="text-base font-black text-piad-text group-hover:text-piad-primary transition-colors line-clamp-1">
                            {getLocalizedName(dish)}
                          </h3>
                        </div>
                        <p className="text-[0.65rem] text-piad-subtext line-clamp-1">{getLocalizedDesc(dish) || t.defaultDesc}</p>
                      </div>

                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex flex-col">
                          <span className="text-piad-primary text-lg font-black">{formatPrice(dish.price, appSettings.currency)}</span>
                          {dish.stock !== undefined && dish.stock > 0 && dish.stock <= 10 && (
                            <span className="text-[0.6rem] text-red-500 font-bold animate-pulse">
                              🔥 {t.stockLeft(dish.stock)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button 
                            onClick={(e) => handleAddToCart(dish, e)}
                            disabled={dish.isSoldOut}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                              dish.isSoldOut 
                                ? 'bg-gray-100 text-gray-300' 
                                : 'bg-red-600 text-white shadow-red-100'
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
          ) : (
            <>
              {/* Hot Recommended Section */}
              <div id="category-店长推荐" className="category-section pt-4">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-lg font-black text-piad-text flex items-center">
                    {t.hotRecommended} {CATEGORY_ICONS['店长推荐']}
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-4 mb-8">
                  {dishes.filter(d => d.isRecommended).map(dish => (
                    <motion.div
                      key={`rec-${dish.id}`}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                    className={`bg-piad-card rounded-2xl p-2 shadow-piad border border-piad-primary/5 transition-all duration-300 group relative flex ${dish.isSoldOut ? 'opacity-60 grayscale-[0.5]' : 'hover:shadow-md hover:border-piad-primary/20'}`}
                  >
                    {dish.isSoldOut && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px] rounded-2xl">
                        <div className="bg-piad-text text-piad-bg px-3 py-1 rounded-full text-[0.65rem] font-black uppercase tracking-widest shadow-xl">
                          {t.soldOut}
                        </div>
                      </div>
                    )}
                    <div 
                      onClick={() => !dish.isSoldOut && setSelectedDishForDetail(dish)}
                      className="relative w-[35%] aspect-square overflow-hidden flex-shrink-0 rounded-xl bg-piad-primary/5 cursor-pointer"
                    >
                      <motion.div layoutId={`dish-image-${dish.id}`} className="w-full h-full">
                        <DishImage src={getOptimizedImage(dish.image)} alt={dish.name} />
                      </motion.div>
                      <div className="absolute top-2 left-2 bg-piad-primary text-white text-[0.5rem] font-bold px-1.5 py-0.5 rounded-md shadow-lg z-10">
                        {t.recommended}
                      </div>
                    </div>
                    
                    <div className="flex-1 pl-3 py-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="text-base font-black text-piad-text group-hover:text-piad-primary transition-colors line-clamp-1">
                            {getLocalizedName(dish)}
                          </h3>
                        </div>
                        <p className="text-[0.65rem] text-piad-subtext line-clamp-1">{getLocalizedDesc(dish) || t.defaultDesc}</p>
                      </div>

                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex flex-col">
                          <span className="text-piad-primary text-lg font-black">{formatPrice(dish.price, appSettings.currency)}</span>
                          {dish.stock !== undefined && dish.stock > 0 && dish.stock <= 10 && (
                            <span className="text-[0.6rem] text-piad-accent font-bold animate-pulse">
                              🔥 {t.stockLeft(dish.stock)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button 
                            onClick={(e) => handleAddToCart(dish, e)}
                            disabled={dish.isSoldOut}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                              dish.isSoldOut 
                                ? 'bg-piad-primary/10 text-piad-subtext' 
                                : 'bg-piad-primary text-white shadow-piad-primary/20'
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
                </div>
              </div>

              {/* Other Categories */}
              {categories.map(category => (
                <div key={category} id={`category-${category}`} className="category-section">
                  <div className="mb-6 flex items-center justify-between pt-4">
                    <h2 className="text-lg font-black text-gray-900 flex items-center">
                      {getLocalizedCategory(category)} {CATEGORY_ICONS[category]}
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4 mb-8">
                    {dishes.filter(d => d.category === category).map(dish => (
                      <motion.div
                        key={dish.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-white rounded-2xl p-2 shadow-sm border border-gray-50 transition-all duration-300 group relative flex ${dish.isSoldOut ? 'opacity-60 grayscale-[0.5]' : 'hover:shadow-md hover:border-red-50'}`}
                      >
                        {dish.isSoldOut && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px] rounded-2xl">
                            <div className="bg-gray-800 text-white px-3 py-1 rounded-full text-[0.65rem] font-black uppercase tracking-widest shadow-xl">
                              {t.soldOut}
                            </div>
                          </div>
                        )}
                        <div 
                          onClick={() => !dish.isSoldOut && setSelectedDishForDetail(dish)}
                          className="relative w-[35%] aspect-square overflow-hidden flex-shrink-0 rounded-xl bg-gray-100 cursor-pointer"
                        >
                          <motion.div layoutId={`dish-image-${dish.id}`} className="w-full h-full">
                            <DishImage src={getOptimizedImage(dish.image)} alt={dish.name} />
                          </motion.div>
                          {dish.isRecommended && (
                            <div className="absolute top-2 left-2 bg-red-600 text-white text-[0.5rem] font-bold px-1.5 py-0.5 rounded-md shadow-lg z-10">
                              {t.recommended}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 pl-3 py-1 flex flex-col justify-between">
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
                              {dish.stock !== undefined && dish.stock > 0 && dish.stock <= 10 && (
                                <span className="text-[0.6rem] text-red-500 font-bold animate-pulse">
                                  🔥 {t.stockLeft(dish.stock)}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              <button 
                                onClick={(e) => handleAddToCart(dish, e)}
                                disabled={dish.isSoldOut}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                                  dish.isSoldOut 
                                    ? 'bg-gray-100 text-gray-300' 
                                    : 'bg-red-600 text-white shadow-red-100'
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
                  </div>
                </div>
              ))}
            </>
          )}
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
                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/20">
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
                <span className="text-white text-sm font-black">{t.orderedItems(totalItems)}</span>
                <span className="text-[0.6rem] text-gray-400 font-bold">{t.viewCart}</span>
              </div>
            </div>

            <button 
              onClick={handleOrderSubmit}
              disabled={totalItems === 0 || isOrdering}
              className={`h-12 px-8 rounded-full font-black text-sm transition-all flex items-center space-x-2 ${
                totalItems > 0
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/20 active:scale-95' 
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
                animate={{ 
                  y: 0,
                  height: cartHeight === 'half' ? '65vh' : '92vh'
                }}
                exit={{ y: "100%" }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y < -50) setCartHeight('full');
                  else if (info.offset.y > 100) {
                    if (cartHeight === 'full') setCartHeight('half');
                    else setIsCartOpen(false);
                  }
                }}
                className="fixed bottom-0 left-0 right-0 w-full bg-piad-card rounded-t-[2.5rem] z-40 flex flex-col shadow-piad border-t border-piad-primary/5 overflow-hidden touch-none"
              >
                {/* Step 1: Handle */}
                <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-4 mb-2 shrink-0 cursor-grab active:cursor-grabbing" />
                
                {/* Step 1 & 2: Header & Actions */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-piad-primary/5 shrink-0">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-piad-primary/10 flex items-center justify-center">
                      <ShoppingCart size={20} className="text-piad-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-piad-text leading-tight">{t.myOrder}</h3>
                      <p className="text-[0.65rem] text-piad-subtext font-bold uppercase tracking-wider">{t.itemsSelected(totalItems)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button onClick={clearCart} className="text-xs font-black text-piad-subtext hover:text-piad-primary transition-colors">{t.clearAll}</button>
                    <button onClick={() => setIsCartOpen(false)} className="w-10 h-10 rounded-full bg-piad-primary/5 flex items-center justify-center text-piad-subtext hover:bg-piad-primary/10 transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar overscroll-contain">
                  {cart.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mb-6 relative"
                      >
                        <ShoppingCart size={64} />
                        <motion.div 
                          animate={{ y: [0, -10, 0] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute -top-2 -right-2 text-4xl"
                        >
                          🍕
                        </motion.div>
                      </motion.div>
                      <h4 className="text-xl font-black text-gray-800 mb-2">{t.emptyCartTitle}</h4>
                      <p className="text-gray-400 font-medium mb-8">{t.emptyCartHint}</p>
                      <button 
                        onClick={() => setIsCartOpen(false)}
                        className="bg-red-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-red-100 active:scale-95 transition-all"
                      >
                        {t.all}
                      </button>
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
                              className="flex items-center bg-piad-card p-3 rounded-2xl shadow-piad border border-piad-primary/5"
                            >
                              <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden mr-4 bg-piad-primary/5">
                                <DishImage src={getOptimizedImage(item.image)} alt={item.name} />
                              </div>
                              <div className="flex-1 min-w-0 mr-4">
                                <div className="text-[10px] font-black text-piad-primary/40 uppercase tracking-wider mb-0.5">
                                  {t.categories[item.category as keyof typeof t.categories] || item.category}
                                </div>
                                <h4 className="font-bold text-base text-piad-text truncate">{getLocalizedName(item)}</h4>
                                {item.modifiers && item.modifiers.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {item.modifiers.map((m, idx) => (
                                      <span key={idx} className="text-[10px] bg-piad-primary/5 text-piad-subtext px-1.5 py-0.5 rounded font-medium">
                                        {getLocalizedModifierName(m)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center bg-piad-primary/5 rounded-full p-1 shrink-0">
                                <button 
                                  onClick={() => removeFromCart(item)}
                                  className="w-8 h-8 flex items-center justify-center text-piad-subtext hover:text-piad-primary hover:bg-piad-card rounded-full transition-colors"
                                >
                                  <Minus size={16} strokeWidth={3} />
                                </button>
                                <span className="w-8 text-center font-bold text-sm text-piad-text">{item.quantity}</span>
                                <button 
                                  onClick={(e) => handleAddToCart(item, e)}
                                  className="w-8 h-8 flex items-center justify-center text-piad-subtext hover:text-piad-primary hover:bg-piad-card rounded-full transition-colors"
                                >
                                  <Plus size={16} strokeWidth={3} />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </section>

                      {/* Upsell Section */}
                      <section className="mt-8">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-base font-black text-piad-text">{t.upsellTitle}</h4>
                          <span className="text-[0.65rem] text-piad-primary font-bold bg-piad-primary/10 px-2 py-0.5 rounded-full">{t.upsellDesc}</span>
                        </div>
                        <div className="flex overflow-x-auto gap-4 pb-2 no-scrollbar">
                          {dishes.filter(d => d.category === '酒水类' && !cart.some(ci => ci.id === d.id)).slice(0, 4).map(dish => (
                            <div key={dish.id} className="shrink-0 w-32 bg-piad-primary/5 rounded-2xl p-2 border border-piad-primary/5">
                              <div className="w-full aspect-square rounded-xl overflow-hidden mb-2">
                                <DishImage src={getOptimizedImage(dish.image)} alt={dish.name} />
                              </div>
                              <h5 className="text-[0.7rem] font-bold text-piad-text line-clamp-1 mb-1">{getLocalizedName(dish)}</h5>
                              <div className="flex items-center justify-end">
                                <button 
                                  onClick={(e) => handleAddToCart(dish, e)}
                                  className="w-6 h-6 bg-piad-card rounded-lg flex items-center justify-center text-piad-primary shadow-piad border border-piad-primary/5 active:scale-90 transition-all"
                                >
                                  <Plus size={14} strokeWidth={3} />
                                </button>
                              </div>
                            </div>
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
                  <div className="p-6 bg-piad-card border-t border-piad-primary/5 shrink-0 shadow-piad pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-piad-subtext text-sm font-medium">
                        {selectedTable ? t.tableNumber(selectedTable) : t.noTableSelected}
                      </div>
                      <div className="text-piad-subtext text-xs font-bold">
                        {t.orderedItems(totalItems)}
                      </div>
                    </div>
                    <button 
                      onClick={handleOrderSubmit}
                      disabled={!selectedTable || isOrdering}
                      className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center space-x-2 transition-all ${
                        selectedTable 
                        ? 'bg-piad-primary hover:opacity-90 text-white shadow-piad-primary/20 active:scale-[0.98]' 
                        : 'bg-piad-primary/20 text-piad-subtext cursor-not-allowed'
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

      {/* Dish Detail Modal - Hero Animation */}
      <AnimatePresence>
        {selectedDishForDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDishForDetail(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-[10px]"
            />
            <motion.div
              layoutId={`dish-card-${selectedDishForDetail.id}`}
              className="relative w-[90%] max-w-[400px] bg-white rounded-[24px] overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.08)] z-10 flex flex-col max-h-[70vh]"
            >
              <div className="relative w-full aspect-[4/3] overflow-hidden">
                <motion.div layoutId={`dish-image-${selectedDishForDetail.id}`} className="w-full h-full">
                  <DishImage 
                    src={getOptimizedImage(selectedDishForDetail.image)} 
                    alt={selectedDishForDetail.name}
                  />
                </motion.div>
                <button 
                  onClick={() => setSelectedDishForDetail(null)}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white z-10 hover:bg-black/40 transition-all"
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
                {selectedDishForDetail.isRecommended && (
                  <div className="absolute top-4 left-4 bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg animate-pulse">
                    {t.recommended}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar bg-piad-primary/[0.03] overscroll-contain">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="dish-detail-title font-black text-gray-900 leading-tight">
                    {getLocalizedName(selectedDishForDetail)}
                  </h2>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-piad-primary/40 uppercase tracking-[0.2em]">菜品故事</h4>
                  <p className="dish-detail-desc text-gray-600 leading-relaxed italic font-medium text-sm">
                    “{getLocalizedDesc(selectedDishForDetail) || t.defaultDesc}”
                  </p>
                </div>

                {selectedDishForDetail.stock !== undefined && selectedDishForDetail.stock > 0 && selectedDishForDetail.stock <= 10 && (
                  <div className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg inline-flex items-center space-x-2 text-xs font-bold">
                    <span>🔥</span>
                    <span>{t.stockLeft(selectedDishForDetail.stock)}</span>
                  </div>
                )}
              </div>

              <div className="p-5 bg-white/80 backdrop-blur-md border-t border-gray-50">
                <button
                  onClick={(e) => {
                    handleAddToCart(selectedDishForDetail, e);
                    setSelectedDishForDetail(null);
                  }}
                  className="w-full h-14 bg-red-600 text-white rounded-xl font-black text-base shadow-lg shadow-red-100 active:scale-95 transition-all flex items-center justify-center space-x-2"
                >
                  <Plus size={20} strokeWidth={3} />
                  <span>{t.addToCart}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
              className="fixed bottom-0 left-0 right-0 h-[70vh] bg-piad-card rounded-t-[2rem] z-[70] flex flex-col shadow-piad overflow-hidden"
            >
              <div className="w-12 h-1.5 bg-piad-primary/10 rounded-full mx-auto mt-3 mb-1" />
              
              <div className="px-6 py-4 flex items-center justify-between border-b border-piad-primary/5">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-piad-primary/5">
                    <DishImage src={selectedDishForSpecs.image} alt={selectedDishForSpecs.name} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-piad-text">{getLocalizedName(selectedDishForSpecs)}</h3>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setSelectedDishForSpecs(null);
                    setSelectedModifiers([]);
                  }}
                  className="w-8 h-8 rounded-full bg-piad-primary/5 flex items-center justify-center text-piad-subtext"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar overscroll-contain">
                {(() => {
                  const groupedModifiers: Record<string, DishModifier[]> = {};
                  selectedDishForSpecs.modifiers?.forEach(mod => {
                    const groupName = mod.group || t.specSelection;
                    if (!groupedModifiers[groupName]) groupedModifiers[groupName] = [];
                    groupedModifiers[groupName].push(mod);
                  });

                  return Object.entries(groupedModifiers).map(([groupName, mods]) => {
                    const isRequired = mods.some(m => m.groupRequired);
                    const hasSelection = mods.some(m => selectedModifiers.some(sm => sm.name === m.name));
                    
                    return (
                      <section key={groupName}>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-widest">{groupName}</h4>
                          {isRequired && (
                            <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${hasSelection ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                              {hasSelection ? '✓' : t.specRequired}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {mods.map((mod, idx) => {
                            const isSelected = selectedModifiers.some(m => m.name === mod.name);
                            return (
                              <button 
                                key={idx}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedModifiers(prev => prev.filter(m => m.name !== mod.name));
                                  } else {
                                    // If it's a required group, we might want to limit to one selection if it's like "Spiciness"
                                    // But for now, let's allow multiple unless we add a 'maxSelection' field.
                                    // Let's assume groups like "Spiciness" are single-select if they are required.
                                    if (isRequired) {
                                      const otherInGroup = mods.map(m => m.name);
                                      setSelectedModifiers(prev => [...prev.filter(m => !otherInGroup.includes(m.name)), mod]);
                                    } else {
                                      setSelectedModifiers(prev => [...prev, mod]);
                                    }
                                  }
                                }}
                                className={`p-3 rounded-xl border-2 text-left transition-all ${
                                  isSelected 
                                    ? 'border-piad-primary bg-piad-primary/10 text-piad-primary' 
                                    : 'border-piad-primary/5 bg-piad-primary/5 text-piad-subtext'
                                }`}
                              >
                                <div className="text-xs font-black mb-0.5">{getLocalizedModifierName(mod)}</div>
                                <div className="text-[0.65rem] font-bold opacity-60">+{formatPrice(mod.price, appSettings.currency)}</div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  });
                })()}
              </div>

              <div className="p-6 bg-piad-primary/5 border-t border-piad-primary/5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs text-piad-subtext font-bold">{t.selected}{selectedModifiers.length > 0 ? selectedModifiers.map(m => getLocalizedModifierName(m)).join(', ') : t.none}</div>
                </div>
                {(() => {
                  const requiredGroups = Array.from(new Set(selectedDishForSpecs.modifiers?.filter(m => m.groupRequired).map(m => m.group || t.specSelection) || []));
                  const selectedGroups = Array.from(new Set(selectedModifiers.filter(m => m.groupRequired).map(m => m.group || t.specSelection)));
                  const allRequiredMet = requiredGroups.every(rg => selectedGroups.includes(rg));

                  return (
                    <button 
                      onClick={(e) => {
                        if (!allRequiredMet) return;
                        handleAddWithModifiers(selectedDishForSpecs, selectedModifiers, e);
                        setSelectedModifiers([]);
                      }}
                      disabled={!allRequiredMet}
                      className={`w-full py-4 rounded-2xl font-black text-lg shadow-xl transition-all ${
                        allRequiredMet 
                        ? 'bg-piad-primary text-white shadow-piad-primary/20 active:scale-95' 
                        : 'bg-piad-primary/20 text-piad-subtext cursor-not-allowed shadow-none'
                      }`}
                    >
                      {allRequiredMet ? t.confirm : t.specRequired}
                    </button>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Fly to Cart Animations */}
      {flyItems.map(item => (
        <FlyToCart 
          key={item.id} 
          start={item.start} 
          end={{ x: window.innerWidth / 2, y: window.innerHeight - 40 }} 
          onComplete={() => {
            setFlyItems(prev => prev.filter(i => i.id !== item.id));
          }}
        />
      ))}

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
      {/* Waiting for Confirmation Overlay */}
      <AnimatePresence>
        {isWaitingForConfirmation && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center text-white text-center p-6"
          >
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="w-20 h-20 border-4 border-piad-primary border-t-transparent rounded-full mb-8"
            />
            <h2 className="text-2xl font-black mb-4">{t.waitingForConfirmation}</h2>
            <p className="text-lg text-white/80 font-bold max-w-xs">{t.waitingForConfirmationDesc}</p>
            
            <div className="mt-12 flex items-center space-x-3 bg-white/10 px-6 py-3 rounded-2xl border border-white/10">
              <div className="flex space-x-1">
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-2 h-2 rounded-full bg-piad-primary" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 rounded-full bg-piad-primary" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 rounded-full bg-piad-primary" />
              </div>
              <span className="text-sm font-bold opacity-60">正在同步后厨状态...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order Success Overlay */}
      <AnimatePresence>
        {orderSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-piad-primary flex flex-col items-center justify-center text-white"
          >
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="w-32 h-32 bg-white rounded-full flex items-center justify-center text-piad-primary mb-8 shadow-piad"
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
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[200] bg-piad-primary text-white px-8 py-4 rounded-2xl shadow-piad flex items-center space-x-4 border-2 border-white/20"
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
              className="bg-white text-piad-primary px-4 py-2 rounded-xl font-black text-xs hover:bg-gray-100 transition-colors"
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
