import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send, Bot, User, Loader2, Plus, ShoppingCart } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { Dish } from '../constants';

interface AIAssistantProps {
  dishes: Dish[];
  handleAddToCart: (dish: Dish) => void;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ dishes, handleAddToCart }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: '您好！我是您的智能点餐管家。请问有什么可以帮您的？您可以直接告诉我您想吃什么。' }
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const addToCartTool = {
        name: "addToCart",
        description: "将菜品添加到购物车。当用户说'点一份[菜名]'或类似表达时调用。",
        parameters: {
          type: Type.OBJECT,
          properties: {
            itemName: {
              type: Type.STRING,
              description: "菜品的名称",
            },
          },
          required: ["itemName"],
        },
      };

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: `你是一个高端餐厅的智能点餐管家。你的语气应该优雅、礼貌、专业。
          餐厅的菜品列表如下：
          ${dishes.map(d => `- ${d.name} (价格: ¥${d.price})`).join('\n')}
          
          如果用户想点餐，请使用 addToCart 工具。
          如果用户询问菜品推荐，请根据菜单给出建议。
          如果用户点的菜不在菜单上，请礼貌地告知并推荐类似的菜品。`,
          tools: [{ functionDeclarations: [addToCartTool] }],
        },
      });

      const functionCalls = response.functionCalls;
      if (functionCalls) {
        for (const call of functionCalls) {
          if (call.name === 'addToCart') {
            const { itemName } = call.args as { itemName: string };
            const dish = dishes.find(d => d.name.includes(itemName) || itemName.includes(d.name));
            
            if (dish) {
              handleAddToCart(dish);
              setMessages(prev => [...prev, { role: 'model', text: `好的，已为您将“${dish.name}”加入购物车。还需要点别的吗？` }]);
            } else {
              setMessages(prev => [...prev, { role: 'model', text: `抱歉，我没能找到名为“${itemName}”的菜品。您可以看看我们的招牌烤鱼或者其他特色菜。` }]);
            }
          }
        }
      } else {
        setMessages(prev => [...prev, { role: 'model', text: response.text || '抱歉，我现在无法回答。' }]);
      }
    } catch (error) {
      console.error('AI Assistant Error:', error);
      setMessages(prev => [...prev, { role: 'model', text: '抱歉，系统繁忙，请稍后再试。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[1000] font-sans">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-20 right-0 w-[350px] max-w-[90vw] h-[500px] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-piad-primary p-4 flex items-center justify-between text-white">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Bot size={24} />
                </div>
                <div>
                  <h3 className="font-black text-sm">智能点餐管家</h3>
                  <p className="text-[10px] opacity-80">AI Ordering Assistant</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
              {messages.map((msg, idx) => (
                <motion.div
                  initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex max-w-[80%] items-start space-x-2 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-piad-primary text-white' : 'bg-white border border-gray-100 text-piad-primary shadow-sm'}`}>
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-piad-primary text-white rounded-tr-none' 
                        : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center space-x-2 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                    <Loader2 size={16} className="animate-spin text-piad-primary" />
                    <span className="text-xs text-gray-400">正在思考...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-gray-100">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="输入您想点的菜品..."
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 pr-12 text-sm outline-none focus:border-piad-primary/30 transition-colors"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-piad-primary disabled:text-gray-300 transition-colors"
                >
                  <Send size={20} />
                </button>
              </div>
              <p className="text-[10px] text-center text-gray-400 mt-2">
                Powered by Gemini AI
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-colors ${
          isOpen ? 'bg-white text-piad-primary border border-gray-100' : 'bg-piad-primary text-white'
        }`}
      >
        {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-piad-primary text-[10px] font-black rounded-full flex items-center justify-center border-2 border-piad-primary animate-bounce">
            AI
          </span>
        )}
      </motion.button>
    </div>
  );
};
