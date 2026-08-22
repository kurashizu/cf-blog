import React, { useRef, useState, useCallback } from 'react';
import { playSound } from '../../lib/sound';

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  color?: string;
  size?: number; // diameter in px (default 26)
  onChange: (val: number) => void;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  color = '#56b6c2',
  size = 26,
  onChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const startVal = useRef(value);

  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + pct * 270;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    startVal.current = value;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = dragStartY.current - moveEvent.clientY;
      const range = max - min;
      const sensitivity = range / 100;
      const rawNew = startVal.current + deltaY * sensitivity;
      const stepped = Math.round(rawNew / step) * step;
      const clamped = Math.max(min, Math.min(max, stepped));
      onChange(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
    startVal.current = value;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 1) {
        const deltaY = dragStartY.current - moveEvent.touches[0].clientY;
        const range = max - min;
        const sensitivity = range / 100;
        const rawNew = startVal.current + deltaY * sensitivity;
        const stepped = Math.round(rawNew / step) * step;
        const clamped = Math.max(min, Math.min(max, stepped));
        onChange(clamped);
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const delta = (max - min) * 0.05 * dir;
    const rawNew = value + delta;
    const stepped = Math.round(rawNew / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onChange(clamped);
    playSound('click');
  };

  const formatDisplay = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (Number.isInteger(v)) return `${v}`;
    return v.toFixed(1);
  };

  // SVG Arc Calculation for 100% Precision
  const r = 40;
  const cx = 50;
  const cy = 50;
  const startRad = (-135 * Math.PI) / 180;
  const currentRad = (angle * Math.PI) / 180;
  const x0 = cx + r * Math.sin(startRad);
  const y0 = cy - r * Math.cos(startRad);
  const x1 = cx + r * Math.sin(currentRad);
  const y1 = cy - r * Math.cos(currentRad);
  const largeArc = pct > 0.666 ? 1 : 0;
  const arcPath = pct > 0.005 ? `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}` : '';

  return (
    <div
      onWheel={handleWheel}
      className="flex flex-col items-center select-none group cursor-ns-resize shrink-0 min-w-0 leading-none"
      title={`${label}: ${formatDisplay(value)}${unit} (Drag up/down or scroll wheel)`}
    >
      {/* Precision Mathematically Centered SVG Rotary Knob */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{ width: size, height: size }}
        className={`relative rounded-full transition-transform active:scale-95 ${
          isDragging ? 'shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''
        }`}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full overflow-visible select-none pointer-events-none"
        >
          {/* Outer Bezel & Base Circle */}
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="#12151a"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="3"
            className="group-hover:stroke-white/60 transition-colors"
          />

          {/* Background Track Arc (-135° to +135°) */}
          <path
            d="M 21.72 78.28 A 40 40 0 1 1 78.28 78.28"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Active Value Colored Arc */}
          {arcPath && (
            <path
              d={arcPath}
              fill="none"
              stroke={color}
              strokeWidth="4.5"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 3px ${color}88)` }}
            />
          )}

          {/* Precision Indicator Pointer Rotating Strictly Around (50, 50) */}
          <g transform={`rotate(${angle} 50 50)`}>
            <line
              x1="50"
              y1="14"
              x2="50"
              y2="34"
              stroke={color}
              strokeWidth="7"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />
            <circle cx="50" cy="16" r="2" fill="#ffffff" />
          </g>

          {/* Center Hardware Hub / Cap */}
          <circle
            cx="50"
            cy="50"
            r="16"
            fill="#1a1e24"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="2"
          />
          <circle
            cx="50"
            cy="50"
            r="5"
            fill="rgba(255,255,255,0.35)"
          />
        </svg>
      </div>

      {/* Label normally, swapped to Value on hover or while dragging */}
      <div className="text-center mt-1 leading-none w-full h-3 flex items-center justify-center">
        {isDragging ? (
          <span className="text-xs font-black font-mono truncate leading-none" style={{ color }}>
            {formatDisplay(value)}{unit}
          </span>
        ) : (
          <>
            <span className="text-xs opacity-85 uppercase font-mono font-bold group-hover:hidden truncate leading-none">
              {label}
            </span>
            <span className="hidden group-hover:block text-xs font-black font-mono truncate leading-none" style={{ color }}>
              {formatDisplay(value)}{unit}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

interface HardwareFaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  color?: string;
  height?: number; // fader track height in px (default 44)
  onChange: (val: number) => void;
}

export const HardwareFader: React.FC<HardwareFaderProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  color = '#e5c07b',
  height = 44,
  onChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const updateFromPointerY = useCallback((clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickY = clientY - rect.top;
    const clickPct = 1 - Math.max(0, Math.min(1, clickY / rect.height));
    const raw = min + clickPct * (max - min);
    const stepped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onChange(clamped);
  }, [min, max, step, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateFromPointerY(e.clientY);
    playSound('click');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateFromPointerY(moveEvent.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    updateFromPointerY(e.touches[0].clientY);

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 1) {
        updateFromPointerY(moveEvent.touches[0].clientY);
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const delta = (max - min) * 0.05 * dir;
    const rawNew = value + delta;
    const stepped = Math.round(rawNew / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onChange(clamped);
    playSound('click');
  };

  const formatDisplay = (v: number) => {
    if (unit === 'ms') return `${Math.round(v * 1000)}ms`;
    if (v <= 1 && max <= 1) return `${Math.round(v * 100)}%`;
    if (Number.isInteger(v)) return `${v}`;
    return v.toFixed(2);
  };

  return (
    <div
      onWheel={handleWheel}
      className="flex flex-col items-center select-none font-mono cursor-ns-resize group shrink-0 min-w-0 leading-none h-full justify-between py-0.5"
      title={`${label}: ${formatDisplay(value)} (Click, drag up/down, or scroll wheel)`}
    >
      <span className="text-xs opacity-85 uppercase font-black block group-hover:text-white transition-colors leading-none">
        {label}
      </span>

      {/* Vertical Fader Track */}
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{ height }}
        className={`w-4 bg-black/80 border rounded-xs relative cursor-ns-resize flex items-center justify-center p-0.5 transition-colors ${
          isDragging ? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'border-white/30 hover:border-white/70'
        }`}
      >
        <div className="w-0.5 h-full bg-white/20 rounded-full pointer-events-none" />

        <div
          className="absolute bottom-0 left-0.5 right-0.5 rounded-xs pointer-events-none opacity-30"
          style={{
            height: `${pct * 100}%`,
            backgroundColor: color,
          }}
        />

        {/* Illuminated Fader Cap */}
        <div
          className={`absolute w-3 h-2 rounded-xs border border-white/80 shadow-sm flex items-center justify-center pointer-events-none ${
            isDragging ? 'shadow-[0_0_8px_#fff] brightness-125' : ''
          }`}
          style={{
            bottom: `calc(${pct * 100}% - 4px)`,
            backgroundColor: color,
            boxShadow: isDragging ? `0 0 8px ${color}` : `0 0 4px ${color}88`,
          }}
        >
          <div className="w-1.5 h-0.5 bg-black/90 rounded-full" />
        </div>
      </div>

      <span className="text-[10px] sm:text-xs font-black text-center truncate max-w-[42px] leading-none" style={{ color }}>
        {formatDisplay(value)}
      </span>
    </div>
  );
};

interface HorizontalHardwareFaderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  color?: string;
  width?: number | string;
  showValue?: boolean;
  bipolar?: boolean;
  onChange: (val: number) => void;
}

export const HorizontalHardwareFader: React.FC<HorizontalHardwareFaderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  color = '#98c379',
  width = 60,
  showValue = false,
  bipolar = false,
  onChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const updateFromPointerX = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickPct = Math.max(0, Math.min(1, clickX / rect.width));
    const raw = min + clickPct * (max - min);
    const stepped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onChange(clamped);
  }, [min, max, step, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateFromPointerX(e.clientX);
    playSound('click');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateFromPointerX(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    updateFromPointerX(e.touches[0].clientX);

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 1) {
        updateFromPointerX(moveEvent.touches[0].clientY);
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const delta = (max - min) * 0.05 * dir;
    const rawNew = value + delta;
    const stepped = Math.round(rawNew / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onChange(clamped);
    playSound('click');
  };

  const formatDisplay = (v: number) => {
    if (bipolar && v > 0) return `+${v}${unit}`;
    return `${v}${unit}`;
  };

  return (
    <div
      onWheel={handleWheel}
      className="flex items-center gap-1.5 select-none font-mono cursor-ew-resize group shrink-0 min-w-0 leading-none"
      title={`${label ? `${label}: ` : ''}${formatDisplay(value)} (Click, drag left/right, or scroll wheel)`}
    >
      {label && (
        <span className="text-xs opacity-85 uppercase font-bold group-hover:text-white transition-colors">
          {label}
        </span>
      )}

      {/* Horizontal Fader Track */}
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{ width }}
        className={`h-3.5 bg-black/80 border rounded-xs relative cursor-ew-resize flex items-center justify-center p-0.5 transition-colors ${
          isDragging ? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'border-white/30 hover:border-white/70'
        }`}
      >
        <div className="h-0.5 w-full bg-white/20 rounded-full pointer-events-none" />

        {bipolar ? (
          <div
            className="absolute top-0.5 bottom-0.5 rounded-xs pointer-events-none opacity-30"
            style={{
              left: value >= 0 ? '50%' : `${pct * 100}%`,
              width: `${Math.abs(pct - 0.5) * 100}%`,
              backgroundColor: color,
            }}
          />
        ) : (
          <div
            className="absolute top-0.5 bottom-0.5 left-0.5 rounded-xs pointer-events-none opacity-30"
            style={{
              width: `${pct * 100}%`,
              backgroundColor: color,
            }}
          />
        )}

        {bipolar && (
          <div className="absolute top-0.5 bottom-0.5 left-1/2 w-0.5 bg-white/30 pointer-events-none" />
        )}

        {/* Illuminated Fader Cap */}
        <div
          className={`absolute h-2.5 w-2 rounded-xs border border-white/80 shadow-sm flex items-center justify-center pointer-events-none ${
            isDragging ? 'shadow-[0_0_8px_#fff] brightness-125' : ''
          }`}
          style={{
            left: `calc(${pct * 100}% - 4px)`,
            backgroundColor: color,
            boxShadow: isDragging ? `0 0 8px ${color}` : `0 0 4px ${color}88`,
          }}
        >
          <div className="h-1.5 w-0.5 bg-black/90 rounded-full" />
        </div>
      </div>

      {showValue && (
        <span className="text-xs font-black text-right min-w-[28px]" style={{ color }}>
          {formatDisplay(value)}
        </span>
      )}
    </div>
  );
};
