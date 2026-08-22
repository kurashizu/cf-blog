import React, { useState } from 'react';
import { TopologyDiagram } from './assets/TopologyDiagram';
import { EdgeLatencyCard } from './cards/EdgeLatencyCard';
import { SoundboardCard } from './cards/SoundboardCard';
import { playSound } from '../lib/sound';
import { Network, Activity, Sliders } from 'lucide-react';

export const StickyScrollBanner: React.FC = () => {
  const [activeDeckTab, setActiveDeckTab] = useState<'topology' | 'latency' | 'synth'>('topology');

  const handleTabChange = (tab: 'topology' | 'latency' | 'synth') => {
    playSound('click');
    setActiveDeckTab(tab);
  };

  return (
    <section
      id="serverless-architecture"
      className="relative w-full px-4 sm:px-8 lg:px-12 py-16 lg:py-20 border-t border-[var(--border)] select-none"
    >
      {/* 1. SECTION HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs text-[var(--text-secondary)] mb-8">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-primary)] font-bold">[SYSTEMS WORKBENCH]</span>
          <span>// 100% SERVERLESS TOPOLOGY</span>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 p-1 rounded bg-[var(--bg-card)] border border-[var(--border)]">
          <button
            type="button"
            onClick={() => handleTabChange('topology')}
            className={`btn-dotted px-2.5 py-1 rounded text-xs uppercase font-mono cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeDeckTab === 'topology'
                ? 'bg-[var(--text-primary)] text-[var(--bg)] font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Network className="w-3 h-3" />
            <span>TOPOLOGY</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('latency')}
            className={`btn-dotted px-2.5 py-1 rounded text-xs uppercase font-mono cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeDeckTab === 'latency'
                ? 'bg-[var(--text-primary)] text-[var(--bg)] font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>EDGE PING</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('synth')}
            className={`btn-dotted px-2.5 py-1 rounded text-xs uppercase font-mono cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeDeckTab === 'synth'
                ? 'bg-[var(--text-primary)] text-[var(--bg)] font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sliders className="w-3 h-3" />
            <span>DSP SYNTH</span>
          </button>
        </div>
      </div>

      {/* 2. UNIFIED WORKBENCH FRAME */}
      <div className="w-full rounded bg-[var(--bg-card)] border border-[var(--border)] p-4 sm:p-6 transition-all duration-300">
        {activeDeckTab === 'topology' && <TopologyDiagram />}
        {activeDeckTab === 'latency' && <EdgeLatencyCard />}
        {activeDeckTab === 'synth' && <SoundboardCard />}
      </div>
    </section>
  );
};
