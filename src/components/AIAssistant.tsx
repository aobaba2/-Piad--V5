import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send, Bot, User, Loader2, Plus, ShoppingCart, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
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
    { role: 'model', text: '您好！我是您的智能点餐管家。很高兴为您服务，请问今天想品尝点什么？' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getApiKey = () => {
    // Priority 1: AI Studio environment key
    const studioKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : null;
    if (studioKey) return studioKey;

    // Priority 2: Vite prefixed keys (Required for Vite apps on Vercel/Netlify)
    const viteKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || 
                   (import.meta as any).env?.VITE_NEXT_PUBLIC_GEMINI_API_KEY;
    if (viteKey) return viteKey;

    // Priority 3: Next.js style keys (if running in a hybrid environment)
    const nextKey = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_GEMINI_API_KEY : null;
    if (nextKey) return nextKey;

    return null;
  };

  const playAudio = async (base64Audio: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // The gemini-2.5-flash-preview-tts model returns raw 16-bit PCM data at 24000Hz
      const int16Data = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      setIsSpeaking(true);
      source.onended = () => setIsSpeaking(false);
      source.start(0);
    } catch (error) {
      console.error('Audio playback error:', error);
      setIsSpeaking(false);
    }
  };

  const speak = async (text: string) => {
    if (!isVoiceEnabled) return;
    
    const apiKey = getApiKey();
    if (!apiKey) return;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        await playAudio(base64Audio);
      }
    } catch (error) {
      console.error('TTS Error:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        console.error('Missing Gemini API Key. Please set VITE_GEMINI_API_KEY in Vercel.');
        throw new Error('API_KEY_MISSING');
      }

      const ai = new GoogleGenAI({ apiKey });
      
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
          systemInstruction: `你是一个在“巫山烤鱼”餐厅工作了10年的明星领班。你的语气应该热情、专业、幽默，深谙客人的点餐心理。
          餐厅的菜品列表如下：
          ${dishes.map(d => `- ${d.name} (价格: ¥${d.price})`).join('\n')}
          
          规则：
          1. 必须使用中文。
          2. 如果用户想点餐，请使用 addToCart 工具。
          3. 语气亲切，多用“亲”、“为您推荐”、“咱们家”等词。
          4. 每次回答尽量简洁，方便手机阅读。
          5. 如果点了烤鱼，主动询问辣度。`,
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
              const reply = `好的亲！已为您将“${dish.name}”加入购物车。咱们家的这道菜可是回头客的最爱，还需要点别的吗？`;
              setMessages(prev => [...prev, { role: 'model', text: reply }]);
              speak(reply);
            } else {
              const reply = `哎呀亲，真抱歉，咱们家暂时没有“${itemName}”这道菜。要不我给您推荐一下咱们最火的巫山招牌烤鱼？保准您吃了还想吃！`;
              setMessages(prev => [...prev, { role: 'model', text: reply }]);
              speak(reply);
            }
          }
        }
      } else {
        const reply = response.text || '抱歉亲，我刚才走神了，您能再说一遍吗？';
        setMessages(prev => [...prev, { role: 'model', text: reply }]);
        speak(reply);
      }
    } catch (error: any) {
      console.error('AI Assistant Error:', error);
      let errorMsg = '哎呀亲，网络好像有点调皮，请稍后再试哦。';
      if (error.message === 'API_KEY_MISSING') {
        errorMsg = '哎呀亲，领班还没领到开工钥匙（API Key 未配置），请联系管理员检查后台设置哦。';
      }
      setMessages(prev => [...prev, { role: 'model', text: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-24 right-6 z-[9999] font-sans pointer-events-auto">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="absolute bottom-16 right-0 w-[380px] max-w-[95vw] h-[600px] max-h-[75vh] bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(139,0,0,0.3)] border border-white/20 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#8B0000] via-[#A52A2A] to-[#8B0000] p-6 flex items-center justify-between text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
              <div className="flex items-center space-x-4 relative z-10">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
                    <Bot size={28} className="text-[#8B0000]" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full animate-pulse"></div>
                </div>
                <div>
                  <h3 className="font-black text-lg tracking-tight">明星领班 · 智能管家</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37]">Premium Assistant</span>
                    <div className="w-1 h-1 rounded-full bg-[#D4AF37]"></div>
                    <span className="text-[10px] font-medium text-white/70">在线为您服务</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 relative z-10">
                <button 
                  onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                  className={`p-2 rounded-xl transition-all ${isVoiceEnabled ? 'bg-white/20 text-[#D4AF37]' : 'bg-white/10 text-white/40'}`}
                  title={isVoiceEnabled ? "关闭语音" : "开启语音"}
                >
                  {isVoiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-gray-50 to-white no-scrollbar">
              {messages.map((msg, idx) => (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex max-w-[85%] items-start space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${
                      msg.role === 'user' 
                        ? 'bg-gradient-to-br from-[#8B0000] to-[#A52A2A] text-white' 
                        : 'bg-white border border-gray-100 text-[#8B0000]'
                    }`}>
                      {msg.role === 'user' ? <User size={18} /> : <Sparkles size={18} className="text-[#D4AF37]" />}
                    </div>
                    <div className={`p-4 rounded-[1.5rem] text-[15px] leading-relaxed shadow-sm relative ${
                      msg.role === 'user' 
                        ? 'bg-[#8B0000] text-white rounded-tr-none' 
                        : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                    }`}>
                      {msg.text}
                      {msg.role === 'model' && isSpeaking && idx === messages.length - 1 && (
                        <div className="absolute -bottom-4 left-0 flex space-x-1">
                          <div className="w-1 h-3 bg-[#D4AF37] animate-[bounce_1s_infinite_0ms]"></div>
                          <div className="w-1 h-3 bg-[#D4AF37] animate-[bounce_1s_infinite_200ms]"></div>
                          <div className="w-1 h-3 bg-[#D4AF37] animate-[bounce_1s_infinite_400ms]"></div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center space-x-3 bg-white/50 backdrop-blur-sm p-4 rounded-[1.5rem] border border-gray-100 shadow-sm">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-[#8B0000] rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-[#8B0000] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-[#8B0000] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    </div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">领班正在为您准备...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-6 bg-white border-t border-gray-100">
              <div className="relative group">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="想吃点什么？直接告诉我吧..."
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-[1.5rem] px-6 py-4 pr-16 text-[15px] outline-none focus:border-[#8B0000]/20 focus:bg-white transition-all shadow-inner"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 bg-gradient-to-br from-[#8B0000] to-[#A52A2A] text-white rounded-2xl flex items-center justify-center shadow-lg disabled:opacity-30 disabled:grayscale transition-all hover:scale-105 active:scale-95"
                >
                  <Send size={20} />
                </button>
              </div>
              <div className="flex items-center justify-center space-x-2 mt-4">
                <div className="h-[1px] w-8 bg-gray-100"></div>
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">
                  Premium AI Concierge
                </p>
                <div className="h-[1px] w-8 bg-gray-100"></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <div className="relative flex flex-col items-center">
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute -top-14 bg-gradient-to-r from-[#8B0000] to-[#A52A2A] text-[#D4AF37] text-[11px] font-black px-4 py-2 rounded-full border-2 border-[#D4AF37] shadow-[0_10px_25px_-5px_rgba(139,0,0,0.4)] whitespace-nowrap z-20"
          >
            <div className="flex items-center space-x-2">
              <Sparkles size={12} className="animate-pulse" />
              <span>明星领班在线</span>
            </div>
            {/* Arrow */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-[#D4AF37]"></div>
          </motion.div>
        )}
        <motion.button
          whileHover={{ scale: 1.1, rotate: 5 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-16 h-16 rounded-[1.5rem] shadow-[0_15px_35px_-10px_rgba(139,0,0,0.5)] flex items-center justify-center transition-all duration-500 border-2 relative overflow-hidden group ${
            isOpen 
              ? 'bg-white text-[#8B0000] border-gray-100' 
              : 'bg-gradient-to-br from-[#D4AF37] via-[#FFD700] to-[#B8860B] text-[#8B0000] border-[#8B0000]'
          }`}
        >
          {/* Shine effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
          
          {isOpen ? <X size={32} /> : <Bot size={32} className="relative z-10" />}
          
          {!isOpen && (
            <span className="absolute -top-1 -right-1 w-6 h-6 bg-[#8B0000] text-[#D4AF37] text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#D4AF37] shadow-lg z-20">
              AI
            </span>
          )}
        </motion.button>
      </div>
    </div>
  );
};
