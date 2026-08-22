import React, { useState } from 'react';
import {
  BlogCard,
  ShareCard,
  ShareTubeCard,
  MailCard,
  AgentCard,
  HuggingFaceCard,
  GitHubCard,
  EdgeLatencyCard,
  SoundboardCard,
} from './cards';
import { TopologyDiagram } from './assets/TopologyDiagram';
import { ServerlessSeal } from './assets/ServiceIcons';
import { Layers, Activity, Cpu, Radio, Sparkles, Filter } from 'lucide-react';
import { playSound } from '../lib/sound';

export type BentoCategory = 'all' | 'destinations' | 'intelligence' | 'telemetry';

export const BentoGrid: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<BentoCategory>('all');

  const handleCategoryChange = (cat: BentoCategory) => {
    playSound('click');
    setActiveCategory(cat);
  };

  return (
    <section id="services" className="py-12 md:py-20 px-4 md:px-8 border-b border-matte-border relative">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Section Header & Interactive Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 font-mono text-xs border-b border-matte-border pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-matte-accent">
              <Layers className="w-4 h-4" />
              <span>[CONTROL DECK // BENTO MATRIX]</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-black uppercase text-matte-text tracking-tight">
              Destinations, Tools &amp; Edge Services
            </h2>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap bg-matte-card p-1 rounded border border-matte-border">
            <Filter className="w-3.5 h-3.5 text-matte-faint ml-1 mr-0.5" />
            <button
              onClick={() => handleCategoryChange('all')}
              className={`hover-dotted px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                activeCategory === 'all'
                  ? 'bg-matte-text text-matte-bg font-bold'
                  : 'text-matte-muted hover:text-matte-text'
              }`}
            >
              ALL [9]
            </button>
            <button
              onClick={() => handleCategoryChange('destinations')}
              className={`hover-dotted px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                activeCategory === 'destinations'
                  ? 'bg-matte-text text-matte-bg font-bold'
                  : 'text-matte-muted hover:text-matte-text'
              }`}
            >
              PORTALS [4]
            </button>
            <button
              onClick={() => handleCategoryChange('intelligence')}
              className={`hover-dotted px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                activeCategory === 'intelligence'
                  ? 'bg-matte-text text-matte-bg font-bold'
                  : 'text-matte-muted hover:text-matte-text'
              }`}
            >
              AI &amp; OPEN SOURCE [3]
            </button>
            <button
              onClick={() => handleCategoryChange('telemetry')}
              className={`hover-dotted px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                activeCategory === 'telemetry'
                  ? 'bg-matte-text text-matte-bg font-bold'
                  : 'text-matte-muted hover:text-matte-text'
              }`}
            >
              SYSTEM &amp; SOUND [2]
            </button>
          </div>
        </div>

        {/* 1. TOPOLOGY & ARCHITECTURE SHOWCASE */}
        {(activeCategory === 'all' || activeCategory === 'telemetry') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between font-mono text-xs text-matte-muted">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-matte-accent" />
                <span className="text-matte-text font-bold uppercase">100% SERVERLESS ARCHITECTURE TOPOLOGY</span>
              </div>
              <span className="text-[10px] text-matte-faint hidden sm:inline">ZERO CONTAINERS // ANYCAST V8 ISOLATES</span>
            </div>

            <div className="p-4 md:p-6 rounded-lg bg-matte-card border border-matte-border relative overflow-hidden">
              <div className="absolute top-4 right-4 hidden md:block opacity-60 pointer-events-none">
                <ServerlessSeal size={64} />
              </div>
              <TopologyDiagram />
            </div>
          </div>
        )}

        {/* 2. CORE BENTO CARDS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Blog.krsz.in (Width: 6 cols) */}
          {(activeCategory === 'all' || activeCategory === 'destinations') && (
            <div className="lg:col-span-6">
              <BlogCard />
            </div>
          )}

          {/* Agent.krsz.in (Width: 6 cols) */}
          {(activeCategory === 'all' || activeCategory === 'intelligence') && (
            <div className="lg:col-span-6">
              <AgentCard />
            </div>
          )}

          {/* Share.krsz.in (Width: 6 cols) */}
          {(activeCategory === 'all' || activeCategory === 'destinations') && (
            <div className="lg:col-span-6">
              <ShareCard />
            </div>
          )}

          {/* ShareTube.krsz.in (Width: 6 cols) */}
          {(activeCategory === 'all' || activeCategory === 'destinations') && (
            <div className="lg:col-span-6">
              <ShareTubeCard />
            </div>
          )}

          {/* HuggingFace Hub (Width: 6 cols) */}
          {(activeCategory === 'all' || activeCategory === 'intelligence') && (
            <div className="lg:col-span-6">
              <HuggingFaceCard />
            </div>
          )}

          {/* GitHub Monorepo (Width: 6 cols) */}
          {(activeCategory === 'all' || activeCategory === 'intelligence') && (
            <div className="lg:col-span-6">
              <GitHubCard />
            </div>
          )}

          {/* Mail.krsz.in (Width: 6 cols) */}
          {(activeCategory === 'all' || activeCategory === 'destinations') && (
            <div className="lg:col-span-6">
              <MailCard />
            </div>
          )}

          {/* Edge Latency Probes (Width: 6 cols) */}
          {(activeCategory === 'all' || activeCategory === 'telemetry') && (
            <div className="lg:col-span-6">
              <EdgeLatencyCard />
            </div>
          )}

          {/* Soundboard Synth Pad (Width: 12 cols or 6 cols) */}
          {(activeCategory === 'all' || activeCategory === 'telemetry') && (
            <div className="lg:col-span-12">
              <SoundboardCard />
            </div>
          )}

        </div>

      </div>
    </section>
  );
};
