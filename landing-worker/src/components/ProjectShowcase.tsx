import React, { useState, useRef } from 'react';
import { ArrowUpRight, Eye, Code2, Sparkles, Terminal } from 'lucide-react';
import { SignatureSvg } from './SignatureSvg';
import { ProjectItem, ProjectModal } from './ProjectModal';
import { playSound } from '../lib/sound';

export const CORE_PROJECTS: ProjectItem[] = [
  {
    id: 'blog',
    title: 'blog.krsz.in',
    subtitle: 'Technical Research Log & Vector Index',
    url: 'https://blog.krsz.in',
    year: '2024-2026',
    tag: 'writing',
    badgeType: 'Core Node',
    accentColor: 'var(--matte-rust)',
    colSpanClass: 'col-span-12 lg:col-span-8 lg:col-start-5',
    imageSrc: '/assets/blog.avif',
    description:
      'Serverless deep-dives into AI engineering, Cloudflare Workers, Next.js OpenNext, LLM evaluations, and system design. Built with hybrid SSR and edge Vectorize 768-D semantic search.',
    techHighlights: [
      'Next.js on Cloudflare Workers (@opennextjs/cloudflare)',
      'D1 SQL Database for full article text storage',
      'Vectorize 768-D index with Gemini Embedding 2',
      'Sub-15ms edge search response time globally',
    ],
    metrics: [
      { label: 'Edge Latency', value: '14 ms P95' },
      { label: 'Vector Index', value: 'Gemini 768-D' },
      { label: 'Cold Start', value: '0.00 ms' },
    ],
  },
  {
    id: 'agent',
    title: 'agent.krsz.in',
    subtitle: 'Autonomous Tool-Calling AI Agent',
    url: 'https://agent.krsz.in',
    year: '2025-2026',
    tag: 'ai-agent',
    badgeType: 'Core Node',
    accentColor: 'var(--matte-slate)',
    colSpanClass: 'col-span-12 lg:col-span-6 xl:col-span-5 lg:col-start-1',
    imageSrc: '/assets/agent.avif',
    description:
      'Gemma-4 & Gemini powered autonomous AI agent running entirely in Cloudflare Workers V8 Isolates with multi-step tool calling, safe AST expression evaluation, web search, and vector RAG.',
    techHighlights: [
      'Autonomous function calling execution loop (Max 5 iterations)',
      'AST recursive-descent JavaScript evaluator without eval()',
      'Brave Web Search API + Vectorize RAG tool integration',
      'Real-time streaming SSE tokens with think block filtering',
    ],
    metrics: [
      { label: 'Default Model', value: 'Gemma-4-31B' },
      { label: 'Tool Pool', value: '5 Edge Tools' },
      { label: 'Session TTL', value: '1-Hour KV' },
    ],
  },
  {
    id: 'share',
    title: 'share.krsz.in',
    subtitle: 'Ephemeral File Relay & Asset Vault',
    url: 'https://share.krsz.in',
    year: '2024-2026',
    tag: 'storage',
    badgeType: 'Core Node',
    accentColor: 'var(--matte-ochre)',
    colSpanClass: 'col-span-12 lg:col-span-6 xl:col-span-5 lg:col-start-7 xl:col-start-7',
    imageSrc: '/assets/share.avif',
    description:
      'Fast, zero-knowledge temporary file transfer and asset vault powered by Cloudflare R2 bucket. Presigned multipart uploads, zero egress fees, and auto-expiring links.',
    techHighlights: [
      'AWS SDK S3 presigned PUT URL generation (5-min token window)',
      'Zero-egress object streaming directly from Cloudflare R2',
      'Configurable TTL expiration (1h, 24h, 7d, 30d)',
      'Zero third-party tracking or external telemetry',
    ],
    metrics: [
      { label: 'Egress Fee', value: '$0.00 / GB' },
      { label: 'Upload Speed', value: '~112 MB/s' },
      { label: 'Storage Engine', value: 'Cloudflare R2' },
    ],
  },
  {
    id: 'sharetube',
    title: 'sharetube.krsz.in',
    subtitle: 'Video Stream Sandbox & Transcoder',
    url: 'https://sharetube.krsz.in',
    year: '2025-2026',
    tag: 'media',
    badgeType: 'Core Node',
    accentColor: 'var(--matte-clay)',
    colSpanClass: 'col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-4 lg:col-start-1',
    imageSrc: '/assets/sharetube.avif',
    description:
      'Edge video streaming sandbox for media artifacts and transcoding experiments. Supports adaptive bitrate playback, byte-range slicing, and HLS transmuxing with FFmpeg & VAAPI.',
    techHighlights: [
      'Byte-range slicing on Cloudflare Workers edge nodes',
      'Adaptive bitrate streaming profiles (1080p / 720p / 480p)',
      'AV1 & VP9 modern codec support with Opus audio',
      'Sub-10ms initial media chunk latency',
    ],
    metrics: [
      { label: 'Transmux', value: '< 8.4 ms' },
      { label: 'Codecs', value: 'AV1 / VP9' },
      { label: 'Format', value: 'HLS / MP4' },
    ],
  },
  {
    id: 'mail',
    title: 'mail.krsz.in',
    subtitle: 'Encrypted Mail Worker Gateway',
    url: 'https://mail.krsz.in',
    year: '2024-2026',
    tag: 'comms',
    badgeType: 'Core Node',
    accentColor: 'var(--matte-sage)',
    colSpanClass: 'col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-4 lg:col-start-5',
    imageSrc: '/assets/mail.avif',
    description:
      'Zero-knowledge serverless email gateway running on Cloudflare Email Routing. Real-time spam filtering, DKIM verification, and encrypted mailbox dispatch.',
    techHighlights: [
      'Cloudflare Email Routing programmatic worker hook',
      'DKIM & SPF automated security verification',
      'Zero spam score threshold with heuristic token filter',
      'Instant Webhook notification dispatch',
    ],
    metrics: [
      { label: 'DKIM Pass', value: '100.0%' },
      { label: 'Spam Score', value: '0.00 / Clean' },
      { label: 'Domain', value: 'krsz.in Root' },
    ],
  },
  {
    id: 'skill',
    title: 'skill.krsz.in',
    subtitle: 'Engineering Directives & KISS Rules',
    url: 'https://skill.krsz.in/rules',
    year: '2025-2026',
    tag: 'rules',
    badgeType: 'Philosophy',
    accentColor: 'var(--matte-sand)',
    colSpanClass: 'col-span-12 sm:col-span-12 lg:col-span-4 xl:col-span-4 lg:col-start-9',
    imageSrc: '/assets/skill.avif',
    description:
      'Kurashizu engineering directives: KISS in everything, SvelteKit web stack, uv for Python, Cloudflare Workers & R2 serverless runtime, and CLI-first workflows (wrangler, gh, hf, ffmpeg).',
    techHighlights: [
      'Core philosophy: Follow best practices and KISS in everything',
      'Web: SvelteKit exclusively (zero bloated frameworks)',
      'Python: uv only (uv init / uv add / uv run)',
      'CLI toolchain: wrangler, gh, hf, aws, ffmpeg',
    ],
    metrics: [
      { label: 'Motto', value: 'KISS In All' },
      { label: 'Web Stack', value: 'SvelteKit' },
      { label: 'Python Tool', value: 'uv only' },
    ],
  },
];

