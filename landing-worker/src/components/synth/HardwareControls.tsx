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
  size?: number; // diameter in px (default 36)
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
  height?: number; // fader track height in px (default 54)
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
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickPct = 1 - Math.max(0, Math.min(1, clickY / rect.height));
    const raw = min + clickPct * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, stepped)));
    playSound('click');
  };

  return (
    <div className="flex flex-col items-center select-none font-mono">
      {/* Label */}
      <span className="text-xs opacity-75 uppercase font-semibold block mb-0.5">{label}</span>

      {/* Vertical Fader Track */}
      <div
        onClick={handleTrackClick}
        style={{ height }}
        className="w-4 bg-black/60 border border-white/20 rounded-xs relative cursor-pointer flex items-center justify-center p-0.5"
      >
        {/* Center Groove Line */}
        <div className="w-0.5 h-full bg-white/10 rounded-full pointer-events-none" />

        {/* Illuminated Fader Cap / Thumb */}
        <div
          className="absolute w-3.5 h-2 rounded-xs border border-white/60 shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center transition-all"
          style={{
            bottom: `calc(${pct * 100}% - 4px)`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}88`,
          }}
        >
          <div className="w-2 h-0.5 bg-black/80 rounded-full" />
        </div>
      </div>

      {/* Value Readout */}
      <span className="text-xs font-bold mt-1" style={{ color }}>
        {Math.round(value >= 1 ? value : value * 100)}{unit || (value <= 1 ? '%' : '')}
      </span>
    </div>
  );
};
