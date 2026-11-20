import React, { useState, useEffect } from 'react';
import { formatINR } from '../lib/utils';
import { Target, Check } from 'lucide-react';

interface RevenueGaugeProps {
  currentMRR: number;
}

export default function RevenueGauge({ currentMRR }: RevenueGaugeProps) {
  const [target, setTarget] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('hotelstory_mrr_target');
      return saved ? Number(saved) : 500000;
    } catch {
      return 500000;
    }
  });

  const [isEditing, setIsEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(target));
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [mounted, setMounted] = useState<boolean>(prefersReducedMotion);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    if (mediaQuery.matches) {
      setMounted(true);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    const frameId = requestAnimationFrame(() => {
      setMounted(true);
    });

    return () => {
      cancelAnimationFrame(frameId);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('hotelstory_mrr_target', String(target));
    } catch (e) {
      console.error(e);
    }
  }, [target]);

  const handleSaveTarget = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(inputVal);
    if (!isNaN(num) && num > 0) {
      setTarget(num);
    }
    setIsEditing(false);
  };

  const rawPercentage = target > 0 ? Math.min(100, Math.max(0, (currentMRR / target) * 100)) : 0;
  const percentage = Math.round(rawPercentage);
  const animatedPercentage = mounted ? rawPercentage : 0;
  const needleAngle = -90 + (animatedPercentage / 100) * 180;

  // Semicircle arc geometry (320px wide viewBox, 16px stroke)
  const cx = 160;
  const cy = 158;
  const radius = 148;
  const arcLength = Math.PI * radius;
  const strokeDashoffset = arcLength * (1 - animatedPercentage / 100);

  // Tick marks along the inner edge of the arc (0% to 100% in 10% increments)
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const pct = i * 10;
    const angleRad = Math.PI * (1 - pct / 100); // 180deg (left) to 0deg (right)
    const isMajor = pct === 0 || pct === 50 || pct === 100;
    const outerR = 135;
    const innerR = isMajor ? 124 : 129;
    return {
      pct,
      isMajor,
      x1: cx + innerR * Math.cos(angleRad),
      y1: cy - innerR * Math.sin(angleRad),
      x2: cx + outerR * Math.cos(angleRad),
      y2: cy - outerR * Math.sin(angleRad),
    };
  });

  return (
    <div className="tactile-card p-6 flex flex-col bg-white">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Revenue Progress</span>
          <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">MRR vs Monthly Target</h2>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center space-x-1.5 text-xs font-semibold"
            title="Set target"
          >
            <Target className="w-4 h-4 text-[#1D4ED8]" />
            <span>Target: {formatINR(target)}</span>
          </button>
        ) : (
          <form onSubmit={handleSaveTarget} className="flex items-center space-x-1.5">
            <input
              type="number"
              autoFocus
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              className="w-32 px-3 py-1 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-xs font-bold text-[#0A1F5C]"
              placeholder="500000"
            />
            <button type="submit" className="p-1.5 bg-[#1D4ED8] text-white rounded-xl shadow-xs">
              <Check className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* Vertically centered 180-degree semicircle gauge */}
      <div className="flex-1 flex flex-col items-center justify-center pt-3 pb-1">
        <div className="w-[320px] max-w-full flex items-center justify-center">
          <svg
            className="w-[320px] max-w-full h-auto"
            viewBox="0 0 320 186"
            role="img"
            aria-label={`MRR gauge showing ${formatINR(currentMRR)}, ${percentage}% of ${formatINR(target)} target`}
          >
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>
            </defs>

            {/* Background Track Arc */}
            <path
              d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
              fill="none"
              stroke="#C9DCFA"
              strokeWidth="16"
              strokeLinecap="round"
            />

            {/* Progress Fill Arc */}
            <path
              d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={arcLength}
              strokeDashoffset={strokeDashoffset}
              strokeOpacity={animatedPercentage > 0 ? 1 : 0}
              style={{
                transition: prefersReducedMotion
                  ? 'none'
                  : 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1), stroke-opacity 0.2s ease'
              }}
            />

            {/* Small Tick Marks around the arc */}
            {ticks.map((tick) => (
              <line
                key={tick.pct}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke={tick.isMajor ? '#64748B' : '#CBD5E1'}
                strokeWidth={tick.isMajor ? 1.75 : 1.25}
                strokeLinecap="round"
              />
            ))}

            {/* 0, 50%, and Target Labels */}
            <text x="12" y="182" fontSize="12" fontWeight="600" fill="#64748B" textAnchor="middle">
              0
            </text>
            <text x={cx} y="50" fontSize="11" fontWeight="600" fill="#475569" textAnchor="middle">
              50%
            </text>
            <text x="316" y="182" fontSize="12" fontWeight="600" fill="#64748B" textAnchor="end">
              {formatINR(target)}
            </text>

            {/* Slim Tapered Needle (~90px long) pivoting at (cx, cy) */}
            <g
              style={{
                transform: `rotate(${needleAngle}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
                transformBox: 'view-box',
                transition: prefersReducedMotion
                  ? 'none'
                  : 'transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)'
              }}
            >
              <path
                d={`M ${cx - 2} ${cy} L ${cx} ${cy - 90} L ${cx + 2} ${cy} Z`}
                fill="#0A1F5C"
              />
            </g>

            {/* Round Navy Hub (~14px) at Pivot */}
            <circle cx={cx} cy={cy} r="7" fill="#0A1F5C" />
          </svg>
        </div>

        {/* Amount and Target Text placed below the hub with >=16px clearance */}
        <div className="text-center mt-0.5 space-y-1">
          <div className="text-[28px] font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums leading-none">
            {formatINR(currentMRR)}
          </div>
          <p className="text-[13px] text-slate-500 font-medium">
            {percentage}% of {formatINR(target)} target
          </p>
        </div>

        <div className="w-full tactile-recessed p-2.5 flex justify-between items-center text-xs text-slate-500 mt-6">
          <span className="text-[12px] font-semibold text-slate-600">Current Active MRR</span>
          <span className="font-bold text-[#1D4ED8] tabular-nums text-sm">{formatINR(currentMRR)}</span>
        </div>
      </div>
    </div>
  );
}