// Standardized Module Spec Plate
interface SpecPlateProps {
  project: ProjectItem;
  onClick: () => void;
}

const SpecPlate: React.FC<SpecPlateProps> = ({ project, onClick }) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [transformStyle, setTransformStyle] = useState<string>('');

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -4;
    const rotateY = ((x - centerX) / centerX) * 4;

    setTransformStyle(`perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.008, 1.008, 1.008)`);
  };

  const handleMouseLeave = () => {
    setTransformStyle('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
  };

  return (
    <article
      className={`${project.colSpanClass} group cursor-pointer`}
      onClick={onClick}
    >
      <div className="space-y-2.5">
        {/* Spec Box Plate */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ transform: transformStyle, transition: 'transform 0.15s ease-out' }}
          className="relative w-full aspect-[16/10] rounded bg-[var(--bg-card)] border border-[var(--border)] group-hover:border-[var(--border-hover)] overflow-hidden flex flex-col justify-between p-4 sm:p-5 select-none transition-colors duration-200"
        >
          {/* Background Technical Visual with Matte Mask */}
          {project.imageSrc && (
            <div className="absolute inset-0 -z-10 overflow-hidden">
              <img
                src={project.imageSrc}
                alt={project.title}
                className="w-full h-full object-cover opacity-20 group-hover:opacity-35 transition-all duration-300 ease-out grayscale group-hover:grayscale-0"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)]/80 to-transparent" />
            </div>
          )}

          {/* Top Bar: Standardized Header */}
          <div className="flex items-center justify-between w-full relative z-10 font-mono text-[11px]">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <span
                className="w-2 h-2 rounded-xs"
                style={{ backgroundColor: project.accentColor }}
              />
              <span className="font-bold tracking-wider uppercase text-[var(--text-primary)]">
                MOD_{project.id.toUpperCase()}
              </span>
            </div>

            <span className="px-1.5 py-0.5 font-mono text-[10px] uppercase font-medium text-[var(--text-tertiary)] border border-[var(--border)] rounded">
              {project.badgeType}
            </span>
          </div>

          {/* Middle Body */}
          <div className="my-auto py-1 relative z-10">
            <h3 className="font-sans text-base sm:text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--matte-sand)] transition-colors leading-snug">
              {project.subtitle}
            </h3>
            <p className="mt-1 text-xs font-sans text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
              {project.description}
            </p>
          </div>

          {/* Bottom Telemetry Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs font-mono text-[var(--text-tertiary)] relative z-10">
            <span className="group-hover:text-[var(--text-primary)] transition-colors text-[11px] tabular-nums">
              {project.metrics[0].label}: {project.metrics[0].value}
            </span>
            <span className="flex items-center gap-1 text-[var(--text-primary)] font-bold text-xs">
              <span>INSPECT</span>
              <span className="text-[10px] text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]">{'->'}</span>
            </span>
          </div>
        </div>

        {/* Standard Single-Line Metadata Rule */}
        <div className="flex justify-between items-center gap-3 text-xs uppercase font-mono pt-0.5">
          <span className="flex-1 font-bold text-[var(--text-primary)] truncate group-hover:underline underline-offset-4">
            {project.title}
          </span>
          <div className="flex items-center gap-2 font-mono text-[var(--text-secondary)] tabular-nums whitespace-nowrap shrink-0">
            <span>{project.year}</span>
            <span className="hidden sm:inline text-[11px] text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]">
              [{project.tag}]
            </span>
          </div>
        </div>
      </div>
    </article>
  );
};

