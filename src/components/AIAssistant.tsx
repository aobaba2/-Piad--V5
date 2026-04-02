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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        hasReceivedData = true;
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
          <>
            {/* Backdrop for focus */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[-1]"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 m-auto w-[85vw] h-[80vh] max-w-5xl bg-white rounded-[2.5rem] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.3)] border border-gray-100 flex flex-col overflow-hidden z-50"
            >
              {/* Header */}
              <div className="bg-white border-b border-gray-50 p-6 flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-5">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full border-2 border-[#D4AF37]/30 p-1 shadow-sm overflow-hidden bg-gray-50">
                      <img 
                        src="https://i.imgur.com/ooDFYf8.png" 
                        alt="小美" 
                        className="w-full h-full object-cover rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 border-2 border-white rounded-full shadow-sm"></div>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-xl tracking-tight">AI小美点餐管家</h3>
                    <p className="text-xs font-medium text-gray-400 mt-0.5 tracking-wide">专业领班 · 竭诚为您服务</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-3 hover:bg-gray-50 rounded-full transition-all text-gray-400 hover:text-gray-900 group"
                    title="最小化"
                  >
                    <ChevronDown size={24} className="group-hover:translate-y-0.5 transition-transform" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-[#FDFDFD] no-scrollbar">
                {messages.map((msg, idx) => (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex max-w-[75%] items-start space-x-5 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden ${
                        msg.role === 'user' 
                          ? 'bg-gray-900 text-white' 
                          : 'bg-white border border-gray-100'
                      }`}>
                        {msg.role === 'user' ? (
                          <User size={22} />
                        ) : (
                          <img 
                            src="https://i.imgur.com/ooDFYf8.png" 
                            alt="小美" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                      <div className={`p-6 rounded-[2rem] text-[16px] leading-relaxed shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] relative ${
                        msg.role === 'user' 
                          ? 'bg-[#8B0000] text-white rounded-tr-none' 
                          : 'bg-white text-gray-700 border border-gray-50 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center space-x-5 bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-[#8B0000] rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-[#8B0000] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-[#8B0000] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      </div>
                      <span className="text-sm font-medium text-gray-400">小美正在为您准备中...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-10 bg-white border-t border-gray-50">
                <div className="relative group max-w-4xl mx-auto">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="想吃点什么？直接告诉我吧..."
                    className="w-full bg-gray-50 border border-gray-100 rounded-[2.5rem] px-10 py-6 pr-24 text-[17px] outline-none focus:border-[#8B0000]/20 focus:bg-white focus:shadow-2xl transition-all placeholder:text-gray-300"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-16 h-16 bg-gradient-to-br from-[#8B0000] to-[#A52A2A] text-white rounded-full flex items-center justify-center shadow-xl disabled:opacity-10 disabled:grayscale transition-all hover:scale-105 active:scale-95"
                  >
                    <Send size={24} />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
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
