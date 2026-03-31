export interface DishModifier {
  name: string;
  name_en?: string;
  name_ko?: string;
  price: number;
  group?: string;
  groupRequired?: boolean;
}

export interface Dish {
  id: string;
  name: string;
  name_en?: string;
  name_ko?: string;
  price: number;
  image: string;
  category: string;
  description?: string;
  description_en?: string;
  description_ko?: string;
  tags?: string[];
  isRecommended?: boolean;
  order?: number;
  isSoldOut?: boolean;
  stock?: number;
  clickCount?: number;
  modifiers?: DishModifier[];
}

export interface Settings {
  currency: 'KRW' | 'CNY' | 'USD';
  language: 'zh' | 'en' | 'ko';
  restaurantName: string;
  searchPlaceholders?: string[];
  coverHistory?: string;
  coverAddress?: string;
  coverPhone?: string;
  coverImage?: string;
}

export interface Banner {
  id: string;
  image: string;
  title: string;
  dishId?: string;
}

export interface Table {
  id: string;
  number: string;
  status: 'idle' | 'active';
  sessionToken?: string;
  lastOrderAt?: string;
}

export const formatPrice = (price: number, currency: string = 'KRW') => {
  const symbols: Record<string, string> = {
    'KRW': '₩',
    'CNY': '¥',
    'USD': '$'
  };
  const symbol = symbols[currency] || '₩';
  return `${symbol}${Math.round(price).toLocaleString()}`;
};

export const CATEGORIES = [
  "招牌烤鱼",
  "东北菜",
  "川菜",
  "肉菜类",
  "素菜类",
  "海鲜类",
  "主食类",
  "酒水类",
  "啤酒菜"
];

export const DISHES: Dish[] = [
  {
    id: "1",
    name: "巫山招牌香辣烤鱼",
    price: 138,
    image: "https://picsum.photos/seed/grilledfish1/600/400",
    category: "招牌烤鱼",
    description: "选用3斤以上活草鱼，秘制红油炒制，外焦里嫩。",
    tags: ["招牌", "必点"],
    isRecommended: true
  },
  {
    id: "2",
    name: "金牌蒜香烤鱼",
    price: 138,
    image: "https://picsum.photos/seed/grilledfish2/600/400",
    category: "招牌烤鱼",
    description: "浓郁蒜香，不辣首选，汤汁拌饭一绝。",
    tags: ["老少皆宜"],
    isRecommended: true
  },
  {
    id: "3",
    name: "东北锅包肉",
    price: 62,
    image: "https://picsum.photos/seed/guobaorou/600/400",
    category: "东北菜",
    description: "经典老式做法，酸甜适口，酥脆掉渣。",
    tags: ["经典"]
  },
  {
    id: "4",
    name: "小鸡炖蘑菇",
    price: 88,
    image: "https://picsum.photos/seed/chicken/600/400",
    category: "东北菜",
    description: "选用长白山榛蘑，鸡肉鲜嫩入味。",
  },
  {
    id: "5",
    name: "四川毛血旺",
    price: 78,
    image: "https://picsum.photos/seed/maoxuewang/600/400",
    category: "川菜",
    description: "麻辣鲜香，配料丰富，正宗川味。",
    tags: ["麻辣"]
  },
  {
    id: "6",
    name: "鱼香肉丝",
    price: 42,
    image: "https://picsum.photos/seed/yuxiang/600/400",
    category: "川菜",
    description: "酸辣甜咸四味俱全，下饭神器。",
  },
  {
    id: "7",
    name: "辣炒花蛤",
    price: 52,
    image: "https://picsum.photos/seed/huaga/600/400",
    category: "啤酒菜",
    description: "鲜活花蛤，爆炒入味，下酒必备。",
    tags: ["下酒"]
  },
  {
    id: "8",
    name: "椒盐皮皮虾",
    price: 98,
    image: "https://picsum.photos/seed/shrimp/600/400",
    category: "海鲜类",
    description: "外酥里嫩，椒香浓郁。",
  },
  {
    id: "9",
    name: "红烧肉",
    price: 68,
    image: "https://picsum.photos/seed/pork/600/400",
    category: "肉菜类",
    description: "肥而不腻，入口即化。",
  },
  {
    id: "10",
    name: "清炒时蔬",
    price: 28,
    image: "https://picsum.photos/seed/veg/600/400",
    category: "素菜类",
    description: "时令鲜菜，清脆爽口。",
  },
  {
    id: "11",
    name: "扬州炒饭",
    price: 32,
    image: "https://picsum.photos/seed/rice/600/400",
    category: "主食类",
    description: "粒粒分明，配料丰富。",
  },
  {
    id: "12",
    name: "青岛原浆啤酒",
    price: 18,
    image: "https://picsum.photos/seed/beer/600/400",
    category: "酒水类",
    description: "新鲜原浆，口感醇厚。",
  }
];
