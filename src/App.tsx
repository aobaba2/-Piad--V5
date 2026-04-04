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
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Dish, DishModifier, CATEGORIES, DISHES, formatPrice, Settings as AppSettings, Table, Banner } from './constants';
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

import { AIAssistant } from './components/AIAssistant';

// Banner Carousel Component
const ScrollingPhrases = ({ phrases, fontSize = 18 }: { phrases: string[], fontSize?: number }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!phrases || phrases.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % phrases.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [phrases]);

  if (!phrases || phrases.length === 0) return null;

  return (
    <div className="h-8 overflow-hidden relative flex items-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="font-black text-piad-primary whitespace-nowrap"
          style={{ fontSize: `${fontSize}px` }}
        >
          {phrases[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const BannerCarousel = ({ banners, onBannerClick, onClose }: { banners: Banner[], onBannerClick?: (dishId: string) => void, onClose?: () => void }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <div className="relative aspect-[16/7] w-full overflow-hidden rounded-2xl shadow-lg shadow-piad-primary/5">
        {/* Close Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          className="absolute right-3 top-3 z-20 flex items-center space-x-1 rounded-full bg-black/40 px-2 py-1 text-[0.65rem] font-bold text-white backdrop-blur-md hover:bg-black/60 transition-colors border border-white/10"
        >
          <X size={12} />
          <span>关闭广告</span>
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="absolute inset-0 cursor-pointer"
            onClick={() => banners[currentIndex].dishId && onBannerClick?.(banners[currentIndex].dishId)}
          >
            <img 
              src={banners[currentIndex].image} 
              alt={banners[currentIndex].title}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            
            {/* Tag */}
            <div className="absolute left-3 top-3 rounded-lg bg-red-600 px-2 py-1 text-[0.65rem] font-black text-white shadow-lg">
              新品上市
            </div>
            
            {/* Title */}
            <div className="absolute bottom-3 right-3 max-w-[80%] text-right">
              <h3 className="text-lg font-black text-white drop-shadow-lg line-clamp-1">
                {banners[currentIndex].title}
              </h3>
            </div>
          </motion.div>
        </AnimatePresence>
        
        {/* Indicators */}
        {banners.length > 1 && (
          <div className="absolute bottom-3 left-3 flex space-x-1.5">
            {banners.map((_, idx) => (
              <div 
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

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
  const [banners, setBanners] = useState<Banner[]>([]);
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
    restaurantName: '巫山烤鱼 点餐OS',
    backgroundImage: 'https://i.imgur.com/jHyJvmF.png',
    backgroundOpacity: 0.4
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
      duplicateReminderTitle: '温馨提示',
      duplicateReminderDesc: (name: string) => `您的购物车中已经有一份“${name}”了，您是想再点一份吗？`,
      duplicateConfirm: '是的，再来一份',
      duplicateCancel: '点错了，不加了',
      offlineTitle: '网络连接已断开',
      offlineDesc: '请检查网络连接，以免影响下单',
      clearCartConfirmTitle: '确定要清空购物车吗？',
      clearCartConfirmDesc: '清空后将无法恢复，需要重新选择菜品。',
      upsellTitle: '超值加购',
      upsellDesc: '再加一点，美味翻倍',
      upsellPhrases: [
        '再加一点，美味翻倍 😋',
        '超值加购，不容错过 ✨',
        '搭配这些，口感更佳 🥢',
        '最后一步，完美收官 🌟',
        '老板推荐，闭眼入 💯',
        '加一份快乐，多一份满足 ❤️'
      ],
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
      duplicateReminderTitle: '알림',
      duplicateReminderDesc: (name: string) => `이미 장바구니에 "${name}"이(가) 있습니다. 한 개 더 추가하시겠습니까?`,
      duplicateConfirm: '네, 추가할게요',
      duplicateCancel: '아니요, 괜찮아요',
      offlineTitle: '네트워크 연결 끊김',
      offlineDesc: '주문 실패를 방지하기 위해 네트워크 연결을 확인해주세요',
      clearCartConfirmTitle: '장바구니를 비우시겠습니까?',
      clearCartConfirmDesc: '장바구니를 비우면 복구할 수 없으며 메뉴를 다시 선택해야 합니다.',
      upsellTitle: '가성비 추가',
      upsellDesc: '조금만 더하면 맛이 두 배!',
      upsellPhrases: [
        '조금만 더하면 맛이 두 배! 😋',
        '가성비 추가, 놓치지 마세요 ✨',
        '함께하면 더 맛있어요 🥢',
        '마지막 단계, 완벽한 마무리 🌟',
        '사장님 추천 메뉴 💯',
        '행복을 더해보세요 ❤️'
      ],
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
    clearCartConfirmTitle: '确定要清空购物车吗？',
    clearCartConfirmDesc: '清空后将无法恢复，需要重新选择菜品。',
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
  const [duplicateConfirmItem, setDuplicateConfirmItem] = useState<{ dish: Dish, modifiers?: DishModifier[], startPos?: { x: number, y: number } } | null>(null);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);
  const [isCartPopping, setIsCartPopping] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const [logoTapCount, setLogoTapCount] = useState(0);
  const lastLogoTapTime = useRef(0);
  const [isBannerVisible, setIsBannerVisible] = useState(true);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const lastScrollY = useRef(0);
  const accumulatedScrollUp = useRef(0);

  const handleLogoTap = () => {
    // If user is already logged in as staff/admin, 1 click is enough
    if (user && userRole) {
      setIsAdminOpen(true);
      return;
    }

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

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const currentScrollY = container.scrollTop;
    const scrollDiff = currentScrollY - lastScrollY.current;
    
    // Professional header visibility logic (Mobile only)
    if (window.innerWidth < 768) {
      // Always show when near the top
      if (currentScrollY <= 80) {
        setIsBannerVisible(true);
        accumulatedScrollUp.current = 0;
      } 
      // Hide when scrolling down (with a small buffer)
      else if (scrollDiff > 5) {
        setIsBannerVisible(false);
        accumulatedScrollUp.current = 0;
      } 
      // Show only on significant accumulated scroll up (intentional gesture)
      else if (scrollDiff < 0) {
        accumulatedScrollUp.current += Math.abs(scrollDiff);
        if (accumulatedScrollUp.current > 120) {
          setIsBannerVisible(true);
        }
      }
    }
    
    lastScrollY.current = currentScrollY;

    if (isScrollingRef.current || searchQuery) return;
    
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
          restaurantName: data.restaurantName || 'PIAD 点餐',
          backgroundImage: data.backgroundImage || 'https://i.imgur.com/jHyJvmF.png',
          backgroundOpacity: data.backgroundOpacity !== undefined ? data.backgroundOpacity : 0.4
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
      
      const cats = Array.from(new Set(catsData.map(c => c.name)));
      
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
      // Ensure unique dishes by ID
      const uniqueDishes = Array.from(new Map(dishesData.map(d => [d.id, d])).values());
      setDishes(uniqueDishes);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dishes');
    });

    // Fetch banners
    const qBanners = query(collection(db, 'banners'), orderBy('order', 'asc'));
    const unsubscribeBanners = onSnapshot(qBanners, (snapshot) => {
      const bannersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Banner[];
      // Ensure unique banners by ID
      const uniqueBanners = Array.from(new Map(bannersData.map(b => [b.id, b])).values());
      setBanners(uniqueBanners);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'banners');
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
      unsubscribeBanners();
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

  const getModifierSignature = (modifiers?: DishModifier[]) => {
    if (!modifiers || modifiers.length === 0) return 'none';
    return modifiers.map(m => m.name).sort().join('|');
  };

  const incrementCartItem = (itemToIncrement: CartItem) => {
    setCart(prev => {
      const signature = getModifierSignature(itemToIncrement.modifiers);
      return prev.map(item => 
        (item.id === itemToIncrement.id && getModifierSignature(item.modifiers) === signature)
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    });
    setIsCartPopping(true);
    setTimeout(() => setIsCartPopping(false), 300);
  };

  const handleAddToCart = async (dish: Dish, e?: React.MouseEvent, force: boolean = false, startPos?: { x: number, y: number }) => {
    if (dish.isSoldOut) return;

    // Check for duplicate if not forced
    if (!force) {
      const signature = 'none';
      const existing = cart.find(item => item.id === dish.id && getModifierSignature(item.modifiers) === signature);
      if (existing) {
        let pos;
        if (e) {
          const rect = e.currentTarget.getBoundingClientRect();
          pos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        setDuplicateConfirmItem({ dish, startPos: pos });
        return;
      }
    }

    // Trigger fly animation
    const finalPos = startPos || (e ? (() => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })() : null);

    if (finalPos) {
      const newItem = {
        id: `fly-add-${Date.now()}-${Math.random()}`,
        start: finalPos
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
      const signature = 'none';
      const existing = prev.find(item => item.id === dish.id && getModifierSignature(item.modifiers) === signature);
      if (existing) {
        return prev.map(item => 
          (item.id === dish.id && getModifierSignature(item.modifiers) === signature) ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...dish, quantity: 1, modifiers: [] }];
    });
    setIsCartPopping(true);
    setTimeout(() => setIsCartPopping(false), 300);
  };

  const handleAddWithModifiers = (dish: Dish, selectedModifiers: DishModifier[], e?: React.MouseEvent, force: boolean = false, startPos?: { x: number, y: number }) => {
    // Check for duplicate if not forced
    if (!force) {
      const signature = getModifierSignature(selectedModifiers);
      const existing = cart.find(item => 
        item.id === dish.id && 
        getModifierSignature(item.modifiers) === signature
      );

      if (existing) {
        let pos;
        if (e) {
          const rect = e.currentTarget.getBoundingClientRect();
          pos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        setDuplicateConfirmItem({ dish, modifiers: selectedModifiers, startPos: pos });
        return;
      }
    }

    // Trigger fly animation
    const finalPos = startPos || (e ? (() => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })() : null);

    if (finalPos) {
      const newItem = {
        id: `fly-mod-${Date.now()}-${Math.random()}`,
        start: finalPos
      };
      setFlyItems(prev => [...prev, newItem]);
    }

    setCart(prev => {
      const signature = getModifierSignature(selectedModifiers);
      const existing = prev.find(item => 
        item.id === dish.id && 
        getModifierSignature(item.modifiers) === signature
      );

      if (existing) {
        return prev.map(item => 
          (item.id === dish.id && getModifierSignature(item.modifiers) === signature)
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
      const signature = getModifierSignature(itemToRemove.modifiers);
      const existing = prev.find(item => 
        item.id === itemToRemove.id && 
        getModifierSignature(item.modifiers) === signature
      );

      if (existing && existing.quantity > 1) {
        return prev.map(item => 
          (item.id === itemToRemove.id && getModifierSignature(item.modifiers) === signature)
            ? { ...item, quantity: item.quantity - 1 } 
            : item
        );
      }
      return prev.filter(item => 
        !(item.id === itemToRemove.id && getModifierSignature(item.modifiers) === signature)
      );
    });
  };

  const clearCart = () => {
    console.log('clearCart called');
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
    "素菜类": "🥗",
    "海鲜类": "🦀",
    "主食类": "🍚",
    "酒水类": "🍺",
    "啤酒菜": "🍻"
  };

  if (isLoading && dishes.length === 0) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-transparent">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (isSessionValid === false && !isAdminOpen && !(user && userRole)) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6 text-center">
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

        {/* AI Assistant for testing even on invalid QR screen */}
        {console.log('Rendering AIAssistant in invalid QR view')}
        <AIAssistant 
          dishes={dishes} 
          handleAddToCart={handleAddToCart} 
          totalItems={totalItems}
          onSearch={(query) => setSearchQuery(query)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-transparent text-piad-text font-sans overflow-hidden select-none relative">
      {/* Dynamic Background Image */}
      <div 
        className="fixed inset-0 w-full h-full bg-cover bg-center bg-no-repeat -z-10 pointer-events-none transition-all duration-700"
        style={{ 
          backgroundImage: `url(${appSettings.backgroundImage || 'https://i.imgur.com/jHyJvmF.png'})`,
          opacity: appSettings.backgroundOpacity !== undefined ? appSettings.backgroundOpacity : 0.4
        }}
      />
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
      <aside className="flex w-24 bg-transparent border-r border-[#8B0000]/10 flex-col py-4 z-10 overflow-y-auto no-scrollbar overscroll-contain relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')] opacity-20 pointer-events-none"></div>
        <div className="flex flex-col space-y-3 relative z-10">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handleCategoryClick('店长推荐')}
            className={`flex flex-col items-center py-5 relative transition-all ${
              activeCategory === '店长推荐' ? 'bg-white/20 backdrop-blur-sm text-[#8B0000]' : 'text-[#5D4037]'
            }`}
          >
            {activeCategory === '店长推荐' && (
              <motion.div 
                layoutId="active-indicator"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-[#8B0000] rounded-r-full" 
              />
            )}
            <motion.span 
              animate={{ scale: activeCategory === '店长推荐' ? 1.1 : 1 }}
              className="text-3xl mb-2"
            >
              {CATEGORY_ICONS['店长推荐']}
            </motion.span>
            <span className={`text-[0.8rem] font-black leading-tight text-center px-1 ${activeCategory === '店长推荐' ? 'text-[#8B0000]' : 'text-[#5D4037]'}`}>{t.hotRecommended}</span>
          </motion.button>
          {categories.map(category => (
            <motion.button
              key={category}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleCategoryClick(category)}
              className={`flex flex-col items-center py-5 relative transition-all ${
                activeCategory === category ? 'bg-white/20 backdrop-blur-sm text-[#8B0000]' : 'text-[#5D4037]'
              }`}
            >
              {activeCategory === category && (
                <motion.div 
                  layoutId="active-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-[#8B0000] rounded-r-full" 
                />
              )}
              <motion.span 
                animate={{ scale: activeCategory === category ? 1.1 : 1 }}
                className="text-3xl mb-2"
              >
                {CATEGORY_ICONS[category] || '🍽️'}
              </motion.span>
              <span className={`text-[0.8rem] font-black leading-tight text-center px-1 ${activeCategory === category ? 'text-[#8B0000]' : 'text-[#5D4037]'}`}>{getLocalizedCategory(category)}</span>
            </motion.button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-transparent">
        {/* Sticky Header with Glassmorphism */}
        <div className="sticky top-0 z-30 bg-transparent border-b border-[#8B0000]/5">
          <div className="pt-[env(safe-area-inset-top)]">
            <div className="h-14 flex items-center justify-between px-4">
              <div className="w-8" />
              <div className="flex items-center space-x-2">
                <h1 
                  className="text-lg sm:text-xl font-black tracking-tight text-[#2C1E1E] cursor-pointer select-none active:scale-95 transition-transform flex items-center"
                  onClick={handleLogoTap}
                >
                  {appSettings.restaurantName}
                </h1>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setLocalLanguage(currentLanguage === 'zh' ? 'ko' : 'zh')}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl bg-gray-100 text-[#5D4037] hover:bg-gray-200 transition-colors flex items-center space-x-1 border border-gray-200"
                >
                  <span className="uppercase">{currentLanguage === 'zh' ? 'CN' : 'KO'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Banner Carousel */}
          <AnimatePresence initial={false}>
            {isBannerVisible && !isBannerDismissed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <BannerCarousel 
                  banners={banners}
                  onBannerClick={(dishId) => {
                    const dish = dishes.find(d => d.id === dishId);
                    if (dish) setSelectedDishForDetail(dish);
                  }} 
                  onClose={() => setIsBannerDismissed(true)}
                />
              </motion.div>
            )}
          </AnimatePresence>
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
          className="flex-1 overflow-y-auto px-4 pb-32 no-scrollbar bg-transparent overscroll-contain"
        >
          {searchQuery ? (
            <div className="pt-4">
              <div className="flex items-center justify-between mb-4 bg-[#FDF5E6]/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-piad-primary/5">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-piad-primary/10 flex items-center justify-center text-piad-primary">
                    <Search size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-piad-subtext uppercase tracking-widest mb-0.5">搜索结果</div>
                    <div className="text-sm font-bold text-piad-text">“{searchQuery}”</div>
                  </div>
                </div>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-black text-piad-primary bg-piad-primary/5 px-4 py-2 rounded-xl active:scale-95 transition-all border border-piad-primary/10"
                >
                  清除搜索
                </button>
              </div>
              <div className={`grid gap-4 ${gridColumns === 1 ? 'grid-cols-1' : gridColumns === 2 ? 'grid-cols-2' : gridColumns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                <AnimatePresence mode="popLayout">
                {filteredDishes.map(dish => (
                  <motion.div
                    key={dish.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-[#FDF5E6]/80 backdrop-blur-md rounded-[2rem] ${gridColumns >= 3 ? 'p-2' : 'p-3'} shadow-piad border border-white/40 transition-all duration-300 group relative flex ${gridColumns > 1 ? 'flex-col' : 'flex'} ${dish.isSoldOut ? 'opacity-60 grayscale-[0.5]' : 'hover:shadow-xl hover:border-[#8B0000]/20'}`}
                  >
                    {dish.isSoldOut && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[2px] rounded-[2rem]">
                        <div className="bg-[#2C1E1E] text-white px-4 py-1.5 rounded-full text-[0.7rem] font-black uppercase tracking-widest shadow-xl">
                          {t.soldOut}
                        </div>
                      </div>
                    )}
                    <div 
                      onClick={() => !dish.isSoldOut && setSelectedDishForDetail(dish)}
                      className={`relative aspect-square overflow-hidden flex-shrink-0 rounded-[1.5rem] bg-gray-100 cursor-pointer group-hover:shadow-lg transition-shadow ${gridColumns > 1 ? 'w-full mb-2' : 'w-[38%]'}`}
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
                    
                    <div className={`flex-1 ${gridColumns > 1 ? 'pl-0' : 'pl-3'} py-1 flex flex-col justify-between`}>
                      <div>
                        <div className="flex items-start justify-between mb-1">
                          <h3 className={`${gridColumns >= 3 ? 'text-sm' : 'text-lg'} font-black text-piad-text group-hover:text-piad-primary transition-colors line-clamp-1`}>
                            {getLocalizedName(dish)}
                          </h3>
                        </div>
                        {gridColumns < 3 && (
                          <p className="text-[0.65rem] text-piad-subtext line-clamp-1">{getLocalizedDesc(dish) || t.defaultDesc}</p>
                        )}
                      </div>

                      <div className={`flex items-center justify-between mt-auto ${gridColumns >= 4 ? 'flex-col items-start space-y-2' : ''}`}>
                        <div className="flex flex-col">
                          <span className={`${gridColumns >= 3 ? 'text-sm' : 'text-lg'} text-piad-primary font-black`}>{formatPrice(dish.price, appSettings.currency)}</span>
                          {dish.stock !== undefined && dish.stock > 0 && dish.stock <= 10 && gridColumns < 4 && (
                            <span className="text-[0.6rem] text-red-500 font-bold animate-pulse">
                              🔥 {t.stockLeft(dish.stock)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button 
                            onClick={(e) => handleAddToCart(dish, e)}
                            disabled={dish.isSoldOut}
                            className={`${gridColumns >= 3 ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                              dish.isSoldOut 
                                ? 'bg-gray-100 text-gray-300' 
                                : 'bg-red-600 text-white shadow-red-100'
                            }`}
                          >
                            {dish.modifiers && dish.modifiers.length > 0 ? (
                              <span className={`${gridColumns >= 3 ? 'text-[0.6rem]' : 'text-[0.7rem]'} font-black`}>{t.selectSpecs}</span>
                            ) : (
                              <Plus size={gridColumns >= 3 ? 14 : 18} strokeWidth={3} />
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
          ) : (
            <>
              {/* Hot Recommended Section */}
              {dishes.some(d => d.isRecommended) && (
                <div id="category-店长推荐" className="pt-6 first:pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-6 bg-[#8B0000] rounded-full" />
                      <h2 className="text-xl font-black text-[#2C1E1E] tracking-tight">
                        {t.hotRecommended}
                      </h2>
                    </div>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest bg-[#8B0000]/5 px-2 py-1 rounded-md">
                      {dishes.filter(d => d.isRecommended).length} Items
                    </span>
                  </div>
                  
                  <div className={`grid gap-4 ${gridColumns === 1 ? 'grid-cols-1' : gridColumns === 2 ? 'grid-cols-2' : gridColumns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                    {dishes.filter(d => d.isRecommended).map(dish => (
                      <motion.div
                        key={`recommended-${dish.id}`}
                        layout
                        className={`bg-[#FDF5E6]/80 backdrop-blur-md rounded-[2rem] ${gridColumns >= 3 ? 'p-2' : 'p-3'} shadow-piad border border-white/40 transition-all duration-300 group relative flex ${gridColumns > 1 ? 'flex-col' : 'flex'} ${dish.isSoldOut ? 'opacity-60 grayscale-[0.5]' : 'hover:shadow-xl hover:border-[#8B0000]/20'}`}
                      >
                        {dish.isSoldOut && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[2px] rounded-[2rem]">
                            <div className="bg-[#2C1E1E] text-white px-4 py-1.5 rounded-full text-[0.7rem] font-black uppercase tracking-widest shadow-xl">
                              {t.soldOut}
                            </div>
                          </div>
                        )}
                        <div 
                          onClick={() => !dish.isSoldOut && setSelectedDishForDetail(dish)}
                          className={`relative aspect-square overflow-hidden flex-shrink-0 rounded-[1.5rem] bg-gray-100 cursor-pointer group-hover:shadow-lg transition-shadow ${gridColumns > 1 ? 'w-full mb-2' : 'w-[38%]'}`}
                        >
                          <motion.div 
                            layoutId={`dish-image-rec-${dish.id}`} 
                            className="w-full h-full"
                            whileHover={{ scale: 1.05 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                          >
                            <DishImage src={getOptimizedImage(dish.image)} alt={dish.name} />
                          </motion.div>
                          
                          <div className="absolute top-2 left-2 bg-red-600/90 backdrop-blur-sm text-white text-[0.5rem] font-bold px-1.5 py-0.5 rounded-md shadow-lg z-10">
                            {t.recommended}
                          </div>
                        </div>
                        
                        <div className={`flex-1 ${gridColumns > 1 ? 'pl-0' : 'pl-3'} py-1 flex flex-col justify-between`}>
                          <div>
                            <div className="flex items-start justify-between mb-1">
                              <h3 className={`${gridColumns >= 3 ? 'text-sm' : 'text-lg'} font-black text-[#2C1E1E] group-hover:text-[#8B0000] transition-colors line-clamp-1`}>
                                {getLocalizedName(dish)}
                              </h3>
                            </div>
                            {gridColumns < 3 && (
                              <p className="text-[0.7rem] text-gray-500 line-clamp-2 leading-relaxed mb-2">
                                {getLocalizedDesc(dish) || t.defaultDesc}
                              </p>
                            )}
                          </div>

                          <div className={`flex items-center justify-between mt-auto ${gridColumns >= 4 ? 'flex-col items-start space-y-2' : ''}`}>
                            <div className="flex flex-col">
                              <span className={`${gridColumns >= 3 ? 'text-sm' : 'text-lg'} text-[#8B0000] font-black`}>{formatPrice(dish.price, appSettings.currency)}</span>
                              {dish.stock !== undefined && dish.stock > 0 && dish.stock <= 10 && gridColumns < 4 && (
                                <span className="text-[0.6rem] text-red-500 font-bold animate-pulse">
                                  🔥 {t.stockLeft(dish.stock)}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              <button 
                                onClick={(e) => handleAddToCart(dish, e)}
                                disabled={dish.isSoldOut}
                                className={`${gridColumns >= 3 ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                                  dish.isSoldOut 
                                    ? 'bg-gray-100 text-gray-300' 
                                    : 'bg-[#8B0000] text-white shadow-red-100'
                                }`}
                              >
                                {dish.modifiers && dish.modifiers.length > 0 ? (
                                  <span className={`${gridColumns >= 3 ? 'text-[0.6rem]' : 'text-[0.7rem]'} font-black`}>{t.selectSpecs}</span>
                                ) : (
                                  <Plus size={gridColumns >= 3 ? 14 : 18} strokeWidth={3} />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {categories.map((category) => (
                <div key={category} id={`category-${category}`} className="pt-6 first:pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-6 bg-piad-primary rounded-full" />
                      <h2 className="text-xl font-black text-piad-text tracking-tight">
                        {getLocalizedCategory(category)}
                      </h2>
                    </div>
                    <span className="text-[10px] font-black text-piad-subtext uppercase tracking-widest bg-piad-primary/5 px-2 py-1 rounded-md">
                      {dishes.filter(d => d.category === category).length} Items
                    </span>
                  </div>
                  
                  <div className={`grid gap-4 ${gridColumns === 1 ? 'grid-cols-1' : gridColumns === 2 ? 'grid-cols-2' : gridColumns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                    {dishes.filter(d => d.category === category).map(dish => (
                      <motion.div
                        key={dish.id}
                        layout
                        className={`bg-[#FDF5E6]/80 backdrop-blur-md rounded-[2rem] ${gridColumns >= 3 ? 'p-2' : 'p-3'} shadow-piad border border-white/40 transition-all duration-300 group relative flex ${gridColumns > 1 ? 'flex-col' : 'flex'} ${dish.isSoldOut ? 'opacity-60 grayscale-[0.5]' : 'hover:shadow-xl hover:border-[#8B0000]/20'}`}
                      >
                        {dish.isSoldOut && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[2px] rounded-[2rem]">
                            <div className="bg-[#2C1E1E] text-white px-4 py-1.5 rounded-full text-[0.7rem] font-black uppercase tracking-widest shadow-xl">
                              {t.soldOut}
                            </div>
                          </div>
                        )}
                        <div 
                          onClick={() => !dish.isSoldOut && setSelectedDishForDetail(dish)}
                          className={`relative aspect-square overflow-hidden flex-shrink-0 rounded-[1.5rem] bg-gray-100 cursor-pointer group-hover:shadow-lg transition-shadow ${gridColumns > 1 ? 'w-full mb-2' : 'w-[38%]'}`}
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
                        
                        <div className={`flex-1 ${gridColumns > 1 ? 'pl-0' : 'pl-3'} py-1 flex flex-col justify-between`}>
                          <div>
                            <div className="flex items-start justify-between mb-1">
                              <h3 className={`${gridColumns >= 3 ? 'text-sm' : 'text-lg'} font-black text-piad-text group-hover:text-piad-primary transition-colors line-clamp-1`}>
                                {getLocalizedName(dish)}
                              </h3>
                            </div>
                            {gridColumns < 3 && (
                              <p className="text-[0.65rem] text-piad-subtext line-clamp-1">
                                {getLocalizedDesc(dish) || t.defaultDesc}
                              </p>
                            )}
                          </div>

                          <div className={`flex items-center justify-between mt-auto ${gridColumns >= 4 ? 'flex-col items-start space-y-2' : ''}`}>
                            <div className="flex flex-col">
                              <span className={`${gridColumns >= 3 ? 'text-sm' : 'text-lg'} text-piad-primary font-black`}>{formatPrice(dish.price, appSettings.currency)}</span>
                              {dish.stock !== undefined && dish.stock > 0 && dish.stock <= 10 && gridColumns < 4 && (
                                <span className="text-[0.6rem] text-red-500 font-bold animate-pulse">
                                  🔥 {t.stockLeft(dish.stock)}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              <button 
                                onClick={(e) => handleAddToCart(dish, e)}
                                disabled={dish.isSoldOut}
                                className={`${gridColumns >= 3 ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                                  dish.isSoldOut 
                                    ? 'bg-gray-100 text-gray-300' 
                                    : 'bg-red-600 text-white shadow-red-100'
                                }`}
                              >
                                {dish.modifiers && dish.modifiers.length > 0 ? (
                                  <span className={`${gridColumns >= 3 ? 'text-[0.6rem]' : 'text-[0.7rem]'} font-black`}>{t.selectSpecs}</span>
                                ) : (
                                  <Plus size={gridColumns >= 3 ? 14 : 18} strokeWidth={3} />
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
        <AnimatePresence>
          {totalItems > 0 && (
            <div className="fixed bottom-6 right-4 z-30">
              <motion.div 
                layout
                initial={{ y: 100, opacity: 0, scale: 0.8 }}
                animate={{ 
                  y: 0, 
                  opacity: 1,
                  scale: isCartPopping ? 1.05 : 1,
                  width: 'min(70vw, 400px)'
                }}
                exit={{ y: 100, opacity: 0, scale: 0.8 }}
                transition={{
                  scale: { duration: 0.1 },
                  layout: { duration: 0.3, type: "spring", stiffness: 300, damping: 30 }
                }}
                className="bg-[#1f2937]/50 backdrop-blur-xl border border-white/10 rounded-full h-16 flex items-center shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-95 transition-transform overflow-hidden"
              >
                <div 
                  onClick={() => setIsCartOpen(!isCartOpen)}
                  className="flex items-center cursor-pointer flex-1 pl-3"
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/20 mr-3">
                      <ShoppingCart size={20} />
                    </div>
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-[0.65rem] font-black border-2 border-[#1f2937]"
                    >
                      {totalItems}
                    </motion.div>
                  </div>
                  
                  <div className="flex flex-col whitespace-nowrap">
                    <span className="text-white text-sm font-black">{t.orderedItems(totalItems)}</span>
                    <span className="text-[0.6rem] text-gray-400 font-bold">{t.viewCart}</span>
                  </div>
                </div>

                <motion.button 
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('Cancel button clicked');
                    setShowClearCartConfirm(true);
                  }}
                  className="h-12 px-5 mr-2 rounded-full font-black text-sm transition-all flex items-center space-x-2 bg-gray-700/50 text-white border border-white/10 active:scale-95 whitespace-nowrap"
                >
                  <XCircle size={18} />
                  <span>{t.cancel}</span>
                </motion.button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

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
                className="fixed bottom-0 left-0 right-0 w-full bg-[#FDF5E6]/80 backdrop-blur-xl rounded-t-[3rem] z-40 flex flex-col shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.1)] border-t border-white/40 overflow-hidden touch-none"
              >
                {/* Step 1: Handle */}
                <div className="w-12 h-1.5 bg-gray-300/50 rounded-full mx-auto mt-4 mb-2 shrink-0 cursor-grab active:cursor-grabbing" />
                
                {/* Step 1 & 2: Header & Actions */}
                <div className="px-8 py-6 flex items-center justify-between border-b border-gray-100/50 shrink-0">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#8B0000]/10 flex items-center justify-center">
                      <ShoppingCart size={24} className="text-[#8B0000]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[#2C1E1E] leading-tight">{t.myOrder}</h3>
                      <p className="text-[0.7rem] text-gray-500 font-bold uppercase tracking-widest">{t.itemsSelected(totalItems)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button onClick={clearCart} className="text-xs font-black text-gray-400 hover:text-[#8B0000] transition-colors">{t.clearAll}</button>
                    <button onClick={() => setIsCartOpen(false)} className="w-10 h-10 rounded-full bg-gray-100/50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
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
                              key={`${item.id}-${getModifierSignature(item.modifiers)}`} 
                              className="flex items-center bg-[#FDF5E6]/90 backdrop-blur-md p-4 rounded-[2rem] shadow-sm border border-white/50"
                            >
                              <div className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden mr-4 bg-gray-100">
                                <DishImage src={getOptimizedImage(item.image)} alt={item.name} />
                              </div>
                              <div className="flex-1 min-w-0 mr-4">
                                <div className="text-[10px] font-black text-[#8B0000]/40 uppercase tracking-widest mb-1">
                                  {t.categories[item.category as keyof typeof t.categories] || item.category}
                                </div>
                                <h4 className="font-bold text-lg text-[#2C1E1E] truncate">{getLocalizedName(item)}</h4>
                                {item.modifiers && item.modifiers.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {item.modifiers.map((m, idx) => (
                                      <span key={idx} className="text-[10px] bg-[#8B0000]/5 text-[#8B0000] px-2 py-0.5 rounded-full font-bold">
                                        {getLocalizedModifierName(m)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center bg-gray-100/50 rounded-full p-1 shrink-0">
                                <button 
                                  onClick={() => removeFromCart(item)}
                                  className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-[#8B0000] hover:bg-white rounded-full transition-colors"
                                >
                                  <Minus size={18} strokeWidth={3} />
                                </button>
                                <span className="w-8 text-center font-black text-base text-[#2C1E1E]">{item.quantity}</span>
                                <button 
                                  onClick={(e) => incrementCartItem(item)}
                                  className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-[#8B0000] hover:bg-white rounded-full transition-colors"
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
                          <ScrollingPhrases 
                            phrases={appSettings.upsellPhrases && appSettings.upsellPhrases.length > 0 ? appSettings.upsellPhrases : t.upsellPhrases} 
                            fontSize={appSettings.upsellFontSize || 16}
                          />
                        </div>
                        <div className="flex overflow-x-auto gap-3 pb-2 no-scrollbar">
                          {(appSettings.upsellDishIds && appSettings.upsellDishIds.length > 0 
                            ? appSettings.upsellDishIds.map(id => dishes.find(d => d.id === id)).filter(Boolean) as Dish[]
                            : dishes.filter(d => d.category === '酒水类' && !cart.some(ci => ci.id === d.id)).slice(0, 4)
                          ).map(dish => (
                            <div key={dish.id} className="shrink-0 w-24 bg-piad-primary/5 rounded-2xl p-2 border border-piad-primary/5">
                              <div className="w-full aspect-square rounded-xl overflow-hidden mb-2 relative">
                                <DishImage src={getOptimizedImage(dish.image)} alt={dish.name} />
                                {dish.isSoldOut && (
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <span className="text-[8px] text-white font-bold px-1 py-0.5 bg-black/60 rounded">已售罄</span>
                                  </div>
                                )}
                              </div>
                              <h5 className="text-[10px] font-bold text-piad-text line-clamp-1 mb-1">{getLocalizedName(dish)}</h5>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-piad-primary">{t.currency}{dish.price}</span>
                                <button 
                                  disabled={dish.isSoldOut}
                                  onClick={(e) => handleAddToCart(dish, e)}
                                  className={`w-5 h-5 rounded-lg flex items-center justify-center shadow-piad border border-piad-primary/5 active:scale-90 transition-all ${
                                    dish.isSoldOut ? 'bg-gray-200 text-gray-400' : 'bg-piad-card text-piad-primary'
                                  }`}
                                >
                                  <Plus size={12} strokeWidth={3} />
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
              className="relative w-[80%] max-w-[400px] bg-[#FDF5E6]/95 backdrop-blur-xl rounded-[1.5rem] overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.2)] z-10 flex flex-col max-h-[85vh] border border-white/50"
            >
              <div className="relative w-full aspect-square overflow-hidden">
                <motion.div layoutId={`dish-image-${selectedDishForDetail.id}`} className="w-full h-full">
                  <DishImage 
                    src={getOptimizedImage(selectedDishForDetail.image)} 
                    alt={selectedDishForDetail.name}
                  />
                </motion.div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                <button 
                  onClick={() => setSelectedDishForDetail(null)}
                  className="absolute top-6 right-6 w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white z-10 hover:bg-black/40 transition-all border border-white/20"
                >
                  <X size={24} strokeWidth={2.5} />
                </button>
                {selectedDishForDetail.isRecommended && (
                  <div className="absolute top-6 left-6 bg-[#8B0000] text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg animate-pulse tracking-widest uppercase">
                    {t.recommended}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar overscroll-contain">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-3xl font-black text-[#2C1E1E] leading-tight">
                    {getLocalizedName(selectedDishForDetail)}
                  </h2>
                  <div className="text-2xl font-black text-[#8B0000]">
                    {t.currency}{selectedDishForDetail.price}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-[#8B0000]/40 uppercase tracking-[0.3em]">菜品故事 · Story</h4>
                  <p className="text-gray-600 leading-relaxed italic font-medium text-base">
                    “{getLocalizedDesc(selectedDishForDetail) || t.defaultDesc}”
                  </p>
                </div>

                {selectedDishForDetail.stock !== undefined && selectedDishForDetail.stock > 0 && selectedDishForDetail.stock <= 10 && (
                  <div className="bg-[#8B0000]/5 text-[#8B0000] px-4 py-2 rounded-xl inline-flex items-center space-x-2 text-sm font-black">
                    <span className="animate-bounce">🔥</span>
                    <span>{t.stockLeft(selectedDishForDetail.stock)}</span>
                  </div>
                )}
              </div>

              <div className="p-8 bg-[#FDF5E6]/60 backdrop-blur-md border-t border-gray-100/50">
                <button
                  onClick={(e) => {
                    handleAddToCart(selectedDishForDetail, e);
                    setSelectedDishForDetail(null);
                  }}
                  className="w-full py-5 bg-[#8B0000] text-white rounded-2xl font-black text-xl shadow-lg shadow-[#8B0000]/20 active:scale-[0.98] transition-all flex items-center justify-center space-x-3"
                >
                  <Plus size={24} strokeWidth={3} />
                  <span>加入我的菜单</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Duplicate Dish Confirmation Modal */}
      <AnimatePresence mode="wait">
        {duplicateConfirmItem && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDuplicateConfirmItem(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-[#f2f1ed] rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-piad-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Bell className="text-piad-primary" size={32} />
                </div>
                <h3 className="text-xl font-black text-piad-text mb-3">{t.duplicateReminderTitle}</h3>
                <p className="text-piad-subtext font-medium leading-relaxed">
                  {t.duplicateReminderDesc(getLocalizedName(duplicateConfirmItem.dish))}
                </p>
              </div>
              <div className="p-4 bg-[#e8e7e2] flex flex-col gap-3">
                <button 
                  onClick={() => {
                    if (duplicateConfirmItem.modifiers) {
                      handleAddWithModifiers(duplicateConfirmItem.dish, duplicateConfirmItem.modifiers, undefined, true, duplicateConfirmItem.startPos);
                    } else {
                      handleAddToCart(duplicateConfirmItem.dish, undefined, true, duplicateConfirmItem.startPos);
                    }
                    setDuplicateConfirmItem(null);
                  }}
                  className="w-full bg-piad-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-piad-primary/20 active:scale-[0.98] transition-all"
                >
                  {t.duplicateConfirm}
                </button>
                <button 
                  onClick={() => setDuplicateConfirmItem(null)}
                  className="w-full bg-[#f2f1ed] text-piad-subtext py-4 rounded-2xl font-bold border border-black/5 active:scale-[0.98] transition-all"
                >
                  {t.duplicateCancel}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showClearCartConfirm && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearCartConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-[#f2f1ed] rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="text-red-500" size={32} />
                </div>
                <h3 className="text-xl font-black text-piad-text mb-3">{t.clearCartConfirmTitle}</h3>
                <p className="text-piad-subtext font-medium leading-relaxed">
                  {t.clearCartConfirmDesc}
                </p>
              </div>
              <div className="p-4 bg-[#e8e7e2] flex flex-col gap-3">
                <button 
                  onClick={() => {
                    console.log('User confirmed clear cart via custom modal');
                    clearCart();
                    setShowClearCartConfirm(false);
                  }}
                  className="w-full bg-red-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all"
                >
                  {t.confirm}
                </button>
                <button 
                  onClick={() => setShowClearCartConfirm(false)}
                  className="w-full bg-white text-piad-text py-4 rounded-2xl font-black border border-piad-text/10 active:scale-[0.98] transition-all"
                >
                  {t.cancel}
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
                    <h3 className="text-xl font-black text-piad-text">{getLocalizedName(selectedDishForSpecs)}</h3>
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

      {/* AI Ordering Assistant */}
      {!isAdminOpen && (
        <AIAssistant 
          dishes={dishes} 
          handleAddToCart={handleAddToCart} 
          totalItems={totalItems}
          onSearch={(query) => setSearchQuery(query)}
        />
      )}
    </div>
  );
}
