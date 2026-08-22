import React, { useState } from 'react';
import { GitCommit, Star, GitFork, ArrowUpRight, GitBranch, Terminal } from 'lucide-react';
import { GitLanguage } from '../../lib/types';
import { sound } from '../../lib/sound';

const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      clipRule="evenodd"
    />
  </svg>
);

const LANGUAGES: GitLanguage[] = [
  { name: 'TypeScript', percentage: 58.4, color: '#3178c6', files: 184 },
  { name: 'Rust', percentage: 22.6, color: '#dea584', files: 42 },
  { name: 'Svelte', percentage: 12.2, color: '#ff3e00', files: 29 },
  { name: 'Python', percentage: 6.8, color: '#3572a5', files: 19 },
];

const RECENT_COMMITS = [
  {
    hash: '89cf3a1',
    msg: 'feat(agent): zero-cold-start SSE dual-phase evaluator loop',
    time: '2h ago',
    branch: 'main',
  },
  {
    hash: 'e4a770c',
    msg: 'perf(edge): sub-10ms Vectorize cosine SIMD clustering',
    time: '1d ago',
    branch: 'main',
  },
  {
    hash: '50b182d',
    msg: 'fix(media): HLS multi-bitrate byte-range segment seek',
    time: '3d ago',
    branch: 'main',
  },
];

export const GitHubCard: React.FC = () => {
  const [activeLang, setActiveLang] = useState<GitLanguage | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = (hash: string) => {
    sound.playClick(1.2);
    navigator.clipboard?.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1800);
  };

  return (
    <div className="group relative flex flex-col justify-between h-full bg-[#111317] border border-dashed border-white/10 hover:border-slate-400/40 rounded-2xl p-5 md:p-6 transition-all duration-300 hover:shadow-[0_0_30px_-8px_rgba(203,213,225,0.15)]">
      {/* Glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-slate-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-slate-500/10 transition-all duration-500" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-slate-200">
              <GithubIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-medium text-slate-100 text-base tracking-tight">
                  github.com/kurashizu
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active OSS
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Systems, Compilers, Edge Runtimes & Distributed Systems
              </p>
            </div>
          </div>

          <a
            href="https://github.com/kurashizu"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playClick(1.0)}
            className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-white/10 border border-white/5 hover:border-white/20"
          >
            <span>GitHub</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Language Multi-bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
            <span>Language Stack:</span>
            <span className="text-slate-300">
              {activeLang ? `${activeLang.name} (${activeLang.percentage}%)` : 'Monorepo Composition'}
            </span>
          </div>

          {/* Continuous multi-segment progress bar */}
          <div className="w-full h-2 rounded-full overflow-hidden flex bg-white/5 p-[1px] gap-0.5">
            {LANGUAGES.map((lang) => (
              <div
                key={lang.name}
                onMouseEnter={() => setActiveLang(lang)}
                onMouseLeave={() => setActiveLang(null)}
                style={{
                  width: `${lang.percentage}%`,
                  backgroundColor: lang.color,
                }}
                className="h-full rounded-sm cursor-pointer transition-all hover:opacity-90 hover:scale-y-125"
                title={`${lang.name}: ${lang.percentage}%`}
              />
            ))}
          </div>

          {/* Language Legend Chips */}
          <div className="flex flex-wrap items-center gap-2.5 mt-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.name}
                onMouseEnter={() => setActiveLang(lang)}
                onMouseLeave={() => setActiveLang(null)}
                className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lang.color }} />
                <span>{lang.name}</span>
                <span className="text-slate-500">{lang.percentage}%</span>
              </button>
            ))}
          </div>
        </div>

        {/* Monorepo Commit Pulse Stream */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
            <span className="flex items-center gap-1">
              <GitBranch className="w-3 h-3 text-slate-500" />
              main branch commits
            </span>
            <span className="text-emerald-400">1,482 commits</span>
          </div>

          {RECENT_COMMITS.map((commit) => (
            <div
              key={commit.hash}
              onClick={() => handleCopyHash(commit.hash)}
              className="cursor-pointer group/commit flex items-center justify-between gap-2 p-2 rounded-lg bg-black/20 hover:bg-white/[0.04] border border-white/5 transition-all"
            >
              <div className="flex items-center gap-2 min-w-0">
                <GitCommit className="w-3.5 h-3.5 text-slate-500 group-hover/commit:text-slate-300 shrink-0" />
                <span className="text-[11px] font-mono text-slate-300 group-hover/commit:text-sky-300 transition-colors truncate">
                  {commit.msg}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                <span className="px-1 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10 group-hover/commit:border-slate-400/40">
                  {copiedHash === commit.hash ? 'copied' : commit.hash}
                </span>
                <span className="text-slate-500">{commit.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Stars & Repo Stats */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-amber-300">
            <Star className="w-3.5 h-3.5 fill-amber-300" />
            380+ Stars
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <GitFork className="w-3.5 h-3.5" />
            46 Forks
          </span>
        </div>
        <span className="text-slate-500">MIT / Apache 2.0</span>
      </div>
    </div>
  );
};