export const ProjectShowcase: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);

  const handleCardClick = (project: ProjectItem) => {
    playSound('click');
    setSelectedProject(project);
  };

  return (
    <div className="w-full">
      {/* 1. TRANSITIONAL SIGNATURE & MANIFESTO SECTION */}
      <section className="grid grid-cols-12 gap-y-8 px-4 sm:px-8 lg:px-12 py-16 lg:py-20 w-full border-t border-[var(--border)] select-none">
        {/* Left Col 1-3: Animated Signature */}
        <div className="relative col-span-12 sm:col-span-4 lg:col-span-3 flex flex-col justify-center">
          <SignatureSvg
            width="100%"
            height={110}
            color="var(--text-primary)"
            accentColor="var(--matte-sand)"
          />
        </div>

        {/* Right Col 5-12: Big Statement Paragraphs */}
        <div className="flex flex-col justify-start items-start gap-4 col-span-12 sm:col-span-8 lg:col-span-8 sm:col-start-5 lg:col-start-5 text-lg sm:text-xl lg:text-2xl leading-snug font-sans text-[var(--text-secondary)]">
          <p className="text-[var(--text-primary)] font-medium select-text">
            I shape AI-era tools with craft, taste, and restraint — building the next generation of serverless infrastructure.
          </p>
          <p className="select-text text-sm sm:text-base lg:text-lg leading-relaxed text-[var(--text-secondary)] font-mono">
            Stack in active production:{' '}
            <span className="text-[var(--text-primary)] font-semibold">Cloudflare Workers V8 Isolates</span>,{' '}
            <span className="text-[var(--text-primary)] font-semibold">D1 SQL Database</span>,{' '}
            <span className="text-[var(--text-primary)] font-semibold">Vectorize 768-D</span>,{' '}
            <span className="text-[var(--text-primary)] font-semibold">SvelteKit &amp; OpenNext</span>,{' '}
            <span className="text-[var(--text-primary)] font-semibold">uv &amp; Python</span>, and{' '}
            <span className="text-[var(--text-primary)] font-semibold">FFmpeg VAAPI transcoding</span>.
          </p>
        </div>
      </section>

      {/* 2. ASYMMETRIC 12-COLUMN MODULE SPEC PLATES (#selected-work) */}
      <section id="selected-work" className="px-4 sm:px-8 lg:px-12 py-16 lg:py-20 w-full border-t border-[var(--border)]">
        <div className="flex items-center justify-between font-mono text-xs text-[var(--text-secondary)] mb-6 select-none">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-primary)] font-bold">[MODULE SPEC PLATES]</span>
            <span>// 6 CORE EDGE DESTINATIONS</span>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] hidden sm:inline font-mono">
            SELECT MODULE TO EXPAND ARCHITECTURE SCHEMATIC
          </span>
        </div>

        {/* 6 Core Plates Grid */}
        <div className="grid grid-cols-12 gap-y-8 sm:gap-y-10 sm:gap-x-6 w-full">
          {CORE_PROJECTS.map((project) => (
            <SpecPlate
              key={project.id}
              project={project}
              onClick={() => handleCardClick(project)}
            />
          ))}
        </div>

        {/* 3. DISCREET SECONDARY HUBS (HuggingFace & GitHub Quiet Dock) */}
        <div className="mt-12 pt-6 border-t border-[var(--border)]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase">[SECONDARY HUBS]</span>
              <span className="text-[var(--text-primary)] font-bold">Open Repositories &amp; Weights</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* GitHub Link (Discreet) */}
              <a
                href="https://github.com/kurashizu"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => playSound('click')}
                className="btn-dotted px-3 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-hover)] text-xs text-[var(--text-primary)] flex items-center gap-2 transition-colors font-mono"
              >
                <Code2 className="w-3.5 h-3.5 text-[var(--matte-slate)]" />
                <span className="font-bold">github.com/kurashizu</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">· Monorepo</span>
                <ArrowUpRight className="w-3 h-3 text-[var(--text-tertiary)]" />
              </a>

              {/* HuggingFace Link (Discreet Standby) */}
              <a
                href="https://huggingface.co/kurashizu"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => playSound('click')}
                className="btn-dotted px-3 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-hover)] text-xs text-[var(--text-primary)] flex items-center gap-2 transition-colors font-mono"
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--matte-rust)]" />
                <span className="font-bold">huggingface.co/kurashizu</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">· Weights</span>
                <ArrowUpRight className="w-3 h-3 text-[var(--text-tertiary)]" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Detail Modal */}
      <ProjectModal
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    </div>
  );
};
