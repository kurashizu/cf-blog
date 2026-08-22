import React, { useState } from 'react';
import { playSound } from '../lib/sound';

export const HeroSection: React.FC = () => {
  const [isPasscodeUnlocked, setIsPasscodeUnlocked] = useState(false);
  const [showPasscodeInput, setShowPasscodeInput] = useState(false);
  const [passcodeVal, setPasscodeVal] = useState('');

  const handleUnlock = () => {
    playSound('toggle');
    if (
      passcodeVal.toLowerCase() === 'krsz' ||
      passcodeVal.toLowerCase() === 'serverless' ||
      passcodeVal === '1234'
    ) {
      setIsPasscodeUnlocked(true);
      setShowPasscodeInput(false);
      playSound('power');
    } else {
      playSound('click');
      alert('Key: "krsz"');
    }
  };

  return (
    <section className="relative w-full min-h-[92vh] flex flex-col justify-between px-4 sm:px-8 lg:px-12 pt-24 sm:pt-28 pb-16 select-none">
      {/* 1. TOP 12-COLUMN TECHNICAL SPECIFICATION GRID */}
      <div className="grid grid-cols-12 gap-y-6 sm:gap-6 font-mono text-xs sm:text-sm text-[var(--text-secondary)]">
        {/* Col 1-3: Role / Focus */}
        <div className="col-span-12 sm:col-span-4 lg:col-span-3 space-y-1.5">
          <div className="font-mono text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">
            SYS_IDENTITY // 0x4B52535A
          </div>
          <div className="font-sans font-bold text-xl sm:text-2xl text-[var(--text-primary)] leading-tight">
            Kurashizu
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-mono">
            UNSW IT · Sydney, AU
          </p>
        </div>

        {/* Col 4-6: Philosophy Tagline */}
        <div className="col-span-12 sm:col-span-4 lg:col-span-3 text-balance leading-relaxed font-mono text-xs sm:text-sm">
          <span className="text-[var(--text-primary)] font-semibold">
            Turning manual tasks into one-line edge commands.
          </span>
          <br />
          <span className="text-[var(--text-tertiary)]">
            Follow best practices and KISS in everything.
          </span>
        </div>

        {/* Col 7-12: Architecture Statement & Passcode Key */}
        <div className="col-span-12 sm:col-span-12 lg:col-span-6 lg:col-start-7 text-xs sm:text-sm leading-relaxed text-[var(--text-secondary)] font-sans">
          <p>
            An experimental ecosystem of serverless tools, autonomous AI agents, and media transcoders.
            All services run <strong className="text-[var(--text-primary)] font-semibold">100% serverless</strong> on Cloudflare's global edge without containers or cold starts.
          </p>

          <p className="mt-2.5 text-xs text-[var(--text-secondary)] font-mono">
            STACK DIRECTIVE: SvelteKit · uv · FFmpeg · D1 SQL · Vectorize · Gemma-4{' '}
            {!isPasscodeUnlocked ? (
              !showPasscodeInput ? (
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    setShowPasscodeInput(true);
                  }}
                  className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] cursor-pointer hover:border-[var(--border-hover)] transition-colors text-[10px] uppercase font-mono"
                  title="Unlock directive"
                >
                  <span className="text-[var(--matte-rust)] font-bold">[K]</span>
                  <span className="text-[var(--matte-slate)] font-bold">[R]</span>
                  <span className="text-[var(--matte-ochre)] font-bold">[S]</span>
                  <span className="text-[var(--matte-sage)] font-bold">[Z]</span>
                  <span className="text-[var(--text-tertiary)] ml-0.5">UNLOCK</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 ml-1 bg-[var(--bg-card)] border border-[var(--matte-rust)] p-0.5 rounded">
                  <input
                    type="text"
                    placeholder="KEY: 'KRSZ'"
                    value={passcodeVal}
                    onChange={(e) => setPasscodeVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    className="bg-transparent text-xs font-mono text-[var(--text-primary)] px-1 outline-none w-24 uppercase"
                    autoFocus
                  />
                  <button
                    onClick={handleUnlock}
                    className="px-1.5 py-0.5 rounded bg-[var(--text-primary)] text-[var(--bg)] text-[10px] font-mono font-bold"
                  >
                    OK
                  </button>
                </span>
              )
            ) : (
              <span className="text-[var(--matte-rust)] font-mono font-bold ml-1">
                // ACTIVE: 0ms COLD START · ANYCAST MESH
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 2. BOTTOM MASSIVE HERO: KURASHIZU'S RANDOM-STUFF ZONE (Emphasizing K - R - S - Z) */}
      <div className="pt-10 sm:pt-14 mt-auto">
        <div className="font-mono text-xs sm:text-sm text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
          // CORE ARCHITECTURAL IDENTIFIER
        </div>
        <h1 className="font-sans font-black text-[9.5vw] sm:text-[7.8vw] lg:text-[6.4vw] uppercase leading-[0.9] tracking-tighter text-[var(--text-primary)] select-none">
          {/* Row 1: K + urashizu's */}
          <div className="flex items-baseline flex-wrap">
            <span className="text-[var(--matte-rust)] font-mono mr-1 font-black underline decoration-[var(--border-hover)]">
              K
            </span>
            <span className="text-[var(--text-primary)]">urashizu's</span>
          </div>

          {/* Row 2: R + andom- */}
          <div className="flex items-baseline flex-wrap">
            <span className="text-[var(--matte-slate)] font-mono mr-1 font-black underline decoration-[var(--border-hover)]">
              R
            </span>
            <span className="text-[var(--text-secondary)] font-light">andom-</span>
          </div>

          {/* Row 3: S + tuff */}
          <div className="flex items-baseline flex-wrap">
            <span className="text-[var(--matte-ochre)] font-mono mr-1 font-black underline decoration-[var(--border-hover)]">
              S
            </span>
            <span className="text-[var(--text-primary)]">tuff</span>
          </div>

          {/* Row 4: Z + one. */}
          <div className="flex items-baseline flex-wrap">
            <span className="text-[var(--matte-sage)] font-mono mr-1 font-black underline decoration-[var(--border-hover)]">
              Z
            </span>
            <span className="text-[var(--text-primary)]">one.</span>
          </div>
        </h1>
      </div>
    </section>
  );
};
