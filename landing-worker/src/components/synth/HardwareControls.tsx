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
  size?: number; // diameter in px (default 32)
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
  size = 32,
  onChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const startVal = useRef(value);

  // Map value to angle (-135 deg to +135 deg -> 270 deg range)
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
      const sensitivity = range / 120; // 120px full travel
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
    return v.toFixed(2);
  };

  return (
    <div
      onWheel={handleWheel}
      className="flex flex-col items-center select-none group cursor-ns-resize"
      title={`${label}: ${value}${unit} (Drag up/down or scroll wheel)`}
    >
      {/* Rotary Cap with LED Indicator Needle */}
      <div
        onMouseDown={handleMouseDown}
        style={{ width: size, height: size }}
        className={`relative rounded-full bg-[#16191f] border transition-shadow flex items-center justify-center ${
          isDragging ? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'border-white/25 hover:border-white/60'
        }`}
      >
        {/* Subtle Outer Tick Ring */}
        <div className="absolute inset-0.5 rounded-full border border-dashed border-white/10 pointer-events-none" />

        {/* Center Cap with Marker Notch */}
        <div
          className="w-full h-full rounded-full flex items-center justify-center relative"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* Needle Indicator */}
          <div
            className="w-0.5 h-3 rounded-full absolute top-1"
            style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }}
          />
        </div>

        {/* Center Screw Accent */}
        <div className="w-1.5 h-1.5 rounded-full bg-white/20 pointer-events-none" />
      </div>

      {/* Label & Numeric Readout */}
      <div className="text-center mt-1 leading-tight">
        <span className="text-xs opacity-75 uppercase font-mono block font-semibold">{label}</span>
        <span className="text-xs font-bold font-mono block" style={{ color }}>
          {formatDisplay(value)}{unit}
        </span>
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
  height?: number; // fader track height in px (default 46)
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
  height = 46,
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
      className="flex flex-col items-center select-none font-mono cursor-ns-resize group"
      title={`${label}: ${formatDisplay(value)} (Click, drag up/down, or scroll wheel)`}
    >
      {/* Label */}
      <span className="text-[10px] opacity-75 uppercase font-bold block mb-0.5 group-hover:text-white transition-colors">
        {label}
      </span>

      {/* Vertical Fader Track */}
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{ height }}
        className={`w-5 bg-black/80 border rounded-xs relative cursor-ns-resize flex items-center justify-center p-0.5 transition-colors ${
          isDragging ? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'border-white/25 hover:border-white/60'
        }`}
      >
        {/* Center Groove Line */}
        <div className="w-0.5 h-full bg-white/15 rounded-full pointer-events-none" />

        {/* Level Fill Indicator Bar */}
        <div
          className="absolute bottom-0 left-1 right-1 rounded-xs pointer-events-none opacity-25"
          style={{
            height: `${pct * 100}%`,
            backgroundColor: color,
          }}
        />

        {/* Illuminated Fader Cap / Thumb */}
        <div
          className={`absolute w-4 h-2.5 rounded-xs border border-white/80 shadow-md flex items-center justify-center pointer-events-none ${
            isDragging ? 'shadow-[0_0_8px_#fff] brightness-125' : ''
          }`}
          style={{
            bottom: `calc(${pct * 100}% - 5px)`,
            backgroundColor: color,
            boxShadow: isDragging ? `0 0 10px ${color}` : `0 0 4px ${color}88`,
          }}
        >
          {/* Cap Grip Notch */}
          <div className="w-2.5 h-0.5 bg-black/90 rounded-full" />
        </div>
      </div>

      {/* Value Readout */}
      <span className="text-[10px] font-bold mt-1 text-center truncate max-w-[36px]" style={{ color }}>
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
  width?: number | string; // e.g. 72 or '100%'
  showValue?: boolean;
  bipolar?: boolean; // if true, center is 0
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
  width = 68,
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
        updateFromPointerX(moveEvent.touches[0].clientX);
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
      className="flex items-center gap-1.5 select-none font-mono cursor-ew-resize group"
      title={`${label ? `${label}: ` : ''}${formatDisplay(value)} (Click, drag left/right, or scroll wheel)`}
    >
      {label && (
        <span className="text-[10px] opacity-75 uppercase font-bold group-hover:text-white transition-colors">
          {label}
        </span>
      )}

      {/* Horizontal Fader Track */}
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{ width }}
        className={`h-4.5 bg-black/80 border rounded-xs relative cursor-ew-resize flex items-center justify-center p-0.5 transition-colors ${
          isDragging ? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'border-white/25 hover:border-white/60'
        }`}
      >
        {/* Center Groove Line */}
        <div className="h-0.5 w-full bg-white/15 rounded-full pointer-events-none" />

        {/* Level Fill Indicator Bar */}
        {bipolar ? (
          <div
            className="absolute top-1 bottom-1 rounded-xs pointer-events-none opacity-30"
            style={{
              left: value >= 0 ? '50%' : `${pct * 100}%`,
              width: `${Math.abs(pct - 0.5) * 100}%`,
              backgroundColor: color,
            }}
          />
        ) : (
          <div
            className="absolute top-1 bottom-1 left-0.5 rounded-xs pointer-events-none opacity-30"
            style={{
              width: `${pct * 100}%`,
              backgroundColor: color,
            }}
          />
        )}

        {/* Center Zero Tick for Bipolar Fader */}
        {bipolar && (
          <div className="absolute top-0.5 bottom-0.5 left-1/2 w-0.5 bg-white/30 pointer-events-none" />
        )}

        {/* Illuminated Fader Cap / Thumb */}
        <div
          className={`absolute h-3.5 w-2.5 rounded-xs border border-white/80 shadow-md flex items-center justify-center pointer-events-none ${
            isDragging ? 'shadow-[0_0_8px_#fff] brightness-125' : ''
          }`}
          style={{
            left: `calc(${pct * 100}% - 5px)`,
            backgroundColor: color,
            boxShadow: isDragging ? `0 0 10px ${color}` : `0 0 4px ${color}88`,
          }}
        >
          {/* Cap Grip Notch (Vertical) */}
          <div className="h-2 w-0.5 bg-black/90 rounded-full" />
        </div>
      </div>

      {showValue && (
        <span className="text-[10px] font-bold text-right min-w-[28px]" style={{ color }}>
          {formatDisplay(value)}
        </span>
      )}
    </div>
  );
};
