import React from 'react';
import { Globe, Mail, ArrowUpRight, Cpu, ShieldCheck } from 'lucide-react';
import { playSound } from '../lib/sound';

interface FooterProps {
  coords: { x: number; y: number };
}

export const Footer: React.FC<FooterProps> = ({ coords }) => {
  return (
    <footer className="pt-16 pb-12 px-4 md:px-8 border-t border-matte-border bg-matte-card/30 backdrop-blur-sm relative select-none">
      <div className="max-w-7xl mx-auto space-y-12 font-mono text-xs text-matte-muted">
        
        {/* Top Tier: Big Logo & Quick Links */}
        <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-8 border-b border-matte-border/60 pb-10">
          
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-2xl md:text-3xl text-matte-text tracking-wider">
                KRSZ™
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-matte-tag border border-matte-border text-matte-accent">
                ZONE 2026
              </span>
            </div>
            <p className="text-sm font-sans text-matte-muted max-w-md">
              <strong className="text-matte-text">Kurashizu's Random-Stuff Zone</strong> — Curated serverless experiments, edge utilities, neural agents, and open source craft.
            </p>
          </div>

          {/* Direct Navigation Cluster */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs">
            <div className="space-y-2">
              <span className="text-matte-accent font-bold uppercase text-[10px]">[EDGE RUNTIMES]</span>
              <ul className="space-y-1.5">
                <li><a href="https://blog.krsz.in" target="_blank" className="hover:text-matte-text transition-colors flex items-center gap-1">blog.krsz.in <ArrowUpRight className="w-2.5 h-2.5" /></a></li>
                <li><a href="https://share.krsz.in" target="_blank" className="hover:text-matte-text transition-colors flex items-center gap-1">share.krsz.in <ArrowUpRight className="w-2.5 h-2.5" /></a></li>
                <li><a href="https://sharetube.krsz.in" target="_blank" className="hover:text-matte-text transition-colors flex items-center gap-1">sharetube.krsz.in <ArrowUpRight className="w-2.5 h-2.5" /></a></li>
              </ul>
            </div>

            <div className="space-y-2">
              <span className="text-matte-accent font-bold uppercase text-[10px]">[INTELLIGENCE]</span>
              <ul className="space-y-1.5">
                <li><a href="https://agent.krsz.in" target="_blank" className="hover:text-matte-text transition-colors flex items-center gap-1">agent.krsz.in <ArrowUpRight className="w-2.5 h-2.5" /></a></li>
                <li><a href="https://huggingface.co/kurashizu" target="_blank" className="hover:text-matte-text transition-colors flex items-center gap-1">Hugging Face <ArrowUpRight className="w-2.5 h-2.5" /></a></li>
                <li><a href="https://github.com/kurashizu" target="_blank" className="hover:text-matte-text transition-colors flex items-center gap-1">GitHub Hub <ArrowUpRight className="w-2.5 h-2.5" /></a></li>
              </ul>
            </div>

            <div className="space-y-2 col-span-2 sm:col-span-1">
              <span className="text-matte-accent font-bold uppercase text-[10px]">[DIRECT CHANNELS]</span>
              <ul className="space-y-1.5">
                <li><a href="mailto:krsz.dev@gmail.com" className="hover:text-matte-text transition-colors">krsz.dev@gmail.com</a></li>
                <li><a href="mailto:admin@krsz.in" className="hover:text-matte-text transition-colors">admin@krsz.in</a></li>
                <li><a href="https://mail.krsz.in" target="_blank" className="hover:text-matte-text transition-colors flex items-center gap-1">mail.krsz.in <ArrowUpRight className="w-2.5 h-2.5" /></a></li>
              </ul>
            </div>
          </div>

        </div>

        {/* Bottom Tier: Architecture Spec, Coordinates & Copyright */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-matte-faint">
          
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5 text-matte-muted">
              <ShieldCheck className="w-3.5 h-3.5 text-matte-accent" />
              100% SERVERLESS ARCHITECTURE
            </span>
            <span>•</span>
            <span>CLOUDFLARE ANYCAST EDGE</span>
            <span>•</span>
            <span>D1 SQL // VECTORIZE</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="tabular-nums">
              POS // X:{coords.x.toString().padStart(4, '0')} Y:{coords.y.toString().padStart(4, '0')}
            </div>
            <span>© 2026 KURASHIZU. CRAFTED WITH CARE.</span>
          </div>

        </div>

      </div>
    </footer>
  );
};
