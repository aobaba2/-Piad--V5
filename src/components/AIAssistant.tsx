import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send, Bot, User, Loader2, Plus, ShoppingCart, Sparkles, ChevronDown } from 'lucide-react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Dish } from '../constants';

interface AIAssistantProps {
  dishes: Dish[];
  handleAddToCart: (dish: Dish) => void;
  totalItems?: number;
  onSearch?: (query: string) => void;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ dishes, handleAddToCart, totalItems = 0, onSearch }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: '您好！我是您的智能点餐管家。很高兴为您服务，请问今天想品尝点什么？' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('小美正在思考中...');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadingPhrases = [
    '小美正在为您准备建议...',
    '正在为您翻阅菜单...',
    '请稍等，小美马上就来...',
    '正在为您挑选最适合的美味...',
    '小美正在努力思考中...',
    '美味值得等待，请稍后...'
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setLoadingMessage(loadingPhrases[0]);
      let i = 0;
      interval = setInterval(() => {
        i = (i + 1) % loadingPhrases.length;
        setLoadingMessage(loadingPhrases[i]);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getApiKey = () => {
    // Priority 1: Vite environment variables (Standard for this setup)
    const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (viteKey) return viteKey;

    // Priority 2: Alternative Vite access
    const altViteKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (altViteKey) return altViteKey;

    // Priority 3: Process env (Fallback for some environments)
    try {
      const processKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : null;
      if (processKey) return processKey;
    } catch (e) {
      // Ignore process errors
    }

    return null;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error('API_KEY_MISSING');

      const ai = new GoogleGenAI({ apiKey });
      
      const addToCartTool = {
        name: "addToCart",
        description: "将菜品添加到购物车",
        parameters: {
          type: Type.OBJECT,
          properties: {
            itemName: { type: Type.STRING },
          },
          required: ["itemName"],
        },
      };

      const searchDishesTool = {
        name: "searchDishes",
        description: "搜索餐厅菜单中的菜品",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "搜索关键词，例如：鱼、辣、凉菜" },
          },
          required: ["query"],
        },
      };

      const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

      const streamResponse = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: [
          ...messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: `你是一个在“巫山烤鱼”餐厅工作了10年的明星领班“小美”。
          
          今天是：${today}。请确保你提到的日期与此一致。
          
          核心职责：
          1. 餐厅专家：熟悉菜单（烤鱼、毛血旺、小龙虾等），引导客人点餐。
          2. 搜索达人：如果客人想找某种菜品，请使用 searchDishes 工具帮他们过滤菜单。
          3. 全能助手：博学多才，能吟诗、讲笑话、聊生活。
          
          规则：
          1. 语气：甜美、大方、得体。多用“亲”、“为您服务是我的荣幸”。
          2. 工具：点餐请用 addToCart，搜索请用 searchDishes。
          3. 表达：简洁精炼，避免啰嗦，方便手机阅读。
          4. 互动：客人问任何生活问题都要温柔回答。`,
          tools: [{ functionDeclarations: [addToCartTool, searchDishesTool] }],
        },
      });

      let fullText = '';
      let hasReceivedData = false;

      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      for await (const chunk of streamResponse) {
        if (!hasReceivedData) {
          hasReceivedData = true;
          setIsLoading(false);
        }
        const chunkText = chunk.text || '';
        fullText += chunkText;

        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].text = fullText;
          return newMessages;
        });

        const functionCalls = chunk.functionCalls;
        if (functionCalls) {
          for (const call of functionCalls) {
            if (call.name === 'addToCart') {
              const { itemName } = call.args as { itemName: string };
              const dish = dishes.find(d => d.name.includes(itemName) || itemName.includes(d.name));
              if (dish) {
                handleAddToCart(dish);
                const reply = `好的亲！已为您将“${dish.name}”加入购物车。这可是咱们家的招牌，您真有眼光！还需要点别的吗？`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].text = reply;
                  return newMessages;
                });
              }
            } else if (call.name === 'searchDishes') {
              const { query } = call.args as { query: string };
              if (onSearch) {
                onSearch(query);
                const reply = `好的亲！正在为您查找关于“${query}”的美味。您看，这些都是领班为您精挑细选的哦~ 还有什么想吃的吗？`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].text = reply;
                  return newMessages;
                });
              }
            }
          }
        }
      }

      // If loop finished but no data was received, show a fallback
      if (!hasReceivedData && !fullText) {
        throw new Error('NO_DATA_RECEIVED');
      }
    } catch (error: any) {
      console.error('AI Assistant Error:', error);
      let errorMsg = '哎呀亲，网络好像有点调皮，请稍后再试哦。';
      
      const errorStr = error?.message || JSON.stringify(error);
      const isQuotaError = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || error?.status === 'RESOURCE_EXHAUSTED';

      if (error.message === 'API_KEY_MISSING') {
        errorMsg = '哎呀亲，领班还没领到开工钥匙（API Key 未配置），请联系管理员检查后台设置哦。';
      } else if (isQuotaError) {
        errorMsg = '哎呀亲，今天客流量实在太大，领班的小脑袋转不过来了（配额超限）。请稍等片刻再来找我哦，么么哒~';
      } else if (error.message === 'NO_DATA_RECEIVED') {
        errorMsg = '哎呀亲，信号好像断了一下，我没听清您说什么，能再跟我说一遍吗？';
      }
      
      setMessages(prev => {
        const newMessages = [...prev];
        // If the last message is from model and is empty, update it instead of adding a new one
        if (newMessages.length > 0 && 
            newMessages[newMessages.length - 1].role === 'model' && 
            !newMessages[newMessages.length - 1].text) {
          newMessages[newMessages.length - 1].text = errorMsg;
          return newMessages;
        }
        return [...prev, { role: 'model', text: errorMsg }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      drag
      dragMomentum={false}
      dragElastic={0.1}
      dragConstraints={{ left: -window.innerWidth + 100, right: 0, top: -window.innerHeight + 200, bottom: 0 }}
      animate={{
        bottom: totalItems > 0 ? 96 : 24
      }}
      transition={{
        bottom: { duration: 0.3, type: "spring", stiffness: 300, damping: 30 }
      }}
      className="fixed right-[20px] z-[9999] font-sans pointer-events-auto touch-none"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="absolute bottom-16 right-0 w-[380px] max-w-[95vw] h-[600px] max-h-[75vh] bg-[#FDF5E6] rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] border border-white/40 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-[#FDF5E6] p-6 flex items-center justify-between relative overflow-hidden border-b border-gray-200/50">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')] opacity-50"></div>
              <div className="flex items-center space-x-4 relative z-10">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full border-2 border-white shadow-md overflow-hidden">
                    <img src="https://i.imgur.com/ooDFYf8.png" alt="小美" className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#4CAF50] border-2 border-white rounded-full"></div>
                </div>
                <div>
                  <h3 className="font-black text-xl text-[#2C1E1E] tracking-tight">AI小美点餐管家</h3>
                  <div className="flex items-center space-x-1">
                    <span className="text-xs font-medium text-gray-500">专业领班 · 竭诚为您服务</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-black/5 rounded-full transition-colors relative z-10"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 relative no-scrollbar">
              {/* Ink Wash Background */}
              <div className="absolute inset-0 z-0">
                <img 
                  src="https://images.unsplash.com/photo-1518544861944-177dbdd12f71?q=80&w=2069&auto=format&fit=crop" 
                  alt="Background" 
                  className="w-full h-full object-cover opacity-20 blur-[2px]"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#FDF5E6]/80 via-transparent to-[#FDF5E6]/80"></div>
              </div>

              <div className="relative z-10 space-y-6">
                {messages.map((msg, idx) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex max-w-[85%] items-start space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                      {msg.role === 'model' && (
                        <div className="w-9 h-9 rounded-full border border-white shadow-sm overflow-hidden flex-shrink-0">
                          <img src="https://i.imgur.com/ooDFYf8.png" alt="小美" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className={`p-4 rounded-[1.5rem] text-[16px] font-medium leading-relaxed shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-[#8B0000] text-white rounded-tr-none' 
                          : 'bg-white/90 backdrop-blur-md text-gray-800 border border-white/50 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="flex items-center space-x-3 bg-white/50 backdrop-blur-sm p-4 rounded-[1.5rem] border border-white/50 shadow-sm">
                      <div className="w-9 h-9 rounded-full border border-white shadow-sm overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-[#8B0000] animate-spin" />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex space-x-1 mb-1">
                          <div className="w-1.5 h-1.5 bg-[#8B0000] rounded-full animate-bounce"></div>
                          <div className="w-1.5 h-1.5 bg-[#8B0000] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-1.5 h-1.5 bg-[#8B0000] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        </div>
                        <span className="text-xs font-black text-[#8B0000]/60 italic tracking-tight">
                          {loadingMessage}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="p-8 bg-[#FDF5E6] relative border-t border-gray-200/30">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')] opacity-30"></div>
              <div className="relative z-10 flex items-center bg-white/80 backdrop-blur-md rounded-full border border-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] px-2 py-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="想吃点什么？"
                  className="flex-1 bg-transparent px-6 py-3 text-[16px] font-medium outline-none text-gray-700 placeholder-gray-400"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="w-14 h-14 bg-[#F3E5D0] text-[#8B0000] rounded-full flex items-center justify-center shadow-sm disabled:opacity-30 transition-all hover:scale-105 active:scale-95 border border-white"
                >
                  <Send size={24} className="transform rotate-[-10deg]" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <div className="relative flex flex-col items-center">
        <motion.div
          style={{ 
            perspective: 1000,
            transformStyle: 'preserve-3d'
          }}
          animate={{ rotateY: isOpen ? 0 : [0, 180, 180, 0] }}
          transition={isOpen ? { duration: 0.3 } : {
            duration: 6,
            repeat: Infinity,
            repeatDelay: 2,
            times: [0, 0.1, 0.5, 0.6]
          }}
          className="relative w-[70px] h-[70px] cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          {/* Front Side: Avatar */}
          <motion.div
            className={`absolute inset-0 w-full h-full rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.4)] flex items-center justify-center border-2 transition-all duration-300 overflow-hidden ${
              isOpen ? 'border-[#8B0000] scale-105' : 'border-[#FFD700]'
            }`}
            style={{
              backfaceVisibility: 'hidden',
              backgroundImage: 'url(https://i.imgur.com/ooDFYf8.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              WebkitBackfaceVisibility: 'hidden'
            }}
          >
            {!isOpen && (
              <div className="absolute top-[5px] right-[5px] w-3 h-3 bg-[#4CAF50] border-2 border-white rounded-full shadow-sm z-30" />
            )}
            {!isOpen && (
              <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#8B0000] text-[#D4AF37] text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#D4AF37] shadow-lg z-20">
                AI
              </span>
            )}
          </motion.div>

          {/* Back Side: Text */}
          <motion.div
            className="absolute inset-0 w-full h-full rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.4)] flex flex-col items-center justify-center border-2 border-[#FFD700] bg-gradient-to-br from-[#8B0000] to-[#A52A2A] text-[#D4AF37]"
            style={{
              backfaceVisibility: 'hidden',
              rotateY: 180,
              WebkitBackfaceVisibility: 'hidden'
            }}
          >
            <div className="flex flex-col items-center justify-center leading-none">
              <span className="text-[20px] font-black mb-1">点餐</span>
              <span className="text-[20px] font-black">助手</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>

  );
};
