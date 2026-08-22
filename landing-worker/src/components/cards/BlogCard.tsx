import React, { useState, useMemo } from 'react';
import { BookOpen, Search, ArrowUpRight, Clock, Eye, Sparkles, Tag, CheckCircle2 } from 'lucide-react';
import { BlogPostPreview } from '../../lib/types';
import { sound } from '../../lib/sound';

const INITIAL_POSTS: BlogPostPreview[] = [
  {
    slug: 'serverless-rag-cloudflare-workers-vectorize',
    title: 'Architecting Zero-Cold-Start RAG on Cloudflare Vectorize & D1',
    snippet: 'Benchmarking sub-15ms vector search at 330+ global edge locations using Workers AI and hyper-optimized KV caching.',
    tags: ['AI', 'Cloudflare', 'Systems'],
    readTimeMin: 6,
    publishDate: 'Aug 2026',
    views: 4820,
    url: 'https://blog.krsz.in',
  },
  {
    slug: 'autonomous-agent-tool-orchestration',
    title: 'Self-Healing Autonomous Tool Loops with Dual-Phase Evaluators',
    snippet: 'How we prevent hallucinations and recursive degradation during complex multi-step SSE execution pipelines.',
    tags: ['AI', 'LLM'],
    readTimeMin: 8,
    publishDate: 'Jul 2026',
    views: 6140,
    url: 'https://blog.krsz.in',
  },
  {
    slug: 'distributed-media-streaming-r2-workers',
    title: 'Zero-Egress Distributed Video Transmuxing via R2 & HLS',
    snippet: 'Serving adaptive multi-bitrate video streams globally with byte-range slicing on Cloudflare Workers edge nodes.',
    tags: ['Systems', 'Cloudflare'],
    readTimeMin: 5,
    publishDate: 'Jun 2026',
    views: 3950,
    url: 'https://blog.krsz.in',
  },
  {
    slug: 'low-latency-audio-synthesis-web-audio',
    title: 'Micro-Synthesizers & Deterministic Audio DSP in Browser Runtimes',
    snippet: 'Real-time additive synthesis and FFT visualization using pure Web Audio API without bulky external libraries.',
    tags: ['Systems', 'Audio'],
    readTimeMin: 4,
    publishDate: 'May 2026',
    views: 2890,
    url: 'https://blog.krsz.in',
  }
];

const AVAILABLE_TAGS = ['All', 'AI', 'Systems', 'Cloudflare', 'LLM'];

export const BlogCard: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  const filteredPosts = useMemo(() => {
    return INITIAL_POSTS.filter(post => {
      const matchesSearch =
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.snippet.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesTag = selectedTag === 'All' || post.tags.includes(selectedTag);

      return matchesSearch && matchesTag;
    });
  }, [searchQuery, selectedTag]);

  const handleTagClick = (tag: string) => {
    sound.playClick(1.1);
    setSelectedTag(tag);
  };

  const handlePostClick = () => {
    sound.playClick(1.2);
  };

  return (
    <div className="group relative flex flex-col justify-between h-full bg-[#111317] border border-dashed border-white/10 hover:border-sky-500/40 rounded-2xl p-5 md:p-6 transition-all duration-300 hover:shadow-[0_0_30px_-8px_rgba(56,189,248,0.2)]">
      {/* Top Ambient Glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-sky-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-sky-500/10 transition-all duration-500" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-medium text-slate-100 text-base tracking-tight">
                  blog.krsz.in
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Serverless Technical Journal & Systems Lab
              </p>
            </div>
          </div>

          <a
            href="https://blog.krsz.in"
            target="_blank"
            rel="noopener noreferrer"
            onClick={handlePostClick}
            className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-sky-300 transition-colors px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-sky-500/10 border border-white/5 hover:border-sky-500/30"
          >
            <span>Visit</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Live Search Bar Simulator */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              sound.playClick(0.9);
            }}
            placeholder="Simulate live search (e.g. AI, RAG, R2, Audio)..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0b0c0e] border border-white/10 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 font-mono transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                sound.playClick(1.0);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-200 font-mono px-1 bg-white/5 rounded"
            >
              Clear
            </button>
          )}
        </div>

        {/* Tag Selector Chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <Tag className="w-3 h-3 text-slate-500 mr-0.5" />
          {AVAILABLE_TAGS.map((tag) => {
            const isActive = selectedTag === tag;
            return (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono transition-all ${
                  isActive
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                    : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] border border-white/5'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Articles Feed */}
        <div className="space-y-2.5">
          {filteredPosts.length > 0 ? (
            filteredPosts.slice(0, 2).map((post) => (
              <a
                key={post.slug}
                href={`https://blog.krsz.in/posts/${post.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={() => setHoveredSlug(post.slug)}
                onMouseLeave={() => setHoveredSlug(null)}
                onClick={handlePostClick}
                className="block group/item p-3 rounded-xl bg-black/20 hover:bg-white/[0.04] border border-white/5 hover:border-white/15 transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className="text-xs font-semibold text-slate-200 group-hover/item:text-sky-300 transition-colors line-clamp-1">
                    {post.title}
                  </h4>
                  <span className="shrink-0 text-[10px] font-mono text-slate-500">
                    {post.publishDate}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-2.5">
                  {post.snippet}
                </p>

                {/* Meter & Meta bar */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {post.readTimeMin}m read
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Eye className="w-3 h-3 text-slate-500" />
                      {post.views.toLocaleString()}
                    </span>
                  </div>

                  {/* Read Time Progress Bar */}
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-slate-500">Depth</span>
                    <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-sky-400 to-indigo-400 rounded-full"
                        style={{ width: `${Math.min(100, (post.readTimeMin / 10) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </a>
            ))
          ) : (
            <div className="p-4 text-center text-xs font-mono text-slate-500 bg-black/20 rounded-xl border border-white/5">
              No matching essays found for query &quot;{searchQuery}&quot;
            </div>
          )}
        </div>
      </div>

      {/* Footer Metrics */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>100% Edge Cached (D1/KV)</span>
        </div>
        <span className="text-slate-500">~14ms P95</span>
      </div>
    </div>
  );
};
