import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { playSound } from '../lib/sound';

export interface HeaderProps {
  theme: 'obsidian' | 'chalk' | 'sage' | 'terracotta';
  onCycleTheme: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onScrollTo: (id: string) => void;
  coords: { x: number; y: number };
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onCycleTheme,
  soundEnabled,
  onToggleSound,
  onScrollTo,
  coords,
}) => {
  const [timeStr, setTimeStr] = useState('');
  const [gmtOffset, setGmtOffset] = useState('GMT+10');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Australia/Sydney',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      setTimeStr(new Intl.DateTimeFormat('en-US', options).format(now));

      try {
        const sydneyDate = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
        const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
        const diffHours = Math.round((sydneyDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60));
        setGmtOffset(`GMT+${diffHours}`);
      } catch {
        setGmtOffset('GMT+10');
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getThemeCode = () => {
    switch (theme) {
      case 'obsidian':
        return 'OBSIDIAN';
      case 'chalk':
        return 'CHALK';
      case 'sage':
        return 'SAGE';
      case 'terracotta':
        return 'TERRA';
    }
  };

  return (
    <>
      {/* 1. TOP NAVIGATION BAR */}
      <header className="fixed top-0 left-0 right-0 z-40 flex justify-between items-center px-4 sm:px-8 lg:px-12 py-3 sm:py-4 font-mono text-xs select-none pointer-events-none bg-[var(--bg)]/85 backdrop-blur-md border-b border-[var(--border)] transition-colors duration-300 text-[var(--text-primary)]">
        {/* Left: Brand / Logo */}
        <div className="pointer-events-auto">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              playSound('click');
            }}
            className="btn-dotted px-2 py-1 font-bold uppercase tracking-wider font-mono text-sm inline-flex items-center gap-1 text-[var(--text-primary)]"
          >
            <span>krsz.in</span>
            <span className="text-[10px] text-[var(--text-tertiary)] font-normal">[ZONE]</span>
          </a>
        </div>

        {/* Right: Nav Links, Theme, Sound */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              playSound('click');
              onScrollTo('selected-work');
            }}
            className="btn-dotted px-2.5 py-1 uppercase cursor-pointer hidden sm:inline-block text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span>Modules</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playSound('click');
              onScrollTo('serverless-architecture');
            }}
            className="btn-dotted px-2.5 py-1 uppercase cursor-pointer hidden md:inline-block text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span>Topology</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playSound('click');
              onScrollTo('contact');
            }}
            className="btn-dotted px-2.5 py-1 uppercase cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span>Dispatch</span>
          </button>

          {/* Theme Cycler */}
          <button
            type="button"
            onClick={() => {
              playSound('toggle');
              onCycleTheme();
            }}
            className="btn-dotted px-2.5 py-1 uppercase cursor-pointer text-[var(--text-primary)] bg-[var(--bg-card)] border border-[var(--border)] rounded text-[11px]"
            title="Cycle Palette"
          >
            <span>THEME: {getThemeCode()}</span>
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => {
              onToggleSound();
            }}
            className={`btn-dotted px-2 py-1 uppercase cursor-pointer inline-flex items-center gap-1 border rounded text-[11px] transition-colors ${
              soundEnabled
                ? 'bg-[var(--bg-card)] border-[var(--border-hover)] text-[var(--text-primary)]'
                : 'bg-transparent border-[var(--border)] text-[var(--text-tertiary)]'
            }`}
            title={soundEnabled ? 'Mute Web Audio' : 'Unmute Web Audio'}
          >
            {soundEnabled ? <Volume2 className="w-3 h-3 text-[var(--matte-sand)]" /> : <VolumeX className="w-3 h-3" />}
            <span>DSP [{soundEnabled ? 'ON' : 'OFF'}]</span>
          </button>
        </div>
      </header>

      {/* 2. BOTTOM TELEMETRY HUD (Sydney Timezone UTC+10/11) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-between items-center px-4 sm:px-8 lg:px-12 py-2.5 font-mono text-[11px] select-none pointer-events-none bg-[var(--bg)]/85 backdrop-blur-md border-t border-[var(--border)] text-[var(--text-secondary)]">
        {/* Bottom Left: Sydney Live Time */}
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="tabular-nums tracking-tight">
            {gmtOffset} SYDNEY {timeStr}
          </span>
        </div>

        {/* Bottom Center: Coordinates */}
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2 pointer-events-auto">
          <span className="btn-dotted px-2 py-0.5 uppercase tabular-nums tracking-widest text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            POS {coords.x.toString().padStart(4, '0')} : {coords.y.toString().padStart(4, '0')}
          </span>
        </div>

        {/* Bottom Right: Serverless Status */}
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="tracking-wide text-[var(--text-tertiary)] uppercase font-mono">
            V8 ISOLATES // 100% SERVERLESS
          </span>
        </div>
      </div>
    </>
  );
};
