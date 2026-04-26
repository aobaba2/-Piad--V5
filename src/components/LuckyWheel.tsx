import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';
import { Gift, X, Trophy, Star, Sparkles, PartyPopper } from 'lucide-react';
import { LuckyPrize } from '../constants';

interface LuckyWheelProps {
  prizes: LuckyPrize[];
  onWin: (prize: LuckyPrize) => void;
  onClose: () => void;
}

export const LuckyWheel: React.FC<LuckyWheelProps> = ({ prizes, onWin, onClose }) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<LuckyPrize | null>(null);
  const controls = useAnimation();
  const wheelRef = useRef<HTMLDivElement>(null);

  // Vibrant color palette for segments
  const colors = [
    '#FF4D4D', // Red
    '#FF9F43', // Orange
    '#FFD93D', // Yellow
    '#6BCB77', // Green
    '#4D96FF', // Blue
    '#9B59B6', // Purple
    '#F368E0', // Pink
    '#1DD1A1', // Teal
  ];

  const [tick, setTick] = useState(0);

  const spin = async () => {
    if (isSpinning || prizes.length === 0) return;

    setIsSpinning(true);
    setResult(null);

    // Calculate result based on probability
    const random = Math.random();
    let cumulativeProbability = 0;
    let winningPrize = prizes[0]; // Initial fallback to first prize

    // First pass: try to find a prize strictly by probability
    let found = false;
    for (const prize of prizes) {
      const prob = typeof prize.probability === 'number' ? prize.probability : parseFloat(String(prize.probability || 0));
      if (isNaN(prob)) continue;
      
      cumulativeProbability += prob;
      if (random <= cumulativeProbability) {
        winningPrize = prize;
        found = true;
        break;
      }
    }

    // Second pass: if no prize was found (e.g. sum < 1.0 and random > sum), 
    // fallback to a 'none' type prize if available, otherwise just use the last one
    if (!found) {
      const nonePrize = prizes.find(p => p.type === 'none');
      if (nonePrize) {
        winningPrize = nonePrize;
      } else {
        winningPrize = prizes[prizes.length - 1];
      }
    }

    const prizeIndex = prizes.indexOf(winningPrize);
    const segmentAngle = 360 / prizes.length;
    const extraSpins = 8 + Math.floor(Math.random() * 5); // 8-13 full spins for more excitement
    
    const targetAngle = extraSpins * 360 + (360 - (prizeIndex * segmentAngle + segmentAngle / 2));

    // Simulate tick effect
    const totalDuration = 6000; // 6 seconds
    const startTime = Date.now();
    const tickInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / totalDuration;
      if (progress >= 1) {
        clearInterval(tickInterval);
        return;
      }
      // Simple tick simulation based on rotation progress
      setTick(prev => prev + 1);
    }, 100);

    await controls.start({
      rotate: targetAngle,
      transition: { duration: 6, ease: [0.15, 0, 0.15, 1] }
    });

    clearInterval(tickInterval);
    setIsSpinning(false);
    setResult(winningPrize);
    onWin(winningPrize);
  };

  // Helper to create SVG arc paths
  const getArcPath = (startAngle: number, endAngle: number, radius: number) => {
    const start = polarToCartesian(radius, radius, radius, endAngle);
    const end = polarToCartesian(radius, radius, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
      "M", radius, radius,
      "L", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      "Z"
    ].join(" ");
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/90 backdrop-blur-xl"
        onClick={() => !isSpinning && onClose()}
      />

      <motion.div 
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 50 }}
        className="relative z-10 w-full max-w-md bg-[#111] rounded-[3.5rem] p-8 border border-white/5 shadow-[0_0_100px_rgba(255,77,77,0.1)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated Background Particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                x: Math.random() * 400, 
                y: Math.random() * 600,
                opacity: Math.random() * 0.5
              }}
              animate={{ 
                y: [null, Math.random() * -100],
                opacity: [null, 0]
              }}
              transition={{ 
                duration: 2 + Math.random() * 3, 
                repeat: Infinity, 
                delay: Math.random() * 5 
              }}
              className="absolute w-1 h-1 bg-white rounded-full"
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="flex justify-between w-full items-center mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-piad-primary to-red-600 rounded-2xl flex items-center justify-center shadow-xl shadow-piad-primary/40 rotate-12">
                <Gift className="text-white -rotate-12" size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight leading-none">开心大抽奖</h2>
                <p className="text-white/40 text-[0.6rem] font-bold uppercase tracking-widest mt-1">Lucky Spin Event</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              disabled={isSpinning}
              className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
            >
              <X size={20} />
            </button>
          </div>

          <div className="bg-white/5 rounded-2xl px-4 py-2 mb-8 border border-white/5">
            <p className="text-white/80 text-xs font-bold text-center">
              试试手气，赢取惊喜好礼！
            </p>
          </div>

          {/* The Wheel Container */}
          <div className="relative w-80 h-80 mb-10">
            {/* Outer Decorative Ring with Glow */}
            <div className="absolute -inset-4 rounded-full border-[1px] border-white/10 z-0 animate-pulse" />
            <div className="absolute -inset-2 rounded-full border-[1px] border-white/5 z-0" />
            
            {/* Main Outer Ring */}
            <div className="absolute inset-0 rounded-full border-[14px] border-[#1a1a1a] shadow-[0_0_50px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.05)] z-20 pointer-events-none" />
            
            {/* Lights on Ring */}
            {[...Array(16)].map((_, i) => (
              <motion.div
                key={i}
                animate={{ 
                  backgroundColor: ['#fbbf24', '#ffffff', '#fbbf24'],
                  scale: [1, 1.2, 1],
                  boxShadow: ['0 0 5px #fbbf24', '0 0 15px #ffffff', '0 0 5px #fbbf24']
                }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.05 }}
                className="absolute w-2.5 h-2.5 rounded-full z-30"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: `rotate(${i * 22.5}deg) translateY(-152px) translateX(-50%)`,
                }}
              />
            ))}

            {/* Pointer - Improved Design */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 z-40">
              <motion.div 
                animate={isSpinning ? { rotate: [0, -15, 0] } : { rotate: 0 }}
                transition={{ duration: 0.1, repeat: isSpinning ? Infinity : 0 }}
                className="relative"
              >
                <div className="w-10 h-12 bg-piad-primary shadow-[0_5px_15px_rgba(255,77,77,0.5)]" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)' }} />
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/30 rounded-full blur-sm" />
              </motion.div>
            </div>

            {/* The Actual Wheel using SVG */}
            <motion.div 
              animate={controls}
              className="w-full h-full rounded-full overflow-hidden relative z-10 border-4 border-[#222]"
            >
              <svg viewBox="0 0 300 300" className="w-full h-full">
                {prizes.map((prize, i) => {
                  const angle = 360 / prizes.length;
                  const startAngle = i * angle;
                  const endAngle = (i + 1) * angle;
                  const color = colors[i % colors.length];
                  
                  return (
                    <g key={prize.id}>
                      <path 
                        d={getArcPath(startAngle, endAngle, 150)} 
                        fill={color}
                        stroke="#111"
                        strokeWidth="1"
                      />
                      <g transform={`rotate(${startAngle + angle / 2}, 150, 150)`}>
                        <text 
                          x="150" 
                          y="45" 
                          fill={i % 2 === 0 && color === '#FFD93D' ? '#333' : 'white'}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="text-[14px] font-black"
                          style={{ 
                            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                          }}
                        >
                          {prize.name.slice(0, 8).split('').map((char, index) => (
                            <tspan x="150" dy={index === 0 ? 0 : 16} key={index}>
                              {char}
                            </tspan>
                          ))}
                        </text>
                        <g transform={`translate(150, ${45 + prize.name.length * 16 + 10})`}>
                          {prize.type === 'voucher' && <Trophy size={16} color="white" className="opacity-90" />}
                          {prize.type === 'item' && <Star size={16} color="white" className="opacity-90" />}
                          {prize.type === 'none' && <Sparkles size={16} color="white" className="opacity-90" />}
                        </g>
                      </g>
                    </g>
                  );
                })}
              </svg>
            </motion.div>

            {/* Center Button - High Quality */}
            <button 
              onClick={spin}
              disabled={isSpinning}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-20 h-20 rounded-full bg-gradient-to-b from-[#333] to-[#111] border-4 border-piad-primary flex flex-col items-center justify-center shadow-[0_10px_30px_rgba(0,0,0,0.8),inset_0_2px_5px_rgba(255,255,255,0.1)] transition-all active:scale-90 ${isSpinning ? 'opacity-50' : 'hover:scale-110 hover:shadow-piad-primary/20'}`}
            >
              <span className="text-white font-black text-lg leading-none">GO!</span>
              <span className="text-piad-primary font-bold text-[0.5rem] mt-1 uppercase tracking-widest">Spin</span>
            </button>
          </div>

          {/* Result Display */}
          <AnimatePresence>
            {result && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center w-full"
              >
                <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/10 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-piad-primary to-transparent" />
                  
                  <div className="flex items-center justify-center space-x-3 mb-4">
                    <motion.div
                      animate={{ rotate: [0, 20, -20, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                    >
                      <PartyPopper className="text-yellow-400" size={32} />
                    </motion.div>
                    <h3 className="text-2xl font-black text-white">{result.type === 'none' ? '再接再厉！' : '恭喜中奖！'}</h3>
                    <motion.div
                      animate={{ rotate: [0, -20, 20, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                    >
                      <PartyPopper className="text-yellow-400" size={32} />
                    </motion.div>
                  </div>

                  <div className="bg-piad-primary/10 rounded-2xl py-6 mb-6 border border-piad-primary/20">
                    <p className="text-piad-primary font-black text-3xl mb-1">
                      {result.name}
                    </p>
                    <p className="text-white/40 text-[0.65rem] font-bold uppercase tracking-widest">
                      {result.type === 'none' ? 'Lottery Result' : 'Winning Prize'}
                    </p>
                  </div>

                  <p className="text-white/60 text-sm mb-8 leading-relaxed">
                    {result.type === 'none' ? '别灰心，下次一定能中大奖！' : result.type === 'voucher' ? '代金券已存入您的账户，下次消费可用' : '请联系服务员领取您的奖品'}
                  </p>

                  <button 
                    onClick={onClose}
                    className="w-full bg-piad-primary text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-piad-primary/40 hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    {result.type === 'none' ? '知道了' : '太棒了！'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!result && (
            <button 
              onClick={spin}
              disabled={isSpinning}
              className="w-full bg-gradient-to-r from-piad-primary to-red-600 text-white py-5 rounded-[2rem] font-black text-xl shadow-[0_15px_30px_rgba(255,77,77,0.3)] hover:shadow-piad-primary/50 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center space-x-4 group"
            >
              {isSpinning ? (
                <>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-7 h-7 border-4 border-white/30 border-t-white rounded-full"
                  />
                  <span>正在开奖...</span>
                </>
              ) : (
                <>
                  <Sparkles size={24} className="group-hover:animate-bounce" />
                  <span>立即开启好运</span>
                  <Sparkles size={24} className="group-hover:animate-bounce" />
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
