import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  PixelTerminal,
  PixelBlog,
  PixelAgent,
  PixelVault,
  PixelVideo,
  PixelMail,
  PixelRules,
  PixelTopology,
  PixelAudio,
  PixelArrowUpRight,
  PixelGitHub,
  PixelHuggingFace,
  PixelHardware,
} from '../pixel/PixelIcons';
import { sound, playSound } from '../../lib/sound';
import {
  modularSynth,
  SynthWaveform,
  BlendMode,
  FilterType,
  LfoWaveform,
  LfoTarget,
  ModSource,
  ModDest,
  ModRoute,
  PIANO_ROLL_NOTES,
  TrackData,
  INITIAL_TRACKS,
  NoteDurationDiv,
  divToStepSpan,
  divToColumnSpan,
  TimeSignature,
  METER_SPECS,
  getWaveformAbbr,
} from '../../lib/synth';
import { RotaryKnob, HardwareFader, HorizontalHardwareFader } from '../synth/HardwareControls';
import { evaluateSafeJS } from '../../lib/evaluator';

export type WorkspaceTheme = 'tokyo-matte' | 'gruvbox-dark' | 'nord-terminal' | 'cyber-amber';

interface ModuleSpec {
  id: string;
  name: string;
  url: string;
  tag: string;
  badge: string;
  desc: string;
  tech: string[];
  metrics: { label: string; value: string; pct: number }[];
  color: string;
  bgTint: string;
  borderColor: string;
}

const MODULES: ModuleSpec[] = [
  {
    id: 'blog',
    name: 'blog.krsz.in',
    url: 'https://blog.krsz.in',
    tag: 'NEXTJS_SSR_RAG',
    badge: 'NODE_01',
    desc: 'Technical research log & 768-D Vectorize index. Full article body stored in D1 SQL with Next.js OpenNext on Cloudflare Workers.',
    tech: ['Next.js OpenNext V8', 'Cloudflare D1 SQL (Full Body)', 'Vectorize 768-D Cosine Index', 'Gemini Embedding 2 API'],
    metrics: [
      { label: 'EDGE_RTT', value: '14.2ms', pct: 92 },
      { label: 'D1_QUERY', value: '2.8ms', pct: 85 },
      { label: 'VECTOR_HNSW', value: '16.4ms', pct: 88 },
    ],
    color: '#e06c75',
    bgTint: 'rgba(224, 108, 117, 0.08)',
    borderColor: 'rgba(224, 108, 117, 0.4)',
  },
  {
    id: 'agent',
    name: 'agent.krsz.in',
    url: 'https://agent.krsz.in',
    tag: 'AUTONOMOUS_LLM',
    badge: 'NODE_02',
    desc: 'Autonomous AI agent in V8 Isolates with multi-step tool execution loop, AST safe evaluator, and streaming SSE.',
    tech: ['Gemma-4-31B Engine', 'Safe AST Evaluator', 'Brave Web Search API', 'Vectorize RAG Feed'],
    metrics: [
      { label: 'MODEL_TTFT', value: '82ms', pct: 90 },
      { label: 'TOOL_POOL', value: '5 Tools', pct: 75 },
      { label: 'KV_TTL', value: '3600s', pct: 60 },
    ],
    color: '#61afef',
    bgTint: 'rgba(97, 175, 239, 0.08)',
    borderColor: 'rgba(97, 175, 239, 0.4)',
  },
  {
    id: 'share',
    name: 'share.krsz.in',
    url: 'https://share.krsz.in',
    tag: 'R2_OBJECT_S3',
    badge: 'NODE_03',
    desc: 'Ephemeral file relay & asset vault on S3/R2. Presigned multipart uploads, zero egress fees, auto TTL purge cron.',
    tech: ['SvelteKit Cloudflare Adapter', 'S3 Presigned PUT Direct', 'D1 Storage Quotas', 'Zero Egress Fee'],
    metrics: [
      { label: 'EGRESS_COST', value: '$0.00', pct: 100 },
      { label: 'THROUGHPUT', value: '112 MB/s', pct: 94 },
      { label: 'DURABILITY', value: '99.999%', pct: 99 },
    ],
    color: '#e5c07b',
    bgTint: 'rgba(229, 192, 123, 0.08)',
    borderColor: 'rgba(229, 192, 123, 0.4)',
  },
  {
    id: 'sharetube',
    name: 'sharetube.krsz.in',
    url: 'https://sharetube.krsz.in',
    tag: 'FFMPEG_MEDIA',
    badge: 'NODE_04',
    desc: 'Video streaming sandbox & transcoder. GitHub Actions macOS VideoToolbox / Linux FFmpeg with OmniProxy Oracle Australia.',
    tech: ['macOS VideoToolbox Runner', 'yt-dlp + OmniProxy Tunnel', 'FFmpeg CJK Watermarking', 'S3 Byte-Range Slicing'],
    metrics: [
      { label: 'SLICE_RTT', value: '8.4ms', pct: 88 },
      { label: 'CODEC_AV1', value: 'Hardware', pct: 95 },
      { label: 'AUDIO_OPUS', value: '160kbps', pct: 80 },
    ],
    color: '#c678dd',
    bgTint: 'rgba(198, 120, 221, 0.08)',
    borderColor: 'rgba(198, 120, 221, 0.4)',
  },
  {
    id: 'mail',
    name: 'mail.krsz.in',
    url: 'https://mail.krsz.in',
    tag: 'EMAIL_GATEWAY',
    badge: 'NODE_05',
    desc: 'Zero-knowledge serverless mail gateway on Cloudflare Email Routing. DKIM/SPF verification and webhook dispatch.',
    tech: ['CF Email Routing Hook', 'DKIM & SPF Verify', 'Heuristic Spam Filter', 'Webhook Forwarding'],
    metrics: [
      { label: 'DKIM_PASS', value: '100.0%', pct: 100 },
      { label: 'SPAM_SCORE', value: '0.00 Clean', pct: 98 },
      { label: 'DOMAIN_ROOT', value: 'krsz.in', pct: 100 },
    ],
    color: '#98c379',
    bgTint: 'rgba(152, 195, 121, 0.08)',
    borderColor: 'rgba(152, 195, 121, 0.4)',
  },
  {
    id: 'skill',
    name: 'skill.krsz.in',
    url: 'https://skill.krsz.in/rules',
    tag: 'KISS_DIRECTIVES',
    badge: 'NODE_06',
    desc: 'Kurashizu engineering directives: KISS in everything, SvelteKit web stack, uv for Python, CLI-first workflows.',
    tech: ['KISS Principle Level 0', 'SvelteKit Exclusively', 'uv Python Tool Only', 'wrangler / gh / hf'],
    metrics: [
      { label: 'PHILOSOPHY', value: 'KISS In All', pct: 100 },
      { label: 'WEB_STACK', value: 'SvelteKit', pct: 95 },
      { label: 'PYTHON_ENV', value: 'uv run', pct: 95 },
    ],
    color: '#56b6c2',
    bgTint: 'rgba(86, 182, 194, 0.08)',
    borderColor: 'rgba(86, 182, 194, 0.4)',
  },
];

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BRAILLE_WAVES = ['⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿', '⣶', '⣦', '⣤', '⣄'];

interface AdsrVisualizerProps {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  color?: string;
}

const AdsrVisualizer: React.FC<AdsrVisualizerProps> = ({
  attack = 0.005,
  decay = 0.15,
  sustain = 0.5,
  release = 0.1,
  color = '#98c379',
}) => {
  const width = 160;
  const height = 46;
  const padX = 4;
  const padY = 4;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  const holdTime = 0.25;
  const totalT = Math.max(0.1, attack + decay + holdTime + release);

  const x0 = padX;
  const y0 = height - padY;

  const wA = (attack / totalT) * usableW;
  const x1 = x0 + wA;
  const y1 = padY;

  const wD = (decay / totalT) * usableW;
  const x2 = x1 + wD;
  const y2 = height - padY - Math.max(0, Math.min(1, sustain)) * usableH;

  const wS = (holdTime / totalT) * usableW;
  const x3 = x2 + wS;
  const y3 = y2;

  const wR = (release / totalT) * usableW;
  const x4 = x3 + wR;
  const y4 = y0;

  const pathD = `M ${x0},${y0} L ${x1},${y1} Q ${(x1 + x2) / 2},${y1 + (y2 - y1) * 0.75} ${x2},${y2} L ${x3},${y3} Q ${(x3 + x4) / 2},${y3 + (y4 - y3) * 0.75} ${x4},${y4}`;
  const fillD = `${pathD} L ${x4},${y0} L ${x0},${y0} Z`;

  return (
    <div className="w-full bg-black/70 border border-white/15 rounded-xs p-1 flex flex-col items-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-12 overflow-visible select-none"
      >
        <defs>
          <linearGradient id="adsrGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid Background Lines */}
        <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="rgba(255,255,255,0.08)" strokeDasharray="2,2" />
        <line x1={padX} y1={y0} x2={width - padX} y2={y0} stroke="rgba(255,255,255,0.2)" />
        <line x1={x1} y1={padY} x2={x1} y2={y0} stroke="rgba(255,255,255,0.08)" strokeDasharray="1,2" />
        <line x1={x2} y1={padY} x2={x2} y2={y0} stroke="rgba(255,255,255,0.08)" strokeDasharray="1,2" />
        <line x1={x3} y1={padY} x2={x3} y2={y0} stroke="rgba(255,255,255,0.08)" strokeDasharray="1,2" />

        {/* Shaded Area Under Curve */}
        <path d={fillD} fill="url(#adsrGrad)" />

        {/* Active Curve Line */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Control Anchor Points */}
        <circle cx={x1} cy={y1} r="2.5" fill={color} className="shadow-sm" />
        <circle cx={x2} cy={y2} r="2" fill="#fff" />
        <circle cx={x3} cy={y3} r="2" fill="#fff" />
      </svg>

      {/* Real-time Precision Readouts: Row 1 = A D S R, Row 2 = Values */}
      <div className="w-full flex flex-col gap-0.5 border-t border-white/10 pt-0.5 font-mono leading-none">
        <div className="grid grid-cols-4 text-center text-xs font-black text-white/60">
          <span>A</span>
          <span>D</span>
          <span>S</span>
          <span>R</span>
        </div>
        <div className="grid grid-cols-4 text-center text-xs font-black">
          <span style={{ color }}>{Math.round(attack * 1000)}ms</span>
          <span className="text-white/90">{Math.round(decay * 1000)}ms</span>
          <span className="text-white/90">{Math.round(sustain * 100)}%</span>
          <span style={{ color }}>{Math.round(release * 1000)}ms</span>
        </div>
      </div>
    </div>
  );
};


interface VisibleTrackItem {
  id: number;
  color: string;
  grid: number[][];
  isPrimary: boolean;
}

interface PianoRollRowProps {
  nInfo: { note: string; freq: number; isBlack: boolean; oct: number };
  actualIdx: number;
  visibleTracks: VisibleTrackItem[];
  viewportStartCol: number;
  activeCol: number;
  activeSubCol: number;
  timeMeter: TimeSignature;
  snapDiv: NoteDurationDiv;
  totalPatternSteps: number;
  onAudition: (noteIdx: number) => void;
  onCellClick: (noteIdx: number, colIdx: number) => void;
  onSubCellClick: (noteIdx: number, colIdx: number, subCol: number) => void;
}

const PianoRollRow = React.memo<PianoRollRowProps>(({
  nInfo,
  actualIdx,
  visibleTracks,
  viewportStartCol,
  activeCol,
  activeSubCol,
  timeMeter,
  snapDiv,
  totalPatternSteps,
  onAudition,
  onCellClick,
  onSubCellClick,
}) => {
  const isRootC = nInfo.note.startsWith('C') && !nInfo.note.includes('#');
  const meterSpec = METER_SPECS[timeMeter] || METER_SPECS['4/4'];
  const colsCount = meterSpec.colsPerBar;
  const colSpan = divToColumnSpan(snapDiv);
  const spanInt = Math.max(1, Math.floor(colSpan));

  return (
    <div
      className="flex items-center gap-1 shrink-0 min-h-[18px] h-[18px]"
    >
      {/* Playable Interactive Note Key Badge */}
      <button
        type="button"
        onClick={() => onAudition(actualIdx)}
        title={`Audition ${nInfo.note} (${Math.round(nInfo.freq)}Hz)`}
        className={`w-9 h-full text-right pr-1 font-bold shrink-0 rounded-xs flex items-center justify-end select-none cursor-pointer transition-all hover:brightness-125 active:scale-95 ${
          isRootC
            ? 'bg-[#56b6c2]/30 text-[#56b6c2] border border-[#56b6c2]/40 hover:bg-[#56b6c2]/50'
            : nInfo.isBlack
            ? 'bg-black/90 text-[#e5c07b] border-r border-white/20 hover:bg-neutral-900'
            : 'bg-white/10 text-[#eceff4] hover:bg-white/20'
        }`}
      >
        {nInfo.note}
      </button>

      {/* Dynamic Metric Columns Grid with Seamless Connected Note Blocks */}
      <div
        className="flex-1 h-full gap-0.5"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${colsCount}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: colsCount }).map((_, colIdx) => {
          const globalCol = viewportStartCol + colIdx;
          const step0 = globalCol * 2;
          const step1 = globalCol * 2 + 1;
          const isColActive = activeCol === colIdx;

          const colInBar = globalCol % meterSpec.colsPerBar;
          const isBarStart = colInBar === 0;
          const isBeatStart = colInBar % meterSpec.colsPerBeat === 0;
          const isDivBlockStart = colIdx % spanInt === 0;

          return (
            <div key={colIdx} className="h-full relative flex">
              {snapDiv === '1/8' ? (
                <div className="flex h-full w-full gap-0.5">
                  {[0, 1].map((subCol) => {
                    const step = globalCol * 2 + subCol;
                    const isSubCurrent = isColActive && activeSubCol === subCol;

                    const tracksWithNote = visibleTracks.filter((t) => t.grid[step]?.includes(actualIdx));
                    const hasNote = tracksWithNote.length > 0;
                    const primaryTrackWithNote = tracksWithNote.find((t) => t.isPrimary);
                    const displayColor = primaryTrackWithNote ? primaryTrackWithNote.color : (tracksWithNote[0]?.color || '#fff');
                    const isPrimaryNote = Boolean(primaryTrackWithNote);

                    const isPrevConnected = hasNote && visibleTracks.some((t) => t.grid[step]?.includes(actualIdx) && (t.grid[step - 1]?.includes(actualIdx) || false));
                    const isNextConnected = hasNote && visibleTracks.some((t) => t.grid[step]?.includes(actualIdx) && (t.grid[step + 1]?.includes(actualIdx) || false));

                    let roundedClass = 'rounded-xs';
                    let spanMargin = '';
                    if (hasNote) {
                      if (isPrevConnected && isNextConnected) {
                        roundedClass = 'rounded-none border-x-0';
                        spanMargin = '-mx-[1.5px] z-[2]';
                      } else if (isPrevConnected) {
                        roundedClass = 'rounded-l-none rounded-r-xs border-l-0';
                        spanMargin = '-ml-[1.5px] z-[2]';
                      } else if (isNextConnected) {
                        roundedClass = 'rounded-r-none rounded-l-xs border-r-0 border-l-2 border-white/70';
                        spanMargin = '-mr-[1.5px] z-[2]';
                      } else {
                        roundedClass = 'rounded-xs border-l-2 border-white/70';
                      }
                    }

                    return (
                      <button
                        key={subCol}
                        onClick={() => onSubCellClick(actualIdx, colIdx, subCol)}
                        className={`flex-1 h-full cursor-pointer border ${roundedClass} ${spanMargin} transition-colors relative ${
                          hasNote
                            ? `shadow-xs ${isSubCurrent ? 'brightness-125 ring-1 ring-white' : ''}`
                            : isSubCurrent
                            ? 'border-white/70 bg-white/30'
                            : isBarStart && subCol === 0
                            ? isRootC
                              ? 'border-l-2 border-[#56b6c2]/80 bg-[#56b6c2]/10 hover:bg-[#56b6c2]/20'
                              : nInfo.isBlack
                              ? 'border-l-2 border-[#56b6c2]/70 bg-black/60 hover:bg-white/10'
                              : 'border-l-2 border-[#56b6c2]/70 bg-white/[0.08] hover:bg-white/20'
                            : isBeatStart && subCol === 0
                            ? isRootC
                              ? 'border-l border-white/40 bg-[#56b6c2]/[0.07] hover:bg-[#56b6c2]/15'
                              : nInfo.isBlack
                              ? 'border-l border-white/25 bg-black/60 hover:bg-white/10'
                              : 'border-l border-white/30 bg-white/[0.04] hover:bg-white/20'
                            : isRootC
                            ? 'border-white/10 bg-[#56b6c2]/[0.06] hover:bg-[#56b6c2]/15'
                            : nInfo.isBlack
                            ? subCol === 1
                              ? 'border-l border-black/20 bg-black/60 hover:bg-white/10'
                              : 'border-black/20 bg-black/60 hover:bg-white/10'
                            : subCol === 1
                            ? 'border-l border-white/10 bg-white/[0.03] hover:bg-white/10'
                            : 'border-white/5 bg-white/[0.03] hover:bg-white/10'
                        }`}
                        style={{
                          backgroundColor: hasNote ? displayColor : undefined,
                          borderColor: hasNote ? displayColor : undefined,
                          opacity: hasNote && !isPrimaryNote ? 0.75 : 1,
                        }}
                        title={`Step ${step + 1} (${subCol === 0 ? 'Left' : 'Right'} half)${hasNote ? ` — ${tracksWithNote.length} note(s)` : ''}`}
                      />
                    );
                  })}
                </div>
              ) : (
                <button
                  onClick={() => onCellClick(actualIdx, colIdx)}
                  className={`relative w-full h-full cursor-pointer rounded-xs border transition-colors ${
                    isColActive
                      ? 'border-white/70 bg-white/25 shadow-xs'
                      : isBarStart
                      ? isRootC
                        ? 'border-y border-r border-white/15 border-l-2 border-l-[#56b6c2]/80 bg-[#56b6c2]/10 hover:bg-[#56b6c2]/20'
                        : nInfo.isBlack
                        ? 'border-y border-r border-white/10 border-l-2 border-l-[#56b6c2]/80 bg-black/60 hover:bg-white/10'
                        : 'border-y border-r border-white/15 border-l-2 border-l-[#56b6c2]/80 bg-white/[0.08] hover:bg-white/20'
                      : isBeatStart
                      ? isRootC
                        ? 'border-y border-r border-white/15 border-l border-l-white/40 bg-[#56b6c2]/[0.07] hover:bg-[#56b6c2]/15'
                        : nInfo.isBlack
                        ? 'border-y border-r border-white/10 border-l border-l-white/30 bg-black/60 hover:bg-white/10'
                        : 'border-y border-r border-white/15 border-l border-l-white/40 bg-white/[0.04] hover:bg-white/20'
                      : isRootC
                      ? 'border border-white/10 bg-[#56b6c2]/[0.06] hover:bg-[#56b6c2]/15'
                      : nInfo.isBlack
                      ? 'border border-black/20 bg-black/55 hover:bg-white/10'
                      : isDivBlockStart
                      ? 'border border-white/20 bg-white/[0.03] hover:bg-white/10'
                      : 'border border-white/10 bg-white/[0.03] hover:bg-white/10'
                  }`}
                >
                  {/* Multi-Track Overlaid Continuous Note Bars */}
                  {visibleTracks.map((t) => {
                    const is0 = t.grid[step0]?.includes(actualIdx) || false;
                    const is1 = t.grid[step1]?.includes(actualIdx) || false;
                    if (!is0 && !is1) return null;

                    const isPrevConnected = is0 && (t.grid[step0 - 1]?.includes(actualIdx) || false);
                    const isNextConnected = is1 && (t.grid[step1 + 1]?.includes(actualIdx) || false);

                    let leftClass = 'left-0 rounded-l-xs';
                    let rightClass = 'right-0 rounded-r-xs';
                    let widthStyle: string = '100%';
                    let leftStyle: string | undefined = undefined;

                    if (is0 && is1) {
                      if (isPrevConnected && isNextConnected) {
                        leftClass = '-left-[2px] rounded-none';
                        rightClass = '-right-[2px]';
                        widthStyle = 'calc(100% + 4px)';
                        leftStyle = '-2px';
                      } else if (isPrevConnected) {
                        leftClass = '-left-[2px] rounded-l-none';
                        rightClass = 'right-0 rounded-r-xs';
                        widthStyle = 'calc(100% + 2px)';
                        leftStyle = '-2px';
                      } else if (isNextConnected) {
                        leftClass = 'left-0 rounded-l-xs border-l-2 border-white/80';
                        rightClass = '-right-[2px] rounded-r-none';
                        widthStyle = 'calc(100% + 2px)';
                        leftStyle = '0px';
                      } else {
                        leftClass = 'left-0 rounded-xs border-l-2 border-white/80';
                        rightClass = 'right-0';
                        widthStyle = '100%';
                        leftStyle = '0px';
                      }
                    } else if (is0 && !is1) {
                      if (isPrevConnected) {
                        leftClass = '-left-[2px] rounded-l-none';
                        rightClass = 'rounded-r-xs';
                        widthStyle = 'calc(50% + 2px)';
                        leftStyle = '-2px';
                      } else {
                        leftClass = 'left-0 rounded-xs border-l-2 border-white/80';
                        widthStyle = '50%';
                        leftStyle = '0px';
                      }
                    } else if (!is0 && is1) {
                      if (isNextConnected) {
                        leftClass = 'rounded-l-xs border-l-2 border-white/80';
                        rightClass = '-right-[2px] rounded-r-none';
                        widthStyle = 'calc(50% + 2px)';
                        leftStyle = '50%';
                      } else {
                        leftClass = 'rounded-xs border-l-2 border-white/80';
                        widthStyle = '50%';
                        leftStyle = '50%';
                      }
                    }

                    return (
                      <div
                        key={t.id}
                        className={`absolute top-0 h-full ${leftClass} ${rightClass} shadow-xs ${
                          t.isPrimary ? 'z-[3] opacity-100' : 'z-[2] opacity-75'
                        } ${isColActive && t.isPrimary ? 'brightness-125 ring-1 ring-white' : ''}`}
                        style={{
                          backgroundColor: t.color,
                          left: leftStyle,
                          width: widthStyle,
                        }}
                      />
                    );
                  })}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
PianoRollRow.displayName = 'PianoRollRow';


const WAVE_TOOLTIPS: Record<string, string> = {
  square: 'Square Waveform — Hollow timbre rich in odd harmonics, ideal for retro 8-bit leads and chiptune bass',
  sawtooth: 'Sawtooth Waveform — Bright, buzzy timbre with all harmonics, ideal for aggressive leads, brass, and thick pads',
  triangle: 'Triangle Waveform — Soft, warm timbre with gentle odd harmonics, ideal for warm basslines and flute sounds',
  sine: 'Sine Waveform — Pure fundamental frequency without overtones, ideal for deep sub bass and clean tones',
  noise: 'White Noise Generator — Equal energy across all frequencies, ideal for drums, percussive transients, and sound effects',
};

const BLEND_TOOLTIPS: Record<string, string> = {
  layer: 'Blend Mode: Layer — Sums Oscillator 1 and Oscillator 2 in parallel for thick dual-oscillator tones',
  fm: 'Blend Mode: FM (Frequency Modulation) — Oscillator 2 modulates the frequency of Oscillator 1 for rich metallic/bell harmonic timbres',
  ring: 'Blend Mode: Ring Modulation — Multiplies Oscillator 1 and 2 signals together creating complex inharmonic textures',
  sync: 'Blend Mode: Hard Sync — Resets Oscillator 2 phase whenever Oscillator 1 completes a cycle for cutting sync lead sweeps',
};

const FILTER_TOOLTIPS: Record<string, string> = {
  lowpass: 'Filter Mode: Low-Pass Filter (LPF) — Allows low frequencies below cutoff to pass through, attenuating highs',
  highpass: 'Filter Mode: High-Pass Filter (HPF) — Allows high frequencies above cutoff to pass through, attenuating lows',
  bandpass: 'Filter Mode: Band-Pass Filter (BPF) — Passes a resonant narrow band around the cutoff frequency, attenuating lows and highs',
  notch: 'Filter Mode: Notch / Band-Reject Filter (BRF) — Attenuates a narrow band at cutoff while letting both lows and highs pass',
};

const LFO_TOOLTIPS: Record<string, string> = {
  sine: 'Sine Wave LFO — Smooth, continuous cyclical modulation',
  triangle: 'Triangle Wave LFO — Linear ramp up and down modulation',
  square: 'Square Wave LFO — Stepped on/off binary modulation pulse',
  sawtooth: 'Sawtooth Wave LFO — Linear ramp with sharp instantaneous drop',
};

const PRESET_TOOLTIPS: Record<string, string> = {
  '8-BIT BASS': 'Preset: 8-Bit Bass — Retro chiptune square/triangle bass with snappy VCF filter envelope',
  'PLUCK': 'Preset: Pluck — Short transient acoustic/electronic synth pluck with fast filter decay',
  'BRASS': 'Preset: Brass — Dual detuned sawtooth oscillators with dynamic filter sweep',
  'LEAD': 'Preset: Lead — Cutting pulse/sawtooth sync lead with resonant filter and full sustain',
  'HI-HAT': 'Preset: Hi-Hat — Highpass filtered white noise percussive transient',
};

const TAB_ROUTES: Record<number, string> = {
  0: '/cluster',
  1: '/modules',
  2: '/topology',
  3: '/guestbook',
  4: '/synth',
};

const TAB_TITLES: Record<number, string> = {
  0: 'KRSZ™ // 0:cluster — Serverless Edge Portal',
  1: 'KRSZ™ // 1:modules — Specs & Architecture',
  2: 'KRSZ™ // 2:topology — Edge PoP Network',
  3: 'KRSZ™ // 3:guestbook — Edge Packet Messenger',
  4: 'KRSZ™ // 4:synth — WebAudio Modular Synthesizer',
};

const getTabFromPathname = (pathname: string): number => {
  const clean = pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
  if (clean === 'synth') return 4;
  if (clean === 'guestbook') return 3;
  if (clean === 'topology') return 2;
  if (clean === 'modules') return 1;
  if (clean === 'cluster' || clean === 'overview' || clean === '') return 0;
  return 0;
};

export const TmuxWorkspace: React.FC = () => {
  const [theme, setTheme] = useState<WorkspaceTheme>('tokyo-matte');
  const [activeTab, setActiveTab] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return getTabFromPathname(window.location.pathname);
    }
    return 0;
  });

  const navigateToTab = (tabId: number, updateHistory = true) => {
    setActiveTab(tabId);
    if (updateHistory && typeof window !== 'undefined') {
      const targetPath = TAB_ROUTES[tabId] || '/cluster';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tabId }, '', targetPath);
      }
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPathname(window.location.pathname);
      setActiveTab(tab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = TAB_TITLES[activeTab] || 'KRSZ™ — Serverless Edge Portal';
    }
  }, [activeTab]);
  const [selectedModule, setSelectedModule] = useState<ModuleSpec>(MODULES[0]);
  const [commandInput, setCommandInput] = useState<string>('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [commandOutput, setCommandOutput] = useState<string>('KRSZ-EDGE WORKBENCH READY // TYPE "help" OR USE [0-4] HOTKEYS');
  const [sydneyTime, setSydneyTime] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Micro-Animation Ticks
  const [spinnerFrame, setSpinnerFrame] = useState<number>(0);
  const [pulseStep, setPulseStep] = useState<number>(0);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Master Synthesizer & Sequencer State (Polyphonic + Dynamic 64-Step)
  const [synthBpm, setSynthBpm] = useState<number>(modularSynth.getBpm());
  const [snapDiv, setSnapDiv] = useState<NoteDurationDiv>('1/4');
  const [noteDur, setNoteDur] = useState<NoteDurationDiv>('1/4');
  const [timeMeter, setTimeMeter] = useState<TimeSignature>(modularSynth.getMeter());
  const [synthDelayMix, setSynthDelayMix] = useState<number>(0.0);
  const [synthDelayTime, setSynthDelayTime] = useState<number>(0.22);
  const [synthDelayFeedback, setSynthDelayFeedback] = useState<number>(0.32);
  const [synthReverbMix, setSynthReverbMix] = useState<number>(0.15);
  const [synthDrive, setSynthDrive] = useState<number>(0.0);
  const [scopeMode, setScopeMode] = useState<'dual' | 'fft' | 'wave'>('dual');
  const [octaveFrom, setOctaveFrom] = useState<number>(3);
  const [octaveTo, setOctaveTo] = useState<number>(5);
  const [activeTrackId, setActiveTrackId] = useState<number>(0);
  const [isOverlayMode, setIsOverlayMode] = useState<boolean>(true);
  const [overlayTrackIds, setOverlayTrackIds] = useState<number[]>([0, 1, 2, 3]);
  const [tracksState, setTracksState] = useState(modularSynth.getTracks());
  const [isSeqPlaying, setIsSeqPlaying] = useState<boolean>(true);
  const [seqCurrentStep, setSeqCurrentStep] = useState<number>(0);
  const [cursorStep, setCursorStep] = useState<number>(0);
  const [totalPatternSteps, setTotalPatternSteps] = useState<number>(modularSynth.getTotalSteps());
  const [activeStepPage, setActiveStepPage] = useState<number>(0);
  const [pageFollow, setPageFollow] = useState<boolean>(true);

  // Guestbook Form State & Focus
  const [gbName, setGbName] = useState('');
  const [gbEmail, setGbEmail] = useState('');
  const [gbContent, setGbContent] = useState('');
  const [gbStatus, setGbStatus] = useState<string | null>(null);
  const [gbFocusedField, setGbFocusedField] = useState<'name' | 'email' | 'content' | null>(null);

  // Audio Engine Visualizer
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loudnessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [timeBase, setTimeBase] = useState<'0.25x' | '0.5x' | '1x' | '2x' | '4x' | '8x' | '16x'>('1x');
  const [activeEnvTab, setActiveEnvTab] = useState<'amp' | 'vcf' | 'pit'>('amp');
  const [activeOutVisualizer, setActiveOutVisualizer] = useState<'fft' | 'scope' | 'loudness'>('fft');
  const [rackPage, setRackPage] = useState<1 | 2>(1);
  const cmdInputRef = useRef<HTMLInputElement | null>(null);

  // Patch Management State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Autoplay sequencer once on initial mount only
  useEffect(() => {
    if (!modularSynth.isPlayingSeq()) {
      modularSynth.startSequencer();
      setIsSeqPlaying(true);
    }
  }, []);

  // Use refs for the hot-path values to avoid step subscription re-mounting on every meter/pageFollow change
  const pageFollowRef = useRef(pageFollow);
  const timeMeterRef = useRef(timeMeter);
  useEffect(() => { pageFollowRef.current = pageFollow; }, [pageFollow]);
  useEffect(() => { timeMeterRef.current = timeMeter; }, [timeMeter]);

  // Subscribe to Multi-Track Sequencer Tick with Auto Page-Follow & rAF Batching
  // Runs ONCE on mount — uses refs to read latest values without re-subscribing
  useEffect(() => {
    let animId: number = 0;
    let pendingStep: number | null = null;

    const unsub = modularSynth.subscribeStep((step) => {
      pendingStep = step;
      if (!animId) {
        animId = requestAnimationFrame(() => {
          animId = 0;
          if (pendingStep !== null) {
            setSeqCurrentStep(pendingStep);
            if (pageFollowRef.current) {
              const meterSteps = (METER_SPECS[timeMeterRef.current] || METER_SPECS['4/4']).stepsPerBar;
              const p = Math.floor(pendingStep / meterSteps);
              setActiveStepPage(p);
            }
            pendingStep = null;
          }
        });
      }
    });

    return () => {
      unsub();
      if (animId) cancelAnimationFrame(animId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Patch & Built-in Song Management ---
  const STORAGE_KEY = 'krsz-synth-patch-v1';
  const BUILTIN_SONGS = [
    { id: 'OVERWORLD', name: 'OVERWORLD', steps: 1184, bpm: 105, meter: '4/4' as TimeSignature },
    { id: 'UNDERWATER', name: 'UNDERWATER', steps: 768, bpm: 100, meter: '6/8' as TimeSignature },
  ];
  const SOUND_PRESETS = [
    { name: '8-BIT BASS', preset: { osc1Waveform: 'square' as SynthWaveform, osc2Waveform: 'triangle' as SynthWaveform, cutoff: 1200, resonance: 4.2, ampAttack: 0.003, ampDecay: 0.12, ampSustain: 0.45, ampRelease: 0.08, filterAttack: 0.005, filterDecay: 0.15, filterSustain: 0.3, filterRelease: 0.08, filterEnvAmount: 0.6 } },
    { name: 'PLUCK', preset: { osc1Waveform: 'square' as SynthWaveform, osc2Waveform: 'sawtooth' as SynthWaveform, cutoff: 1800, resonance: 3.5, ampAttack: 0.003, ampDecay: 0.35, ampSustain: 0.7, ampRelease: 0.2, filterAttack: 0.003, filterDecay: 0.08, filterSustain: 0.0, filterRelease: 0.06, filterEnvAmount: 0.85 } },
    { name: 'BRASS', preset: { osc1Waveform: 'sawtooth' as SynthWaveform, osc2Waveform: 'sawtooth' as SynthWaveform, detuneCents: 12, cutoff: 2400, resonance: 2.0, ampAttack: 0.04, ampDecay: 0.25, ampSustain: 0.8, ampRelease: 0.2, filterAttack: 0.06, filterDecay: 0.2, filterSustain: 0.5, filterRelease: 0.15, filterEnvAmount: 0.55 } },
    { name: 'LEAD', preset: { osc1Waveform: 'pulse' as SynthWaveform, osc2Waveform: 'sawtooth' as SynthWaveform, detuneCents: 8, cutoff: 6500, resonance: 2.8, ampAttack: 0.005, ampDecay: 0.2, ampSustain: 0.8, ampRelease: 0.18, filterAttack: 0.005, filterDecay: 0.25, filterSustain: 0.6, filterRelease: 0.12, filterEnvAmount: 0.4 } },
    { name: 'HI-HAT', preset: { osc1Waveform: 'noise' as SynthWaveform, osc2Waveform: 'triangle' as SynthWaveform, osc2Gain: 0.0, filterType: 'highpass' as FilterType, cutoff: 40, resonance: 0.0, envFilterMod: 0.0, ampAttack: 0.001, ampDecay: 0.2, ampSustain: 0.0, ampRelease: 0.04, filterAttack: 0.001, filterDecay: 0.05, filterSustain: 0.0, filterRelease: 0.03, filterEnvAmount: 0.0, pitchEnvAmount: 0.0, pitchAttack: 0.001, pitchDecay: 0.03 } },
  ];
  const LEN_PRESETS = [16, 32, 64, 128, 256, 512] as const;

  const [builtinSongIdx, setBuiltinSongIdx] = useState<number>(0);
  const [soundPresetIdx, setSoundPresetIdx] = useState<number>(0);

  const handleNewProject = () => {
    modularSynth.stopSequencer();
    setIsSeqPlaying(false);
    modularSynth.resetToBlank(64);
    setTotalPatternSteps(64);
    setSynthBpm(120);
    setTimeMeter('4/4');
    setCursorStep(0);
    setSeqCurrentStep(0);
    setActiveStepPage(0);
    setTracksState([...modularSynth.getTracks()]);
    showSaveStatus('✓ NEW');
    playSound('click');
  };

  const handleLoadBuiltinSong = (idx: number) => {
    const song = BUILTIN_SONGS[idx];
    if (!song) return;
    setBuiltinSongIdx(idx);
    modularSynth.stopSequencer();
    setIsSeqPlaying(false);
    modularSynth.loadBuiltInSong(song.id);
    setTotalPatternSteps(song.steps);
    setSynthBpm(song.bpm);
    setTimeMeter(song.meter);
    setCursorStep(0);
    setSeqCurrentStep(0);
    setActiveStepPage(0);
    setIsOverlayMode(true);
    setOverlayTrackIds([0, 1, 2, 3]);
    setTracksState([...modularSynth.getTracks()]);
    showSaveStatus(`✓ ${song.name}`);
    playSound('toggle');
  };

  const handleCycleLen = () => {
    const currentIdx = LEN_PRESETS.indexOf(totalPatternSteps as any);
    const nextLen = currentIdx >= 0 && currentIdx < LEN_PRESETS.length - 1
      ? LEN_PRESETS[currentIdx + 1]
      : LEN_PRESETS[0];
    setTotalPatternSteps(nextLen);
    modularSynth.setTotalSteps(nextLen);
    const stepsCount = (METER_SPECS[timeMeter] || METER_SPECS['4/4']).stepsPerBar;
    const maxPages = Math.max(1, Math.ceil(nextLen / stepsCount));
    if (activeStepPage >= maxPages) setActiveStepPage(0);
    playSound('click');
  };

  interface SynthPatchData {
    tracks: Partial<TrackData>[];
    bpm: number;
    meter: TimeSignature;
    totalSteps: number;
  }

  const gatherPatchData = (): SynthPatchData => ({
    tracks: modularSynth.getTracks(),
    bpm: synthBpm,
    meter: timeMeter,
    totalSteps: totalPatternSteps,
  });

  const applyPatchData = (data: SynthPatchData) => {
    modularSynth.stopSequencer();
    setIsSeqPlaying(false);
    modularSynth.setPlaybackStep(0);
    setCursorStep(0);
    setSeqCurrentStep(0);
    setActiveStepPage(0);

    if (data.bpm) {
      setSynthBpm(data.bpm);
      modularSynth.setBpm(data.bpm);
    }
    if (data.meter) {
      setTimeMeter(data.meter);
      modularSynth.setMeter(data.meter);
    }
    if (data.totalSteps) {
      setTotalPatternSteps(data.totalSteps);
      modularSynth.setTotalSteps(data.totalSteps);
    }
    if (data.tracks && Array.isArray(data.tracks)) {
      data.tracks.forEach((tData) => {
        if (tData.id !== undefined) modularSynth.updateTrack(tData.id, tData);
      });
      setTracksState([...modularSynth.getTracks()]);
    }
  };

  const showSaveStatus = (msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleSavePatch = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gatherPatchData()));
      showSaveStatus('✓ SAVED');
      playSound('click');
    } catch (err) {
      showSaveStatus('X ERR');
    }
  };

  const handleLoadPatch = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        applyPatchData(JSON.parse(stored));
        showSaveStatus('✓ LOADED');
        playSound('toggle');
      } else {
        showSaveStatus('X EMPTY');
      }
    } catch (err) {
      showSaveStatus('X ERR');
    }
  };

  const handleExportPatch = () => {
    const patch = gatherPatchData();
    const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `krsz-patch-export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    playSound('click');
  };

  const handleImportPatch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        applyPatchData(parsed);
        showSaveStatus('✓ IMPORTED');
        playSound('toggle');
      } catch (err) {
        showSaveStatus('X INVALID');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Real-Time Clock & Animation Loop
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
      setSydneyTime(new Intl.DateTimeFormat('en-US', options).format(now));
    };
    updateTime();
    const intervalTime = setInterval(updateTime, 1000);

    const animInterval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
      setPulseStep((prev) => (prev + 1) % 12);
    }, 80);

    return () => {
      clearInterval(intervalTime);
      clearInterval(animInterval);
    };
  }, []);

  // Global Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = ['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase());
      if (isInput) return;

      const key = e.key.toLowerCase();
      if (key === '0') { navigateToTab(0); playSound('click'); return; }
      if (key === '1') { navigateToTab(1); playSound('click'); return; }
      if (key === '2') { navigateToTab(2); playSound('click'); return; }
      if (key === '3') { navigateToTab(3); playSound('click'); return; }
      if (key === '4') { navigateToTab(4); playSound('click'); return; }
      if (key === 't') { cycleTheme(); return; }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [theme]);

  const cycleTheme = () => {
    playSound('toggle');
    setTheme((prev) => {
      if (prev === 'tokyo-matte') return 'gruvbox-dark';
      if (prev === 'gruvbox-dark') return 'nord-terminal';
      if (prev === 'nord-terminal') return 'cyber-amber';
      return 'tokyo-matte';
    });
  };

  const handleCopy = (text: string) => {
    playSound('click');
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2200);
  };

  // Toggle Note in Polyphonic Piano Roll (Up to 8 notes per step across dynamic pages)
  const handlePianoRollCellClick = (noteIndex: number, colIndex: number) => {
    const snapSpanCols = divToColumnSpan(snapDiv);
    const snapInt = snapSpanCols >= 1 ? Math.floor(snapSpanCols) : 1;
    const snappedCol = Math.floor(colIndex / snapInt) * snapInt;

    const meterCols = (METER_SPECS[timeMeter] || METER_SPECS['4/4']).colsPerBar;
    const viewportStartCol = activeStepPage * meterCols;
    const globalCol = viewportStartCol + snappedCol;
    const startStep = globalCol * 2;
    const track = modularSynth.getTrack(activeTrackId);
    if (!track || startStep >= totalPatternSteps) return;

    // Check if a note already exists at startStep
    const isAlreadyOn = track.grid[startStep]?.includes(noteIndex) || false;

    if (isAlreadyOn) {
      // Toggle OFF: Remove note starting at startStep
      let s = startStep;
      while (s < totalPatternSteps && track.grid[s]?.includes(noteIndex)) {
        const notes = track.grid[s] || [];
        modularSynth.setTrackStepNotes(
          activeTrackId,
          s,
          notes.filter((n) => n !== noteIndex)
        );
        s++;
      }
      setTracksState([...modularSynth.getTracks()]);
      playSound('click');
    } else {
      // Toggle ON: Place note with duration noteDur
      const durSpanCols = divToColumnSpan(noteDur);
      const durSteps = Math.max(1, Math.round(durSpanCols * 2));
      const endStep = Math.min(totalPatternSteps, startStep + durSteps);

      for (let s = startStep; s < endStep; s++) {
        const notes = track.grid[s] || [];
        if (!notes.includes(noteIndex) && notes.length < 8) {
          modularSynth.setTrackStepNotes(
            activeTrackId,
            s,
            [...notes, noteIndex].sort((a, b) => a - b)
          );
        }
      }
      setTracksState([...modularSynth.getTracks()]);
      const isAccent = tracksState[activeTrackId]?.accents[startStep] || false;
      modularSynth.triggerTrackVoice(activeTrackId, noteIndex, isAccent);
    }
  };

  const handleAccentCellClick = (colIndex: number) => {
    const snapSpanCols = divToColumnSpan(snapDiv);
    const snapInt = snapSpanCols >= 1 ? Math.floor(snapSpanCols) : 1;
    const snappedCol = Math.floor(colIndex / snapInt) * snapInt;

    const meterCols = (METER_SPECS[timeMeter] || METER_SPECS['4/4']).colsPerBar;
    const viewportStartCol = activeStepPage * meterCols;
    const globalCol = viewportStartCol + snappedCol;
    const step0 = globalCol * 2;
    const step1 = globalCol * 2 + 1;
    const track = modularSynth.getTrack(activeTrackId);
    if (!track || step0 >= totalPatternSteps) return;

    const isAlreadyAccent = (track.accents[step0] || track.accents[step1]) || false;
    const nextState = !isAlreadyAccent;

    for (const s of [step0, step1]) {
      if (s < totalPatternSteps && track.accents[s] !== nextState) {
        modularSynth.toggleTrackAccent(activeTrackId, s);
      }
    }
    setTracksState([...modularSynth.getTracks()]);
    playSound('click');
  };

  const handlePianoRollSubCellClick = (noteIndex: number, colIndex: number, subCol: number) => {
    const meterCols = (METER_SPECS[timeMeter] || METER_SPECS['4/4']).colsPerBar;
    const viewportStartCol = activeStepPage * meterCols;
    const globalCol = viewportStartCol + colIndex;
    const startStep = globalCol * 2 + subCol;
    const track = modularSynth.getTrack(activeTrackId);
    if (!track || startStep >= totalPatternSteps) return;

    const isAlreadyOn = track.grid[startStep]?.includes(noteIndex) || false;

    if (isAlreadyOn) {
      // Toggle OFF
      let s = startStep;
      while (s < totalPatternSteps && track.grid[s]?.includes(noteIndex)) {
        const notes = track.grid[s] || [];
        modularSynth.setTrackStepNotes(
          activeTrackId,
          s,
          notes.filter((n) => n !== noteIndex)
        );
        s++;
      }
      setTracksState([...modularSynth.getTracks()]);
      playSound('click');
    } else {
      // Toggle ON: Place note with duration noteDur
      const durSpanCols = divToColumnSpan(noteDur);
      const durSteps = Math.max(1, Math.round(durSpanCols * 2));
      const endStep = Math.min(totalPatternSteps, startStep + durSteps);

      for (let s = startStep; s < endStep; s++) {
        const notes = track.grid[s] || [];
        if (!notes.includes(noteIndex) && notes.length < 8) {
          modularSynth.setTrackStepNotes(
            activeTrackId,
            s,
            [...notes, noteIndex].sort((a, b) => a - b)
          );
        }
      }
      setTracksState([...modularSynth.getTracks()]);
      const isAccent = tracksState[activeTrackId]?.accents[startStep] || false;
      modularSynth.triggerTrackVoice(activeTrackId, noteIndex, isAccent);
    }
  };

  const handleAccentSubCellClick = (colIndex: number, subCol: number) => {
    const meterCols = (METER_SPECS[timeMeter] || METER_SPECS['4/4']).colsPerBar;
    const viewportStartCol = activeStepPage * meterCols;
    const globalCol = viewportStartCol + colIndex;
    const step = globalCol * 2 + subCol;
    const track = modularSynth.getTrack(activeTrackId);
    if (!track || step >= totalPatternSteps) return;

    modularSynth.toggleTrackAccent(activeTrackId, step);
    setTracksState([...modularSynth.getTracks()]);
    playSound('click');
  };

  const handleTrackParamChange = (partial: Partial<TrackData>) => {
    modularSynth.updateTrack(activeTrackId, partial);
    setTracksState([...modularSynth.getTracks()]);
  };

  // Command Execution
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = commandInput.trim();
    if (!raw) return;

    playSound('keystroke', 'enter');
    setCommandHistory((prev) => [...prev.slice(-5), `$ ${commandInput}`]);
    setCommandInput('');

    const parts = raw.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

        if (cmd === '0' || cmd === 'cluster' || cmd === 'overview') { navigateToTab(0); setCommandOutput('Navigated to 0:cluster [/cluster]'); return; }
    if (cmd === '1' || cmd === 'modules' || cmd === 'specs') { navigateToTab(1); setCommandOutput('Navigated to 1:modules [/modules]'); return; }
    if (cmd === '2' || cmd === 'topology' || cmd === 'edge') { navigateToTab(2); setCommandOutput('Navigated to 2:topology [/topology]'); return; }
    if (cmd === '3' || cmd === 'guestbook' || cmd === 'packets') { navigateToTab(3); setCommandOutput('Navigated to 3:guestbook [/guestbook]'); return; }
    if (cmd === '4' || cmd === 'synth' || cmd === 'audio') { navigateToTab(4); setCommandOutput('Navigated to 4:synth [/synth]'); return; }

    if (cmd === 'eval' || cmd === 'calc' || cmd === 'js') {
      setCommandOutput(`=> ${evaluateSafeJS(args)}`);
      return;
    }

    if (cmd === 'seq' || cmd === 'sequence') {
      const playing = modularSynth.toggleSequencer();
      setIsSeqPlaying(playing);
      setCommandOutput(`Multi-track sequencer ${playing ? 'playing' : 'stopped'}.`);
      return;
    }

    if (cmd === 'bpm') {
      const val = parseInt(args, 10);
      if (!isNaN(val) && val >= 40 && val <= 300) {
        setSynthBpm(val);
        modularSynth.setBpm(val);
        setCommandOutput(`BPM set to ${val}.`);
      }
      return;
    }

    if (cmd === 'snap' || cmd === 'grid') {
      const valid = ['4', '2', '1', '1/2', '1/4', '1/8'];
      if (valid.includes(args.trim())) {
        const d = args.trim() as NoteDurationDiv;
        setSnapDiv(d);
        setCommandOutput(`Grid snap quantization set to ${d} beat.`);
      } else {
        setCommandOutput(`Invalid snap: "${args}". Valid: 4, 2, 1, 1/2, 1/4, 1/8`);
      }
      return;
    }

    if (cmd === 'dur' || cmd === 'notelen' || cmd === 'div') {
      const valid = ['4', '2', '1', '1/2', '1/4', '1/8'];
      if (valid.includes(args.trim())) {
        const d = args.trim() as NoteDurationDiv;
        setNoteDur(d);
        modularSynth.setEditNoteDiv(d);
        setCommandOutput(`Placed note duration set to ${d} beat.`);
      } else {
        setCommandOutput(`Invalid duration: "${args}". Valid: 4, 2, 1, 1/2, 1/4, 1/8`);
      }
      return;
    }

    if (cmd === 'meter' || cmd === 'timesig' || cmd === 'sig') {
      const valid = ['4/4', '3/4', '2/4', '5/4', '6/8', '7/8'];
      if (valid.includes(args.trim())) {
        const m = args.trim() as TimeSignature;
        setTimeMeter(m);
        modularSynth.setMeter(m);
        setCommandOutput(`Time signature set to ${m} (${METER_SPECS[m].name}).`);
      } else {
        setCommandOutput(`Invalid meter: "${args}". Valid: 4/4, 3/4, 2/4, 5/4, 6/8, 7/8`);
      }
      return;
    }

    if (cmd === 'blend') {
      if (['layer', 'fm', 'ring'].includes(args.toLowerCase())) {
        handleTrackParamChange({ blendMode: args.toLowerCase() as BlendMode });
        setCommandOutput(`Track ${activeTrackId + 1} blend mode set to ${args.toUpperCase()}`);
      }
      return;
    }

    if (cmd === 'clear' || cmd === 'cls') {
      setCommandHistory([]);
      setCommandOutput('Console buffer cleared.');
      return;
    }

    if (cmd === 'help' || cmd === 'man') {
      setCommandOutput('CMDS: eval <expr> | seq [play|stop] | bpm <40-300> | blend [layer|fm|ring] | theme | clear');
      return;
    }

    if (cmd === 'blog') { window.open('https://blog.krsz.in', '_blank'); return; }
    if (cmd === 'agent') { window.open('https://agent.krsz.in', '_blank'); return; }
    if (cmd === 'share') { window.open('https://share.krsz.in', '_blank'); return; }
    if (cmd === 'sharetube') { window.open('https://sharetube.krsz.in', '_blank'); return; }
    if (cmd === 'mail') { window.open('https://mail.krsz.in', '_blank'); return; }
    if (cmd === 'rules') { window.open('https://skill.krsz.in/rules', '_blank'); return; }
    if (cmd === 'gh') { window.open('https://github.com/kurashizu', '_blank'); return; }
    if (cmd === 'hf') { window.open('https://huggingface.co/kurashizu', '_blank'); return; }
    if (cmd === 'oshwhub') { window.open('https://oshwhub.com/Kurashizu', '_blank'); return; }

    setCommandOutput(`Command not recognized: "${cmd}". Type "help" or "eval 2**16".`);
  };

  const handleGuestbookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gbName.trim() || !gbEmail.trim() || !gbContent.trim()) {
      setGbStatus('ERROR: ALL FIELDS REQUIRED.');
      playSound('click');
      return;
    }
    setGbStatus('TRANSMITTING TO BLOG.KRSZ.IN...');
    playSound('click');

    try {
      const resp = await fetch('https://blog.krsz.in/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gbName.trim(), email: gbEmail.trim(), content: gbContent.trim() }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (resp.ok) {
        setGbStatus('TRANSMITTED: 201 OK DISPATCHED TO BLOG GUESTBOOK');
        setGbName('');
        setGbEmail('');
        setGbContent('');
        playSound('power');
      } else {
        setGbStatus(`ERROR: ${data.error || `HTTP ${resp.status}`}`);
        playSound('click');
      }
    } catch (err: any) {
      setGbStatus(`NETWORK ERROR: ${err?.message || 'TRANSMISSION FAILED'}`);
      playSound('click');
    }
  };

  // Dual Independent Visualizers: Logarithmic Spectrum Analyzer + Adjustable Timebase Oscilloscope
  useEffect(() => {
    if (activeTab !== 4) return;
    const fftCanvas = fftCanvasRef.current;
    const waveCanvas = waveCanvasRef.current;
    if (!fftCanvas && !waveCanvas) return;

    const fftCtx = fftCanvas?.getContext('2d');
    const waveCtx = waveCanvas?.getContext('2d');

    let loudnessHistory: number[] = new Array(360).fill(-100);
    let animId: number;
    const minLog = Math.log10(20);
    const maxLog = Math.log10(20000);
    const logRange = maxLog - minLog;

    const render = () => {
      animId = requestAnimationFrame(render);
      const freqData = sound.getByteFrequencyData();
      const timeData = sound.getByteTimeDomainData();

      // ─────────────────────────────────────────────────────────────
      // SCREEN 1: LOGARITHMIC FREQUENCY SPECTRUM ANALYZER (20Hz - 20kHz)
      // ─────────────────────────────────────────────────────────────
      if (fftCanvas && fftCtx) {
        const w = fftCanvas.width;
        const h = fftCanvas.height;
        fftCtx.clearRect(0, 0, w, h);

        // Dark Screen Background
        fftCtx.fillStyle = 'rgba(10, 12, 16, 0.95)';
        fftCtx.fillRect(0, 0, w, h);

        // Log Frequency Grid Lines: 100Hz, 1kHz, 10kHz
        const tick100 = ((Math.log10(100) - minLog) / logRange) * w;
        const tick1k = ((Math.log10(1000) - minLog) / logRange) * w;
        const tick10k = ((Math.log10(10000) - minLog) / logRange) * w;

        fftCtx.save();
        fftCtx.setLineDash([2, 3]);
        fftCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        fftCtx.lineWidth = 1;

        for (const tx of [tick100, tick1k, tick10k]) {
          fftCtx.beginPath();
          fftCtx.moveTo(tx, 0);
          fftCtx.lineTo(tx, h);
          fftCtx.stroke();
        }

        // Horizontal Grid Lines
        fftCtx.beginPath();
        fftCtx.moveTo(0, h * 0.5);
        fftCtx.lineTo(w, h * 0.5);
        fftCtx.stroke();
        fftCtx.restore();

        // Log Grid Text Markers
        fftCtx.font = '7px monospace';
        fftCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        fftCtx.fillText('100', tick100 - 6, 8);
        fftCtx.fillText('1k', tick1k - 4, 8);
        fftCtx.fillText('10k', tick10k - 6, 8);

        if (freqData && !isMuted) {
          const binCount = freqData.length;
          const nyquist = 22050;

          const grad = fftCtx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#e5c07b');
          grad.addColorStop(0.5, '#c678dd');
          grad.addColorStop(1, '#56b6c2');

          fftCtx.fillStyle = grad;
          fftCtx.beginPath();
          fftCtx.moveTo(0, h);

          const stepX = 2;
          for (let x = 0; x <= w; x += stepX) {
            const f = Math.pow(10, minLog + (x / w) * logRange);
            const binIdx = Math.min(binCount - 1, Math.max(0, (f / nyquist) * binCount));
            const idxLow = Math.floor(binIdx);
            const idxHigh = Math.min(binCount - 1, idxLow + 1);
            const frac = binIdx - idxLow;
            const amp = (freqData[idxLow] * (1 - frac) + freqData[idxHigh] * frac) / 255.0;

            const barH = amp * (h - 4);
            fftCtx.lineTo(x, h - barH);
          }

          fftCtx.lineTo(w, h);
          fftCtx.closePath();
          fftCtx.globalAlpha = 0.85;
          fftCtx.fill();
          fftCtx.globalAlpha = 1.0;
        }
      }

      // ─────────────────────────────────────────────────────────────
      // SCREEN 2: REAL-TIME TIME-DOMAIN OSCILLOSCOPE (ADJUSTABLE TIMEBASE)
      // ─────────────────────────────────────────────────────────────
      if (waveCanvas && waveCtx) {
        const w = waveCanvas.width;
        const h = waveCanvas.height;
        waveCtx.clearRect(0, 0, w, h);

        // Dark Screen Background
        waveCtx.fillStyle = 'rgba(10, 12, 16, 0.95)';
        waveCtx.fillRect(0, 0, w, h);

        // CRT Scope Voltage Grids
        waveCtx.save();
        waveCtx.setLineDash([2, 3]);
        waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        waveCtx.lineWidth = 1;

        // Vertical Grids (4 Divisions)
        for (let i = 1; i < 4; i++) {
          const gx = (w / 4) * i;
          waveCtx.beginPath();
          waveCtx.moveTo(gx, 0);
          waveCtx.lineTo(gx, h);
          waveCtx.stroke();
        }

        // Center Baseline & Voltage Rails
        waveCtx.beginPath();
        waveCtx.moveTo(0, h / 2);
        waveCtx.lineTo(w, h / 2);
        waveCtx.moveTo(0, h * 0.2);
        waveCtx.lineTo(w, h * 0.2);
        waveCtx.moveTo(0, h * 0.8);
        waveCtx.lineTo(w, h * 0.8);
        waveCtx.stroke();
        waveCtx.restore();

        if (timeData && !isMuted) {
          // Determine sample window span based on selected timeBase
          let windowSize = 256;
          if (timeBase === '0.25x') windowSize = 64;
          else if (timeBase === '0.5x') windowSize = 128;
          else if (timeBase === '1x') windowSize = 256;
          else if (timeBase === '2x') windowSize = 512;
          else if (timeBase === '4x') windowSize = 1024;
          else if (timeBase === '8x') windowSize = 2048;
          else if (timeBase === '16x') windowSize = 4096;

          windowSize = Math.min(timeData.length, windowSize);

          // Zero-Crossing Trigger Search for Rock-Solid Stability
          let startIdx = 0;
          const maxSearch = Math.min(256, timeData.length - windowSize);
          for (let i = 0; i < maxSearch; i++) {
            if (timeData[i] < 128 && timeData[i + 1] >= 128) {
              startIdx = i;
              break;
            }
          }

          waveCtx.save();
          waveCtx.strokeStyle = '#98c379';
          waveCtx.lineWidth = 1.6;
          waveCtx.shadowColor = '#98c379';
          waveCtx.shadowBlur = 3;
          waveCtx.beginPath();

          const vGain = 2.5; // Vertical amplification for visible waveform
          for (let i = 0; i < windowSize; i++) {
            const raw = timeData[startIdx + i];
            const normalized = ((raw !== undefined ? raw : 128) - 128) / 128.0; // -1 to +1
            const amplified = Math.max(-1, Math.min(1, normalized * vGain)); // clamp after gain
            const y = (1 - amplified) * h / 2; // map to canvas: center=h/2, top=0, bottom=h
            const x = (i / (windowSize - 1)) * w;
            if (i === 0) waveCtx.moveTo(x, y);
            else waveCtx.lineTo(x, y);
          }

          waveCtx.stroke();
          waveCtx.restore();
        } else {
          waveCtx.strokeStyle = 'rgba(152, 195, 121, 0.4)';
          waveCtx.lineWidth = 1;
          waveCtx.beginPath();
          waveCtx.moveTo(0, h / 2);
          waveCtx.lineTo(w, h / 2);
          waveCtx.stroke();
        }
      }

      // ─────────────────────────────────────────────────────────────
      // SCREEN 3: RMS LOUDNESS METER / HISTORY GRAPH
      // ─────────────────────────────────────────────────────────────
      const loudCanvas = loudnessCanvasRef.current;
      const loudCtx = loudCanvas?.getContext('2d');
      if (loudCanvas && loudCtx) {
        const w = loudCanvas.width;
        const h = loudCanvas.height;
        loudCtx.clearRect(0, 0, w, h);

        loudCtx.fillStyle = 'rgba(10, 12, 16, 0.95)';
        loudCtx.fillRect(0, 0, w, h);

        let sum = 0;
        if (timeData && !isMuted) {
          for (let i = 0; i < timeData.length; i++) {
            const val = (timeData[i] - 128) / 128;
            sum += val * val;
          }
        }
        const rms = Math.sqrt(sum / (timeData?.length || 1));
        const db = isMuted ? -100 : (rms > 0 ? 20 * Math.log10(rms) : -100);
        
        loudnessHistory.push(db);
        if (loudnessHistory.length > w) loudnessHistory.shift();

        // Draw -12dB, -6dB, 0dB lines
        loudCtx.save();
        loudCtx.setLineDash([2, 3]);
        loudCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        loudCtx.lineWidth = 1;
        
        const mapDbToY = (val: number) => {
          const maxDb = 6;
          const minDb = -60;
          return h - Math.max(0, Math.min(1, (val - minDb) / (maxDb - minDb))) * h;
        };

        const y0 = mapDbToY(0);
        const y6 = mapDbToY(-6);
        const y12 = mapDbToY(-12);
        
        for (const y of [y0, y6, y12]) {
          loudCtx.beginPath();
          loudCtx.moveTo(0, y);
          loudCtx.lineTo(w, y);
          loudCtx.stroke();
        }
        loudCtx.restore();

        loudCtx.font = '7px monospace';
        loudCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        loudCtx.fillText('0dB', 2, y0 - 2);
        loudCtx.fillText('-6', 2, y6 - 2);
        loudCtx.fillText('-12', 2, y12 - 2);

        loudCtx.beginPath();
        for (let i = 0; i < loudnessHistory.length; i++) {
          const x = i;
          const y = mapDbToY(loudnessHistory[i]);
          if (i === 0) loudCtx.moveTo(x, y);
          else loudCtx.lineTo(x, y);
        }
        
        loudCtx.strokeStyle = '#e06c75';
        loudCtx.lineWidth = 1.5;
        loudCtx.stroke();
        
        // Fill gradient below line
        const grad = loudCtx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(224, 108, 117, 0.6)');
        grad.addColorStop(1, 'rgba(224, 108, 117, 0.0)');
        
        loudCtx.lineTo(w, h);
        loudCtx.lineTo(0, h);
        loudCtx.fillStyle = grad;
        loudCtx.fill();
        
        // Draw Peak VU Bar on the right
        const curDb = loudnessHistory[loudnessHistory.length - 1];
        const barH = h - mapDbToY(curDb);
        loudCtx.fillStyle = curDb > 0 ? 'rgba(255, 0, 0, 0.8)' : 'rgba(152, 195, 121, 0.8)';
        loudCtx.fillRect(w - 6, h - barH, 6, barH);
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [activeTab, isMuted, theme, timeBase]);

  // Theme palettes (Rich Multi-Color Matte)
  const themeStyles = {
    'tokyo-matte': {
      bg: 'bg-[#16171d]',
      text: 'text-[#d8dee9]',
      border: 'border-[#2e3440]',
      headerBg: 'bg-[#1e222b]',
      cardBg: 'bg-[#1b1d24]',
      cursorColor: '#56b6c2',
      accentColor: '#56b6c2',
    },
    'gruvbox-dark': {
      bg: 'bg-[#1d2021]',
      text: 'text-[#ebdbb2]',
      border: 'border-[#3c3836]',
      headerBg: 'bg-[#282828]',
      cardBg: 'bg-[#242728]',
      cursorColor: '#fabd2f',
      accentColor: '#fabd2f',
    },
    'nord-terminal': {
      bg: 'bg-[#1e222a]',
      text: 'text-[#eceff4]',
      border: 'border-[#3b4252]',
      headerBg: 'bg-[#2e3440]',
      cardBg: 'bg-[#242933]',
      cursorColor: '#88c0d0',
      accentColor: '#88c0d0',
    },
    'cyber-amber': {
      bg: 'bg-[#14120e]',
      text: 'text-[#e5be7a]',
      border: 'border-[#3d311c]',
      headerBg: 'bg-[#261f12]',
      cardBg: 'bg-[#1c1710]',
      cursorColor: '#e5be7a',
      accentColor: '#ffd166',
    },
  }[theme];

  const renderProgressBar = (pct: number, color: string) => {
    const totalBlocks = 12;
    const filledBlocks = Math.round((pct / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    return (
      <span className="font-mono text-xs sm:text-sm tracking-tighter" style={{ color }}>
        {'■'.repeat(filledBlocks)}
        <span className="opacity-25">{'·'.repeat(emptyBlocks)}</span>
      </span>
    );
  };

  const renderBrailleSpark = (offset: number) => {
    return BRAILLE_WAVES.map((_, i) => BRAILLE_WAVES[(i + pulseStep + offset) % BRAILLE_WAVES.length]).join('');
  };

  const currentTrack = tracksState[activeTrackId] || tracksState[0];

  const visibleTracks: VisibleTrackItem[] = useMemo(() => {
    if (isOverlayMode) {
      return tracksState
        .filter((trk) => overlayTrackIds.includes(trk.id))
        .map((trk) => ({
          id: trk.id,
          color: trk.color,
          grid: trk.grid,
          isPrimary: trk.id === activeTrackId,
        }));
    }
    return [
      {
        id: currentTrack.id,
        color: currentTrack.color,
        grid: currentTrack.grid,
        isPrimary: true,
      },
    ];
  }, [isOverlayMode, overlayTrackIds, tracksState, activeTrackId, currentTrack]);

  return (
    <div className={`w-full min-h-screen font-mono text-sm sm:text-base ${themeStyles.bg} ${themeStyles.text} flex flex-col justify-between select-none p-1.5 sm:p-3 md:p-4 transition-colors duration-200`}>
      
      {/* 1. TOP STATUS BAR */}
      <header className={`w-full max-w-full ${themeStyles.headerBg} px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between font-bold text-xs sm:text-sm tracking-wider border ${themeStyles.border} rounded-t-sm mb-1.5 sm:mb-2 gap-1.5`}>
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1">
          <span className="bg-black/40 px-2 sm:px-2.5 py-1 rounded text-xs sm:text-sm text-[#56b6c2] flex items-center gap-1.5 shrink-0">
            <span className="text-[#e5c07b] font-mono">{SPINNER_FRAMES[spinnerFrame]}</span>
            <span>[tmux:edge]</span>
          </span>

          <button onClick={() => { navigateToTab(0); playSound('click'); }} title="View 0: Cluster — Global Multi-Worker Infrastructure & Quick Launchpad [Hotkey: 0]" className={`px-2 sm:px-3 py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 ${activeTab === 0 ? 'bg-[#56b6c2] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>0:cluster</button>
          <button onClick={() => { navigateToTab(1); playSound('click'); }} title="View 1: Modules — Technical System Specifications & Architecture Deep Dives [Hotkey: 1]" className={`px-2 sm:px-3 py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 ${activeTab === 1 ? 'bg-[#e5c07b] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>1:modules</button>
          <button onClick={() => { navigateToTab(2); playSound('click'); }} title="View 2: Topology — Cloudflare Global Edge Anycast PoPs & Routing Map [Hotkey: 2]" className={`px-2 sm:px-3 py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 ${activeTab === 2 ? 'bg-[#98c379] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>2:topology</button>
          <button onClick={() => { navigateToTab(3); playSound('click'); }} title="View 3: Guestbook — Distributed Edge Packet Messenger [Hotkey: 3]" className={`px-2 sm:px-3 py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 ${activeTab === 3 ? 'bg-[#e06c75] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>3:guestbook</button>
          <button onClick={() => { navigateToTab(4); playSound('click'); }} title="View 4: Synth — 8-Track WebAudio Modular Synthesizer & Sequencer [Hotkey: 4]" className={`px-2 sm:px-3 py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 ${activeTab === 4 ? 'bg-[#c678dd] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>4:synth</button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 text-xs sm:text-sm pl-1">
          <span className="text-[#c678dd] hidden xl:inline font-mono">{renderBrailleSpark(0)}</span>
                    <button
            onClick={() => {
              const m = sound.toggleMute();
              setIsMuted(m);
              if (!m) playSound('click');
            }}
            title="Master Audio Output Toggle — Mute or Unmute all WebAudio sound generation" className={`px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-black border ${
              isMuted
                ? 'border-[#e06c75] text-[#e06c75] hover:bg-[#e06c75] hover:text-black'
                : 'border-[#98c379] text-[#98c379] hover:bg-[#98c379] hover:text-black'
            }`}
          >
            {isMuted ? '[UNMUTE]' : '[MUTE]'}
          </button>
          <button onClick={cycleTheme} title="Color Theme Switcher — Cycle palette (Tokyo Matte, Gruvbox Dark, Nord Terminal, Cyber Amber) [Hotkey: T]" className="hover:underline cursor-pointer hidden sm:inline text-[#e5c07b]">[THEME: {theme.toUpperCase()}]</button>
          <span title="Real-Time System Clock — Australian Eastern Standard Time (Sydney Edge Node UTC+10)" className="tabular-nums text-[#98c379] shrink-0 text-[11px] sm:text-xs">SYDNEY {sydneyTime || '12:14:00'}</span>
          <span title="Architecture Status — 100% Serverless Edge execution without dedicated backend origin servers" className="bg-black/40 px-2 py-0.5 text-[#56b6c2] hidden lg:inline">100%_SERVERLESS</span>
        </div>
      </header>

      {/* 2. MAIN MULTI-PANE WORKSPACE */}
      <div className="grid grid-cols-12 gap-1.5 sm:gap-2 flex-1 min-h-0 w-full max-w-full">
        
        {/* LEFT PANE: IDENTITY, TELEMETRY & SYSTEM RADAR (4 Cols, Scrollable without Content Collision) */}
        <div className={`col-span-12 lg:col-span-3 xl:col-span-3 border ${themeStyles.border} p-2 sm:p-2.5 flex flex-col gap-2 ${themeStyles.cardBg} rounded-sm min-h-0 max-w-full overflow-y-auto custom-scrollbar`}>
          
          {/* 1. ASCII BRAND & ACRONYM BREAKDOWN */}
          <div className="border border-white/15 p-2 bg-black/40 rounded-xs shrink-0 space-y-1.5 max-w-full overflow-hidden">
            <div className="text-xs sm:text-sm font-bold text-[#56b6c2] flex items-center justify-between border-b border-white/10 pb-0.5">
              <span>┌─[ SYS_BANNER // KRSZ.IN ]─┐</span>
              <span className="text-[#98c379] font-mono text-xs flex items-center gap-1">
                <span>{SPINNER_FRAMES[(spinnerFrame + 3) % 10]} RUNNING</span>
              </span>
            </div>
            
            <pre className="text-[8px] sm:text-xs leading-none font-black tracking-tight text-[#e5c07b] overflow-x-auto select-none py-0.5">
{` ██╗  ██╗██████╗ ███████╗███████╗
 ██║ ██╔╝██╔══██╗██╔════╝╚══███╔╝
 █████╔╝ ██████╔╝███████╗  ███╔╝ 
 ██╔═██╗ ██╔══██╗╚════██║ ███╔╝  
 ██║  ██╗██║  ██║███████║███████╗
 ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝`}
            </pre>

            <div className="grid grid-cols-2 gap-1 text-xs border-t border-white/10 pt-1.5 font-mono">
              <div className="flex items-center gap-1.5"><span className="bg-[#e06c75] text-black px-1 py-0.2 rounded-xs font-bold text-xs">[K]</span><span className="text-[#e06c75] font-bold">urashizu's</span></div>
              <div className="flex items-center gap-1.5"><span className="bg-[#61afef] text-black px-1 py-0.2 rounded-xs font-bold text-xs">[R]</span><span className="text-[#61afef] font-bold">andom-</span></div>
              <div className="flex items-center gap-1.5"><span className="bg-[#e5c07b] text-black px-1 py-0.2 rounded-xs font-bold text-xs">[S]</span><span className="text-[#e5c07b] font-bold">tuff</span></div>
              <div className="flex items-center gap-1.5"><span className="bg-[#98c379] text-black px-1 py-0.2 rounded-xs font-bold text-xs">[Z]</span><span className="text-[#98c379] font-bold">one.</span></div>
            </div>
          </div>

          {/* 2. REAL-TIME EDGE TELEMETRY & ISOLATE METRICS */}
          <div className="border border-white/15 p-2.5 sm:p-3 bg-black/40 rounded-xs shrink-0 flex flex-col gap-1 text-xs sm:text-sm font-mono max-w-full overflow-hidden">
            <div className="text-xs sm:text-sm font-bold text-[#98c379] flex items-center justify-between border-b border-white/10 pb-1 shrink-0">
              <span>┌─[ EDGE_TELEMETRY ]─┐</span>
              <span className="text-white/50 text-xs font-mono">{sydneyTime} AEST</span>
            </div>
            
            <div className="space-y-1.5 py-1 text-xs sm:text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/70 font-semibold">V8 ISOLATE RAM:</span>
                <span className="text-[#56b6c2] font-bold flex items-center gap-1.5">
                  {renderProgressBar(32, '#56b6c2')}
                  <span>34MB / 128MB</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70 font-semibold">AUDIO DSP LOAD:</span>
                <span className="text-[#98c379] font-bold flex items-center gap-1.5">
                  {renderProgressBar(18, '#98c379')}
                  <span>1.8% CPU</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70 font-semibold">EDGE ANYCAST:</span>
                <span className="text-[#e5c07b] font-bold bg-[#e5c07b]/10 border border-[#e5c07b]/30 px-1.5 py-0.5 rounded-xs">
                  SYD / NRT [0.38ms]
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70 font-semibold">SIGNAL CARRIER:</span>
                <span className="text-[#c678dd] font-bold tracking-widest text-xs sm:text-sm">{renderBrailleSpark(0)}</span>
              </div>
            </div>

            <div className="border-t border-white/10 pt-1 text-[11px] sm:text-xs text-white/50 flex flex-wrap items-center justify-between gap-1 shrink-0 font-mono">
              <span>REGION: AP-SOUTHEAST-2 (SYD)</span>
              <span>ISOLATE: #4902-ACTIVE</span>
            </div>
          </div>

          {/* 3. OPERATOR SPECS & PHILOSOPHY (CLEAN & NON-OVERLAPPING) */}
          <div className="border border-white/15 p-2.5 sm:p-3 bg-black/40 rounded-xs shrink-0 flex flex-col gap-1 text-xs sm:text-sm font-mono max-w-full overflow-hidden">
            <div className="text-xs sm:text-sm font-bold text-[#61afef] flex items-center justify-between border-b border-white/10 pb-1 shrink-0">
              <span>┌─[ OPERATOR_PROFILE ]─┐</span>
              <span className="text-xs text-[#98c379] font-bold border border-[#98c379]/40 bg-[#98c379]/15 px-1.5 py-0.2 rounded-xs">VERIFIED</span>
            </div>
            <div className="space-y-1.5 py-1 text-xs sm:text-sm leading-relaxed">
              <div className="flex items-baseline gap-2">
                <span className="text-[#e5c07b] font-bold shrink-0">[OPERATOR]</span>
                <span className="text-[#eceff4] font-medium">kurashizu (IT Masters @ UNSW)</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[#61afef] font-bold shrink-0">[LOCATION]</span>
                <span className="text-[#eceff4]">Sydney, Australia [UTC+10/11]</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[#e06c75] font-bold shrink-0">[MOTTO]</span>
                <span className="text-[#eceff4] italic">"Follow best practices &amp; KISS"</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[#98c379] font-bold shrink-0">[RUNTIME]</span>
                <span className="text-[#eceff4]">100% Serverless Edge Isolates</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[#56b6c2] font-bold shrink-0">[STACK]</span>
                <span className="text-[#eceff4]">SvelteKit · uv · FFmpeg · D1 · Vectorize</span>
              </div>
            </div>
            <div className="border-t border-white/10 pt-1 text-[11px] sm:text-xs text-[#98c379] shrink-0 font-bold flex flex-wrap items-center justify-between gap-1">
              <span>STATUS: OPEN FOR RESEARCH</span>
              <span>AVAILABLE NOW</span>
            </div>
          </div>

          {/* 4. INTERACTIVE HOTKEYS QUICK-SWITCH PANEL (TACTILE SQUARE LAUNCHPAD TILES) */}
          <div className="border border-white/15 p-2 bg-black/40 rounded-xs shrink-0 flex flex-col gap-1 text-xs font-mono">
            <div className="text-xs font-bold text-[#e5c07b] flex items-center justify-between border-b border-white/10 pb-0.5 shrink-0">
              <span>┌─[ QUICK_HOTKEYS // LAUNCHPAD ]─┐</span>
              <span className="text-white/50 text-xs">[0-4, T]</span>
            </div>

            {/* 3x2 Tactile Square Launchpad Grid */}
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {[
                { id: 0, key: '0', title: 'OVERVIEW', desc: 'Cluster', color: '#56b6c2', icon: '⊞', tooltip: '0: Overview — Global Multi-Worker Cluster Status [Hotkey: 0]' },
                { id: 1, key: '1', title: 'MODULES', desc: 'Specs', color: '#e5c07b', icon: '◈', tooltip: '1: Modules — Architecture Specifications & Subdomains [Hotkey: 1]' },
                { id: 2, key: '2', title: 'TOPOLOGY', desc: 'Edge PoP', color: '#98c379', icon: '☊', tooltip: '2: Topology — Cloudflare Edge PoP Network & Anycast Routing [Hotkey: 2]' },
                { id: 3, key: '3', title: 'GUESTBOOK', desc: 'Packets', color: '#e06c75', icon: '✉', tooltip: '3: Guestbook — Send message packets across edge workers [Hotkey: 3]' },
                { id: 4, key: '4', title: 'SYNTH', desc: 'WebAudio', color: '#c678dd', icon: '♫', tooltip: '4: Synth — 8-Track Modular Synthesizer Workstation [Hotkey: 4]' },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { navigateToTab(tab.id); playSound('click'); }}
                    title={tab.tooltip} className={`border rounded-xs p-1.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all active:scale-95 group relative overflow-hidden ${
                      isActive
                        ? 'border-white bg-white/20 text-white shadow-md'
                        : 'border-white/15 bg-black/30 hover:border-white/40 hover:bg-white/5'
                    }`}
                    style={{ borderColor: isActive ? tab.color : undefined }}
                  >
                    {/* Top row: Keycap + Icon */}
                    <div className="w-full flex items-center justify-between">
                      <span
                        className="px-1 py-0.2 rounded-xs font-mono font-bold text-xs border"
                        style={{
                          backgroundColor: isActive ? tab.color : 'rgba(0,0,0,0.5)',
                          color: isActive ? '#000' : tab.color,
                          borderColor: tab.color,
                        }}
                      >
                        [{tab.key}]
                      </span>
                      <span className="text-xs opacity-75 group-hover:opacity-100" style={{ color: tab.color }}>
                        {tab.icon}
                      </span>
                    </div>

                    {/* Bottom: Title & subtitle */}
                    <div className="mt-1">
                      <div className="font-bold text-xs leading-tight tracking-tight" style={{ color: isActive ? '#fff' : tab.color }}>
                        {tab.title}
                      </div>
                      <div className="text-xs opacity-60 font-mono">{tab.desc}</div>
                    </div>
                  </button>
                );
              })}

              {/* Theme Cycle Square Tile */}
              <button
                onClick={cycleTheme}
                className="border border-white/15 bg-black/30 hover:border-white/40 hover:bg-white/5 rounded-xs p-1.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all active:scale-95 group"
              >
                <div className="w-full flex items-center justify-between">
                  <span className="px-1 py-0.2 rounded-xs font-mono font-bold text-xs border border-[#d8dee9]/40 bg-black/50 text-[#d8dee9]">
                    [T]
                  </span>
                  <span className="text-xs text-[#e5c07b] group-hover:rotate-45 transition-transform">◐</span>
                </div>
                <div className="mt-1">
                  <div className="font-bold text-xs text-[#d8dee9] leading-tight">THEME</div>
                  <div className="text-xs opacity-60 font-mono uppercase">{theme.split('-')[0]}</div>
                </div>
              </button>
            </div>

            <div className="border-t border-white/10 pt-1 text-xs text-white/50 flex justify-between shrink-0 font-mono">
              <span>PADS: 6 ACTIVE NODES</span>
              <span>HOTKEY [0-4, T]</span>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: ACTIVE WORKBENCH WINDOW (8 Cols) */}
        <div className={`col-span-12 lg:col-span-9 xl:col-span-9 border ${themeStyles.border} ${activeTab === 4 ? 'p-2 sm:p-3 space-y-1.5' : 'p-2.5 sm:p-3.5 space-y-2'} flex flex-col justify-between ${themeStyles.cardBg} rounded-sm min-h-0 overflow-y-auto custom-scrollbar`}>
          
          {/* TAB 0: CLUSTER OVERVIEW */}
          {activeTab === 0 && (
            <div className="space-y-3 sm:space-y-4 flex-1">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <pre className="text-[7px] sm:text-[10px] md:text-xs font-black tracking-tight text-[#56b6c2] leading-tight overflow-x-auto select-none">
{`██████╗██╗     ██╗   ██╗███████╗████████╗███████╗██████╗ 
██╔════╝██║     ██║   ██║██╔════╝╚══██╔══╝██╔════╝██╔══██╗
██║     ██║     ██║   ██║███████╗   ██║   █████╗  ██████╔╝
██║     ██║     ██║   ██║╚════██║   ██║   ██╔══╝  ██╔══██╗
╚██████╗███████╗╚██████╔╝███████║   ██║   ███████╗██║  ██║
 ╚═════╝╚══════╝ ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝`}
                </pre>
                <span className="text-xs sm:text-sm text-[#98c379] flex items-center gap-1.5 shrink-0">
                  <span>{SPINNER_FRAMES[spinnerFrame]}</span>
                  <span>V8_HEALTH: OPTIMAL</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {MODULES.map((m) => {
                  const isHovered = hoveredCard === m.id;
                  return (
                    <div
                      key={m.id}
                      onMouseEnter={() => { setHoveredCard(m.id); playSound('hover'); }}
                      onMouseLeave={() => setHoveredCard(null)}
                      onClick={() => { setSelectedModule(m); navigateToTab(1); playSound('click'); }}
                      title={`Inspect ${m.name} (${m.tag}) — View technical architecture, live metrics, and endpoints`} style={{ backgroundColor: m.bgTint, borderColor: m.borderColor }}
                      className="border p-3.5 rounded-xs cursor-pointer transition-all hover:scale-[1.015] hover:brightness-110 flex flex-col justify-between h-40 group relative overflow-hidden"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold text-xs sm:text-sm" style={{ color: m.color }}>[{m.badge}]</span>
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-black/40 text-[#eceff4] font-mono">{isHovered ? SPINNER_FRAMES[spinnerFrame] + ' ' + m.tag : m.tag}</span>
                        </div>
                        <div className="font-bold text-sm sm:text-base group-hover:underline flex items-center gap-2 text-[#eceff4]">
                          {m.id === 'blog' && <PixelBlog size={18} />}
                          {m.id === 'agent' && <PixelAgent size={18} />}
                          {m.id === 'share' && <PixelVault size={18} />}
                          {m.id === 'sharetube' && <PixelVideo size={18} />}
                          {m.id === 'mail' && <PixelMail size={18} />}
                          {m.id === 'skill' && <PixelRules size={18} />}
                          <span style={{ color: m.color }}>{m.name}</span>
                        </div>
                        <p className="text-xs opacity-80 line-clamp-2 mt-1.5 leading-snug">{m.desc}</p>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                        <span className="text-xs opacity-90">{m.metrics[0].label}: {m.metrics[0].value}</span>
                        <span className="font-bold text-xs flex items-center gap-1" style={{ color: m.color }}><span>INSPECT</span><span>{'->'}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border border-white/10 p-3.5 bg-black/30 font-mono text-xs sm:text-sm leading-relaxed rounded-xs max-w-full overflow-hidden">
                <div className="font-bold text-xs text-[#e5c07b] mb-1 flex items-center justify-between border-b border-white/10 pb-0.5">
                  <span>┌─[ ANYCAST PIPELINE MAP ]─┐</span>
                </div>
                <pre className="text-xs sm:text-sm text-[#d8dee9] opacity-90 overflow-x-auto whitespace-pre max-w-full">
{`CLIENT ──> ANYCAST CDN ──> CF WORKERS (V8) ──> [ D1 SQL | VECTORIZE | R2 | KV ]
                               ▲                     │
GITHUB ACTIONS (CI RUNNER) ────┘                     ▼
ORACLE VPS (STATIC EGRESS) ──────────────────> GEMINI 768-D EMBEDDINGS`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 1: MODULES SPEC INSPECTOR */}
          {activeTab === 1 && (
            <div className="space-y-3 sm:space-y-4 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                <pre className="text-[7px] sm:text-[10px] md:text-xs font-black tracking-tight text-[#e5c07b] leading-tight overflow-x-auto select-none">
{`███╗   ███╗ ██████╗ ██████╗ ██╗   ██╗██╗     ███████╗███████╗
████╗ ████║██╔═══██╗██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
██╔████╔██║██║   ██║██║  ██║██║   ██║██║     █████╗  ███████╗
██║╚██╔╝██║██║   ██║██║  ██║██║   ██║██║     ██╔══╝  ╚════██║
██║ ╚═╝ ██║╚██████╔╝██████╔╝╚██████╔╝███████╗███████╗███████║
╚═╝     ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝╚══════╝╚══════╝`}
                </pre>
                <div className="flex items-center gap-1.5 text-xs sm:text-sm overflow-x-auto no-scrollbar">
                  {MODULES.map((m) => (
                    <button key={m.id} onClick={() => { setSelectedModule(m); playSound('click'); }} title={`Inspect Module: ${m.name} (${m.tag})`} className={`px-2.5 py-1 border rounded-xs cursor-pointer transition-colors ${selectedModule.id === m.id ? 'border-white bg-white/20 text-white font-bold' : 'border-white/20 hover:border-white/60 opacity-70'}`} style={{ color: selectedModule.id === m.id ? m.color : undefined }}>{m.id}</button>
                  ))}
                </div>
              </div>

              <div style={{ backgroundColor: selectedModule.bgTint, borderColor: selectedModule.borderColor }} className="border p-3.5 sm:p-5 rounded-sm space-y-3 sm:space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs opacity-70 font-bold" style={{ color: selectedModule.color }}>NODE_ID // {selectedModule.badge}</span>
                    <h3 className="text-base sm:text-xl font-bold flex items-center gap-2 mt-0.5">
                      <span style={{ color: selectedModule.color }}>{selectedModule.name}</span>
                      <span className="text-xs font-normal border border-current px-2 py-0.5 rounded-xs">{selectedModule.tag}</span>
                    </h3>
                  </div>
                  <a href={selectedModule.url} target="_blank" rel="noopener noreferrer" onClick={() => playSound('click')} title={`Launch ${selectedModule.url} in a new tab`} style={{ backgroundColor: selectedModule.color }} className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xs text-black font-bold text-xs sm:text-sm flex items-center gap-1.5 hover:opacity-90 transition-opacity shrink-0">
                    <span>LAUNCH</span>
                    <PixelArrowUpRight size={16} />
                  </a>
                </div>
                <p className="text-xs sm:text-base leading-relaxed text-[#eceff4]">{selectedModule.desc}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-xs sm:text-sm">
                  {selectedModule.metrics.map((m, i) => (
                    <div key={i} className="border border-white/10 p-2.5 sm:p-3 bg-black/40 rounded-xs">
                      <div className="text-xs opacity-70 uppercase font-bold">{m.label}</div>
                      <div className="font-bold text-sm sm:text-base mt-0.5" style={{ color: selectedModule.color }}>{m.value}</div>
                      <div className="mt-1">{renderProgressBar(m.pct, selectedModule.color)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SYSTEM TOPOLOGY */}
          {activeTab === 2 && (
            <div className="space-y-3 sm:space-y-3.5 flex-1">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <pre className="text-[7px] sm:text-[10px] md:text-xs font-black tracking-tight text-[#98c379] leading-tight overflow-x-auto select-none">
{`████████╗ ██████╗ ██████╗  ██████╗ ██╗      ██████╗  ██████╗ ██╗   ██╗
╚══██╔══╝██╔═══██╗██╔══██╗██╔═══██╗██║     ██╔═══██╗██╔════╝ ╚██╗ ██╔╝
   ██║   ██║   ██║██████╔╝██║   ██║██║     ██║   ██║██║  ███╗ ╚████╔╝ 
   ██║   ██║   ██║██╔═══╝ ██║   ██║██║     ██║   ██║██║   ██║  ╚██╔╝  
   ██║   ╚██████╔╝██║     ╚██████╔╝███████╗╚██████╔╝╚██████╔╝   ██║   
   ╚═╝    ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝    ╚═╝   `}
                </pre>
                <span className="text-xs sm:text-sm text-[#56b6c2] flex items-center gap-1.5 shrink-0">
                  <span>PULSE:</span><span className="text-[#e5c07b] font-mono">{renderBrailleSpark(4)}</span>
                </span>
              </div>

              <div className="border border-[#98c379]/30 p-2.5 sm:p-4 bg-black/40 overflow-x-auto font-mono text-[10px] sm:text-xs md:text-sm leading-tight rounded-xs">
                <pre className="text-[#eceff4] whitespace-pre">
{`┌────────────────────────┐         ┌─────────────────────────────────────┐
│  CLIENT HTTP/3 (0-RTT) │────────>│     CLOUDFLARE WORKERS V8 ENGINE    │
└────────────────────────┘         │  • 0ms Cold Start Isolate Cluster   │
            ▲                      │  • TypeScript 5.7 Strict Execution  │
            │                      └─────────────────────────────────────┘
┌────────────────────────┐                            │
│  ORACLE CLOUD VPS      │ (Static Tunnel Proxy)      │ (Direct Edge Bindings)
│  • Fixed IPv4 Egress   │────────────────────────────┤
│  • WireGuard Gateway   │                            ▼
└────────────────────────┘         ┌─────────────────────────────────────┐
            ▲                      │        STORAGE & STATE TIER         │
            │                      │  • D1 SQL: posts, news, repos, audit│
┌────────────────────────┐         │  • Vectorize: 768-D HNSW Index      │
│  GITHUB ACTIONS RUNNER │         │  • KV: Session Rate Limiter Cache   │
│  • Multi-Worker CI/CD  │────────>│  • R2: Zero-Egress Storage Vault    │
│  • Scheduled Ingest    │         └─────────────────────────────────────┘
└────────────────────────┘                            │
                                                      ▼
                                   ┌─────────────────────────────────────┐
                                   │        AI & INFERENCE ENGINE        │
                                   │  • Gemini Embedding 2 (768 Dims)    │
                                   │  • Gemma-4-31B / Gemini Tools       │
                                   └─────────────────────────────────────┘`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: GUESTBOOK */}
          {activeTab === 3 && (
            <div className="space-y-3 sm:space-y-3.5 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                <pre className="text-[7px] sm:text-[10px] md:text-xs font-black tracking-tight text-[#e06c75] leading-tight overflow-x-auto select-none">
{` ██████╗ ██╗   ██╗███████╗███████╗████████╗██████╗  ██████╗  ██████╗ ██╗  ██╗
██╔════╝ ██║   ██║██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗██╔═══██╗██║ ██╔╝
██║  ███╗██║   ██║█████╗  ███████╗   ██║   ██████╔╝██║   ██║██║   ██║█████╔╝ 
██║   ██║██║   ██║██╔══╝  ╚════██║   ██║   ██╔══██╗██║   ██║██║   ██║██╔═██╗ 
╚██████╔╝╚██████╔╝███████╗███████║   ██║   ██████╔╝╚██████╔╝╚██████╔╝██║  ██╗
 ╚═════╝  ╚═════╝ ╚══════╝╚══════╝   ╚═╝   ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝`}
                </pre>
                <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm shrink-0">
                  <button onClick={() => handleCopy('krsz.dev@gmail.com')} className="border border-[#e06c75] px-2 py-0.5 rounded-xs text-[#e06c75] hover:bg-[#e06c75] hover:text-black cursor-pointer transition-colors">[krsz.dev@gmail.com]</button>
                  <button onClick={() => handleCopy('admin@krsz.in')} className="border border-[#e06c75] px-2 py-0.5 rounded-xs text-[#e06c75] hover:bg-[#e06c75] hover:text-black cursor-pointer transition-colors">[admin@krsz.in]</button>
                </div>
              </div>

              <form onSubmit={handleGuestbookSubmit} className="border border-white/10 p-4 bg-black/30 space-y-3.5 text-xs sm:text-sm rounded-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-[#56b6c2]">CALLSIGN / NAME</label>
                    <div className="relative border border-white/20 focus-within:border-[#56b6c2] bg-black/60 px-3 py-2 rounded-xs flex items-center min-h-[40px]">
                      <span className="font-mono text-sm text-[#eceff4] whitespace-pre">{gbName}</span>
                      {gbFocusedField === 'name' && <span className="inline-block w-[8px] h-[16px] ml-0.5 align-middle shrink-0" style={{ backgroundColor: themeStyles.cursorColor, opacity: pulseStep % 6 < 4 ? 0.9 : 0.2 }} />}
                      {!gbName && gbFocusedField !== 'name' && <span className="text-xs opacity-40 select-none pointer-events-none">e.g. Satoshi</span>}
                      <input type="text" required value={gbName} onFocus={() => setGbFocusedField('name')} onBlur={() => setGbFocusedField(null)} onChange={(e) => setGbName(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-text outline-none font-mono z-10" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-[#e5c07b]">CONTACT EMAIL</label>
                    <div className="relative border border-white/20 focus-within:border-[#e5c07b] bg-black/60 px-3 py-2 rounded-xs flex items-center min-h-[40px]">
                      <span className="font-mono text-sm text-[#eceff4] whitespace-pre">{gbEmail}</span>
                      {gbFocusedField === 'email' && <span className="inline-block w-[8px] h-[16px] ml-0.5 align-middle shrink-0" style={{ backgroundColor: themeStyles.cursorColor, opacity: pulseStep % 6 < 4 ? 0.9 : 0.2 }} />}
                      {!gbEmail && gbFocusedField !== 'email' && <span className="text-xs opacity-40 select-none pointer-events-none">e.g. dev@domain.com</span>}
                      <input type="email" required value={gbEmail} onFocus={() => setGbFocusedField('email')} onBlur={() => setGbFocusedField(null)} onChange={(e) => setGbEmail(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-text outline-none font-mono z-10" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#e06c75]">TRANSMISSION PAYLOAD</label>
                  <div className="relative border border-white/20 focus-within:border-[#e06c75] bg-black/60 p-3 rounded-xs min-h-[80px]">
                    <div className="font-mono text-sm text-[#eceff4] whitespace-pre-wrap break-words leading-relaxed">
                      {gbContent}
                      {gbFocusedField === 'content' && <span className="inline-block w-[8px] h-[16px] ml-0.5 align-middle shrink-0" style={{ backgroundColor: themeStyles.cursorColor, opacity: pulseStep % 6 < 4 ? 0.9 : 0.2 }} />}
                      {!gbContent && gbFocusedField !== 'content' && <span className="text-xs opacity-40 select-none pointer-events-none block">Enter message for the blog.krsz.in guestbook...</span>}
                    </div>
                    <textarea required rows={3} value={gbContent} onFocus={() => setGbFocusedField('content')} onBlur={() => setGbFocusedField(null)} onChange={(e) => setGbContent(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-text outline-none resize-none font-mono z-10 p-3" />
                  </div>
                </div>

                {gbStatus && <div className="border border-[#98c379] p-2.5 text-xs sm:text-sm font-bold text-[#98c379] bg-black/40 rounded-xs">{gbStatus}</div>}
                <button type="submit" className="w-full border border-[#e06c75] bg-[#e06c75] text-black font-black py-2.5 text-xs sm:text-sm uppercase hover:opacity-90 cursor-pointer rounded-xs transition-opacity">DISPATCH PACKET TO BLOG.KRSZ.IN {'->'}</button>
              </form>
            </div>
          )}

          {/* TAB 4: UNIFIED MODULAR SYNTHESIZER WORKSTATION WITH DSP FLOWCHART */}
          {activeTab === 4 && (
            <div className="space-y-1.5 flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
              
                            {/* 1. ROW 1: KRSZ SYNTH LOGO, PROJECT MANAGEMENT (NEW/SAVE/LOAD/IMP/EXP) & MASTER METRICS */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1 bg-black/40 px-2 py-1.5 rounded-xs shrink-0">
                {/* Left: KRSZ Synth Logo & Project Management */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* KRSZ Synth Logo Badge */}
                  <div className="flex items-center gap-1.5 bg-[#c678dd]/20 border border-[#c678dd]/60 px-2 py-0.5 rounded-xs mr-0.5 select-none shadow-[0_0_8px_rgba(198,120,221,0.25)]">
                    <PixelAudio className="w-3.5 h-3.5 text-[#c678dd]" />
                    <span className="font-black text-xs text-white tracking-wider">KRSZ SYNTH</span>
                  </div>

                  <input type="file" ref={fileInputRef} onChange={handleImportPatch} accept=".json" className="hidden" />

                  {/* NEW */}
                  <button
                    onClick={handleNewProject}
                    title="New Project — Clear all tracks and reset to blank 64-step sequencer"
                    className="px-2 py-0.5 border border-white/20 text-white/80 hover:border-white/60 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs"
                  >
                    NEW
                  </button>

                  {/* SAVE */}
                  <button
                    onClick={handleSavePatch}
                    title="Save Patch — Store all 8-track synth parameters and sequencer notes into browser LocalStorage"
                    className="px-2 py-0.5 border border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20 rounded-xs font-bold transition-colors cursor-pointer text-xs"
                  >
                    SAVE
                  </button>

                  {/* LOAD (LOCAL / BUILT-IN) */}
                  <div className="flex items-center border border-[#56b6c2]/50 bg-[#56b6c2]/10 rounded-xs p-0.5 gap-1">
                    <button
                      onClick={handleLoadPatch}
                      title="Load Local Patch — Restore saved synth parameters and sequencer patterns from browser LocalStorage"
                      className="px-1.5 py-0.2 text-[#56b6c2] hover:bg-[#56b6c2]/30 rounded-xs font-bold transition-colors cursor-pointer text-xs"
                    >
                      LOAD (LOCAL)
                    </button>

                    <span className="text-white/20 select-none">/</span>

                    {/* BUILT-IN with ◄ / ► Selector */}
                    <div className="flex items-center gap-0.5 text-xs">
                      <span className="text-white/60 font-bold text-[11px] pl-0.5">BUILT-IN:</span>
                      <button
                        onClick={() => {
                          const prev = (builtinSongIdx - 1 + BUILTIN_SONGS.length) % BUILTIN_SONGS.length;
                          setBuiltinSongIdx(prev);
                          handleLoadBuiltinSong(prev);
                        }}
                        className="px-1 text-[#56b6c2] hover:text-white cursor-pointer font-bold select-none"
                        title="Previous Built-in Song"
                      >
                        ◄
                      </button>
                      <button
                        onClick={() => handleLoadBuiltinSong(builtinSongIdx)}
                        className="px-1 font-bold text-white hover:text-[#56b6c2] cursor-pointer"
                        title="Load Built-in Song"
                      >
                        {BUILTIN_SONGS[builtinSongIdx].name}
                      </button>
                      <button
                        onClick={() => {
                          const next = (builtinSongIdx + 1) % BUILTIN_SONGS.length;
                          setBuiltinSongIdx(next);
                          handleLoadBuiltinSong(next);
                        }}
                        className="px-1 text-[#56b6c2] hover:text-white cursor-pointer font-bold select-none"
                        title="Next Built-in Song"
                      >
                        ►
                      </button>
                    </div>
                  </div>

                  {/* IMP */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-0.5 border border-white/20 text-white/70 hover:border-white/60 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs"
                    title="Import Patch — Load a previously exported JSON synthesizer patch file"
                  >
                    IMP
                  </button>

                  {/* EXP */}
                  <button
                    onClick={handleExportPatch}
                    className="px-2 py-0.5 border border-white/20 text-white/70 hover:border-white/60 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs"
                    title="Export Patch — Download complete 8-track synthesizer configuration and patterns as a JSON file"
                  >
                    EXP
                  </button>

                  {saveStatus && <span className="text-[#98c379] font-bold text-xs ml-1">{saveStatus}</span>}
                </div>

                {/* Right: BPM Fader + LEN (Cycle/Custom) + METER */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs ml-auto">
                  {/* Hardware BPM Fader */}
                  <div className="flex items-center gap-1">
                    <HorizontalHardwareFader
                      label="BPM:"
                      value={synthBpm}
                      min={40}
                      max={240}
                      step={1}
                      width={74}
                      showValue={true}
                      color="#98c379"
                      onChange={(val) => {
                        setSynthBpm(val);
                        modularSynth.setBpm(val);
                      }}
                    />
                  </div>

                  <div className="w-px h-4 bg-white/15 mx-1" />

                  {/* Sequence Length: Cycle Preset (16..512) OR Custom Step Input */}
                  <div className="flex items-center gap-1">
                    <span className="opacity-60 font-bold" title="Pattern Total Steps (LEN) — Total active sequence steps before looping">LEN:</span>
                    <button
                      onClick={handleCycleLen}
                      className="px-2 py-0.5 border border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20 rounded-xs font-bold font-mono cursor-pointer transition-colors flex items-center gap-1"
                      title="Cycle through step lengths: 16 → 32 → 64 → 128 → 256 → 512 → 16"
                    >
                      <span>{LEN_PRESETS.includes(totalPatternSteps as any) ? totalPatternSteps : 64}</span>
                      <span className="text-[10px] opacity-70">⟳</span>
                    </button>
                    <span className="text-white/40 text-[10px] font-bold px-0.5 select-none">OR</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={totalPatternSteps || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10);
                        if (!isNaN(val)) {
                          const clamped = Math.max(1, Math.min(4096, val));
                          setTotalPatternSteps(clamped);
                          modularSynth.setTotalSteps(clamped);
                        } else if (e.target.value === '') {
                          setTotalPatternSteps(0);
                        }
                      }}
                      onBlur={() => {
                        if (!totalPatternSteps || totalPatternSteps < 8) {
                          setTotalPatternSteps(8);
                          modularSynth.setTotalSteps(8);
                        }
                      }}
                      className={`w-12 px-1 py-0.5 text-center text-xs font-mono font-bold bg-black/60 border rounded-xs outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        !LEN_PRESETS.includes(totalPatternSteps as any)
                          ? 'border-[#98c379] text-[#98c379]'
                          : 'border-white/20 text-white/70 focus:border-white/60'
                      }`}
                      title="Custom Step Length — Set arbitrary loop duration (e.g. 1184 steps for the complete Mario theme)"
                    />
                  </div>

                  <div className="w-px h-4 bg-white/15 mx-1" />

                  {/* METER Time Signature */}
                  <div className="flex items-center gap-1">
                    <span className="opacity-70 font-bold" title="Time Signature (METER) — Defines beats per measure and metric pulse subdivision">METER:</span>
                    {(['4/4', '3/4', '2/4', '5/4', '6/8', '7/8'] as TimeSignature[]).map((sig) => (
                      <button
                        key={sig}
                        onClick={() => {
                          setTimeMeter(sig);
                          modularSynth.setMeter(sig);
                          playSound('click');
                        }}
                        className={`px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors ${
                          timeMeter === sig
                            ? 'border-[#c678dd] bg-[#c678dd] text-black font-black'
                            : 'border-white/20 text-white/70 hover:border-white/50'
                        }`}
                        title={METER_SPECS[sig].name}
                      >
                        {sig}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. ROW 2: PLAYBACK TRANSPORT CONTROLS (LEFT) & TRK CHANNEL MIXER (RIGHT) */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1 bg-black/30 px-2 py-1 rounded-xs text-xs shrink-0">
                {/* Left: Transport Playback Controls (Rewind, Prev Bar, Play, Next Bar, CUR) */}
                <div className="flex items-center gap-1">
                  {/* Rewind to 0 (Pixel-perfect SVG) */}
                  <button
                    onClick={() => {
                      modularSynth.setPlaybackStep(0);
                      setCursorStep(0);
                      setSeqCurrentStep(0);
                      playSound('click');
                    }}
                    className="h-6 px-1.5 border border-white/20 hover:border-white/60 text-white/70 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center justify-center"
                    title="Rewind to Beginning (Step 1 / Bar 1.1) [Hotkey: Home]"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="2" y="2.5" width="2" height="11" rx="0.5" />
                      <polygon points="14,2.5 5,8 14,13.5" />
                    </svg>
                  </button>

                  {/* 1 Bar Backward */}
                  <button
                    onClick={() => {
                      const barSteps = METER_SPECS[timeMeter]?.stepsPerBar || 32;
                      const cur = modularSynth.getCurrentStep() || 0;
                      const prev = Math.max(0, cur - barSteps);
                      modularSynth.setPlaybackStep(prev);
                      setCursorStep(prev);
                      setSeqCurrentStep(prev);
                      playSound('click');
                    }}
                    className="h-6 px-1.5 border border-white/20 hover:border-white/60 text-white/70 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center justify-center"
                    title="Step 1 Bar Backward (◄◄)"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                      <polygon points="8,2.5 2,8 8,13.5" />
                      <polygon points="14,2.5 8,8 14,13.5" />
                    </svg>
                  </button>

                  {/* PLAY / STOP */}
                  <button
                    onClick={() => {
                      const playing = modularSynth.toggleSequencer(cursorStep);
                      setIsSeqPlaying(playing);
                      playSound('click');
                    }}
                    title="Play / Stop Sequencer (Starts from timeline cursor position) [Spacebar]"
                    className={`h-6 px-3 rounded-xs font-black text-xs cursor-pointer transition-all flex items-center justify-center ${
                      isSeqPlaying
                        ? 'bg-[#e06c75] text-black shadow-[0_0_8px_#e06c75]'
                        : 'bg-[#98c379] text-black hover:opacity-90'
                    }`}
                  >
                    <span>{isSeqPlaying ? '■ STOP' : '► PLAY'}</span>
                  </button>

                  {/* 1 Bar Forward */}
                  <button
                    onClick={() => {
                      const barSteps = METER_SPECS[timeMeter]?.stepsPerBar || 32;
                      const cur = modularSynth.getCurrentStep() || 0;
                      const next = Math.min(totalPatternSteps - 1, cur + barSteps);
                      modularSynth.setPlaybackStep(next);
                      setCursorStep(next);
                      setSeqCurrentStep(next);
                      playSound('click');
                    }}
                    className="h-6 px-1.5 border border-white/20 hover:border-white/60 text-white/70 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center justify-center"
                    title="Step 1 Bar Forward (►►)"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                      <polygon points="8,2.5 14,8 8,13.5" />
                      <polygon points="2,2.5 8,8 2,13.5" />
                    </svg>
                  </button>

                  {/* Jump to Cursor with Cursor Step Number */}
                  <button
                    onClick={() => {
                      modularSynth.setPlaybackStep(cursorStep);
                      setSeqCurrentStep(cursorStep);
                      playSound('click');
                    }}
                    className="h-6 px-2 border border-[#56b6c2]/40 hover:border-[#56b6c2] text-[#56b6c2] hover:bg-[#56b6c2]/10 rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center gap-1 shrink-0"
                    title={`Jump Playhead to Cursor (Step ${cursorStep + 1}) — Click to jump`}
                  >
                    <span>⤹ CUR:</span>
                    <span className="font-mono font-black">{cursorStep + 1}</span>
                  </button>
                </div>

                {/* Right: Overlay Toggle + 8-Track Channel Selectors with Inline Mute/Solo (Right-aligned) */}
                <div className="flex items-center gap-1.5 text-xs overflow-x-auto no-scrollbar ml-auto">
                  {/* Multi-Track Overlay Toggle (to the left of TRK 1) */}
                  <button
                    onClick={() => {
                      const next = !isOverlayMode;
                      setIsOverlayMode(next);
                      if (!next) {
                        setOverlayTrackIds([activeTrackId]);
                      } else {
                        if (!overlayTrackIds.includes(activeTrackId)) {
                          setOverlayTrackIds([activeTrackId]);
                        }
                      }
                      playSound('toggle');
                    }}
                    className={`px-2 py-0.5 border rounded-xs font-bold text-xs cursor-pointer transition-all flex items-center gap-1 shrink-0 ${
                      isOverlayMode
                        ? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black shadow-[0_0_6px_rgba(86,182,194,0.5)]'
                        : 'border-white/20 text-white/60 hover:text-white hover:border-white/50'
                    }`}
                    title={
                      isOverlayMode
                        ? 'Multi-Track Overlay Mode: ACTIVE — Click TRKs to multi-select and layer on Piano Roll'
                        : 'Multi-Track Overlay Mode: OFF — Click to enable multi-track layered view on Piano Roll'
                    }
                  >
                    <span>⧉</span>
                    <span>OVERLAY</span>
                  </button>

                  <div className="w-px h-3.5 bg-white/15 mx-0.5 shrink-0" />

                  {/* 8 Track Chips */}
                  {tracksState.map((trk) => {
                    const isSelected = isOverlayMode
                      ? overlayTrackIds.includes(trk.id)
                      : activeTrackId === trk.id;
                    const isPrimary = activeTrackId === trk.id;

                    return (
                      <div
                        key={trk.id}
                        className={`flex items-center border rounded-xs transition-all ${
                          isSelected
                            ? isPrimary
                              ? 'border-white bg-white/25 text-white shadow-sm ring-1 ring-white/60'
                              : 'border-white/50 bg-white/10 text-white'
                            : 'border-white/15 text-[#eceff4] opacity-50 hover:opacity-90'
                        }`}
                      >
                        <button
                          onClick={() => {
                            if (isOverlayMode) {
                              if (overlayTrackIds.includes(trk.id)) {
                                if (overlayTrackIds.length > 1) {
                                  const next = overlayTrackIds.filter((id) => id !== trk.id);
                                  setOverlayTrackIds(next);
                                  if (activeTrackId === trk.id) {
                                    setActiveTrackId(next[0]);
                                  }
                                }
                              } else {
                                setOverlayTrackIds([...overlayTrackIds, trk.id]);
                                setActiveTrackId(trk.id);
                              }
                            } else {
                              setActiveTrackId(trk.id);
                              setOverlayTrackIds([trk.id]);
                            }
                            playSound('click');
                          }}
                          className="px-2 py-0.5 font-bold text-xs cursor-pointer flex items-center gap-1.5"
                          style={{ color: isSelected ? trk.color : undefined }}
                          title={
                            isOverlayMode
                              ? `${trk.name} — Click to toggle overlay visibility. Active Editing Track: ${activeTrackId === trk.id ? 'YES' : 'NO'}`
                              : `Select ${trk.name}`
                          }
                        >
                          <span className="w-2 h-2 inline-block shrink-0 rounded-[1px]" style={{ backgroundColor: trk.color }} />
                          <span>{trk.name.split(':')[0]}</span>
                        </button>

                        {/* Inline Mute & Solo Toggles */}
                        <div className="flex items-center border-l border-white/15 px-1 gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              modularSynth.toggleTrackMute(trk.id);
                              setTracksState([...modularSynth.getTracks()]);
                              playSound('click');
                            }}
                            className={`px-1.5 py-0.2 text-xs font-bold rounded-xs cursor-pointer ${
                              trk.muted ? 'bg-red-500 text-black font-black' : 'text-white/40 hover:text-white'
                            }`}
                            title={`Mute ${trk.name}`}
                          >
                            M
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              modularSynth.toggleTrackSolo(trk.id);
                              setTracksState([...modularSynth.getTracks()]);
                              playSound('click');
                            }}
                            className={`px-1.5 py-0.2 text-xs font-bold rounded-xs cursor-pointer ${
                              trk.solo ? 'bg-amber-500 text-black font-black' : 'text-white/40 hover:text-white'
                            }`}
                            title={`Solo ${trk.name}`}
                          >
                            S
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. ROW 3: PRESETS (LEFT), SNAP & DUR (CENTER), PAGE NAVIGATION (RIGHT) - EQUALLY SPACED */}
              <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-2 border-b border-white/10 pb-1 bg-black/25 px-2 py-1 rounded-xs text-xs shrink-0">
                {/* Left: Sound Design Presets (◄ / ► Cycle Selector, Click Name to Load) */}
                <div className="flex items-center gap-0.5 justify-start text-xs">
                  <span className="text-white/60 font-bold text-[11px] pl-0.5">PRESET:</span>
                  <button
                    onClick={() => {
                      const prev = (soundPresetIdx - 1 + SOUND_PRESETS.length) % SOUND_PRESETS.length;
                      setSoundPresetIdx(prev);
                      playSound('click');
                    }}
                    className="px-1 text-[#56b6c2] hover:text-white cursor-pointer font-bold select-none"
                    title="Previous Sound Preset"
                  >
                    ◄
                  </button>
                  <button
                    onClick={() => {
                      const sel = SOUND_PRESETS[soundPresetIdx];
                      if (sel) {
                        handleTrackParamChange(sel.preset);
                        playSound('toggle');
                      }
                    }}
                    className="px-1.5 py-0.5 border border-white/20 hover:border-[#56b6c2] bg-white/5 hover:bg-white/15 rounded-xs font-bold text-white hover:text-[#56b6c2] cursor-pointer transition-colors"
                    title={`Click to load preset: ${PRESET_TOOLTIPS[SOUND_PRESETS[soundPresetIdx]?.name] || SOUND_PRESETS[soundPresetIdx]?.name}`}
                  >
                    {SOUND_PRESETS[soundPresetIdx]?.name}
                  </button>
                  <button
                    onClick={() => {
                      const next = (soundPresetIdx + 1) % SOUND_PRESETS.length;
                      setSoundPresetIdx(next);
                      playSound('click');
                    }}
                    className="px-1 text-[#56b6c2] hover:text-white cursor-pointer font-bold select-none"
                    title="Next Sound Preset"
                  >
                    ►
                  </button>
                </div>

                {/* Center: SNAP & DUR (Centered in Middle Third) */}
                <div className="flex items-center justify-center gap-2">
                  {/* Grid Snap / Quantization Alignment (SNAP) */}
                  <div className="flex items-center gap-1">
                    <span className="opacity-60 font-bold" title="Grid Quantization / Snap Alignment">SNAP:</span>
                    {(['4', '2', '1', '1/2', '1/4', '1/8'] as NoteDurationDiv[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => {
                          setSnapDiv(d);
                          playSound('click');
                        }}
                        className={`px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors ${
                          snapDiv === d
                            ? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
                            : 'border-white/20 text-white/70 hover:border-white/50'
                        }`}
                        title={`Grid Snap Quantization: ${d} beat (${d === '4' ? 'Whole note = 16 cells' : d === '2' ? 'Half note = 8 cells' : d === '1' ? 'Quarter note = 4 cells' : d === '1/2' ? '8th note = 2 cells' : d === '1/4' ? '16th note = 1 cell' : '32nd note = 1/2 cell'})`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  {/* Note Duration / Length (DUR) */}
                  <div className="flex items-center gap-1 border-l border-white/15 pl-1.5">
                    <span className="opacity-60 font-bold" title="Placed Note Duration / Length">DUR:</span>
                    {(['4', '2', '1', '1/2', '1/4', '1/8'] as NoteDurationDiv[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => {
                          setNoteDur(d);
                          playSound('click');
                        }}
                        className={`px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors ${
                          noteDur === d
                            ? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
                            : 'border-white/20 text-white/70 hover:border-white/50'
                        }`}
                        title={`Placed Note Length: ${d === '4' ? 'Whole Note (16 cells)' : d === '2' ? 'Half Note (8 cells)' : d === '1' ? 'Quarter Note (4 cells)' : d === '1/2' ? 'Eighth Note (2 cells)' : d === '1/4' ? '16th Note (1 cell)' : '32nd Note (1/2 cell)'}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: Metric-Aware Viewport Page Flipping (Aligned to Right Third) */}
                {(() => {
                  const currentMeterSpec = METER_SPECS[timeMeter] || METER_SPECS['4/4'];
                  const stepsPerPage = currentMeterSpec.stepsPerBar;
                  const totalPages = Math.max(1, Math.ceil(totalPatternSteps / stepsPerPage));

                  return (
                    <div className="flex items-center justify-end gap-1">
                      <span className="opacity-60 font-bold" title="Step Page Navigation">PAGE:</span>
                      <button
                        onClick={() => {
                          setActiveStepPage((prev) => Math.max(0, prev - 1));
                          playSound('click');
                        }}
                        disabled={activeStepPage === 0}
                        className="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
                        title="Previous Page (◄)"
                      >
                        ◄
                      </button>
                      <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs" title={`Active Measure Page: Page ${activeStepPage + 1} of ${totalPages} (Steps ${activeStepPage * stepsPerPage + 1} to ${Math.min(totalPatternSteps, (activeStepPage + 1) * stepsPerPage)})`}>
                        {activeStepPage + 1}/{totalPages}
                      </span>
                      <button
                        onClick={() => {
                          setActiveStepPage((prev) => Math.min(totalPages - 1, prev + 1));
                          playSound('click');
                        }}
                        disabled={activeStepPage >= totalPages - 1}
                        className="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
                        title="Next Page (►)"
                      >
                        ►
                      </button>
                      <button
                        onClick={() => { setPageFollow(!pageFollow); playSound('toggle'); }}
                        className={`px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer text-xs ${
                          pageFollow ? 'border-[#98c379] bg-[#98c379] text-black font-black' : 'border-white/20 text-white/50'
                        }`}
                        title="Follow Playhead Mode (FLW) — Automatically turns pages as the sequencer plays"
                      >
                        FLW
                      </button>
                    </div>
                  );
                })()}
              </div>


                                                                                                                                                          {/* L-SHAPE SYNTHESIZER & PIANO ROLL WORKSTATION TOPOLOGY */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar lg:overflow-hidden flex flex-col lg:grid lg:grid-cols-5 lg:grid-rows-[minmax(0,1fr)_155px] gap-1.5">
                
                {/* UPPER L-SHAPE: LEFT (GROUPED MODULES 1, 2, 3 VERTICAL) + RIGHT (PIANO ROLL MATRIX) [1:4 RATIO] */}
                <div className="contents">
                  
                  {/* LEFT COLUMN: MODULES 1, 2, 3 (STRETCHED TO EXACTLY MATCH PIANO ROLL HEIGHT IN 5:3:3 RATIO) */}
                  <div className="order-2 lg:order-1 lg:col-span-1 flex flex-col lg:grid lg:grid-rows-[5fr_3fr_3fr] gap-1.5 min-w-[260px] lg:min-w-0 lg:h-full lg:overflow-hidden">
                    
                    {/* MODULE 1: DUAL OSCILLATORS (LEFT: OSC1 5-VERTICAL, CENTER: OSC2 5-VERTICAL, RIGHT: 4×2 KNOBS GRID 32px) */}
                    <div className="border border-[#e5c07b]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[175px] lg:min-h-0 lg:h-full lg:overflow-hidden">
                      <div className="flex justify-between items-center font-black text-[#e5c07b] text-xs border-b border-white/10 pb-0.5 shrink-0">
                        <span>1. DUAL OSC</span>
                        <span className="text-white/40 font-mono text-xs">──▼</span>
                      </div>

                      <div className="grid grid-cols-12 gap-1 items-center flex-1 min-h-0 my-auto py-0.5">
                        {/* Left: OSC 1 (5 Waveforms Vertically Stacked) */}
                        <div className="col-span-3 flex flex-col justify-between h-full py-0.5">
                          <span className="text-[10px] text-white/60 font-black text-center mb-0.5 leading-none">OSC1</span>
                          <div className="flex flex-col gap-0.5 flex-1 justify-between">
                            {(['square', 'sawtooth', 'triangle', 'sine', 'noise'] as SynthWaveform[]).map((w) => (
                              <button
                                key={w}
                                onClick={() => { handleTrackParamChange({ osc1Waveform: w }); playSound('click'); }}
                                title={`Oscillator 1 Waveform: ${WAVE_TOOLTIPS[w] || w}`} className={`flex-1 flex items-center justify-center text-[10px] border rounded-xs font-black cursor-pointer transition-colors leading-none text-center ${
                                  currentTrack.osc1Waveform === w
                                    ? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
                                    : 'border-white/20 text-white/70 hover:bg-white/10'
                                }`}
                              >
                                {getWaveformAbbr(w)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Center: OSC 2 (5 Waveforms Vertically Stacked) */}
                        <div className="col-span-3 flex flex-col justify-between h-full py-0.5">
                          <span className="text-[10px] text-white/60 font-black text-center mb-0.5 leading-none">OSC2</span>
                          <div className="flex flex-col gap-0.5 flex-1 justify-between">
                            {(['sawtooth', 'square', 'sine', 'triangle', 'noise'] as SynthWaveform[]).map((w) => (
                              <button
                                key={w}
                                onClick={() => { handleTrackParamChange({ osc2Waveform: w }); playSound('click'); }}
                                title={`Oscillator 2 Waveform: ${WAVE_TOOLTIPS[w] || w}`} className={`flex-1 flex items-center justify-center text-[10px] border rounded-xs font-black cursor-pointer transition-colors leading-none text-center ${
                                  currentTrack.osc2Waveform === w
                                    ? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
                                    : 'border-white/20 text-white/70 hover:bg-white/10'
                                }`}
                              >
                                {getWaveformAbbr(w)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Right: 8 Knobs in 4×2 Grid (32px, Crisp & Balanced) */}
                        <div className="col-span-6 grid grid-cols-2 gap-0.5 border-l border-white/10 pl-1.5 h-full items-center py-0.5">
                          <RotaryKnob
                            label="OSC1"
                            value={Math.round(currentTrack.osc1Gain * 100)}
                            min={0}
                            max={100}
                            unit="%"
                            color="#e5c07b"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ osc1Gain: v / 100 })}
                          />
                          <RotaryKnob
                            label="OSC2"
                            value={Math.round(currentTrack.osc2Gain * 100)}
                            min={0}
                            max={100}
                            unit="%"
                            color="#56b6c2"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ osc2Gain: v / 100 })}
                          />
                          <RotaryKnob
                            label="DET"
                            value={currentTrack.detuneCents}
                            min={-50}
                            max={50}
                            step={2}
                            unit="c"
                            color="#e06c75"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ detuneCents: v })}
                          />
                          <RotaryKnob
                            label="SEMI"
                            value={currentTrack.osc2Semitone ?? 0}
                            min={-24}
                            max={24}
                            step={1}
                            unit="st"
                            color="#c678dd"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ osc2Semitone: v })}
                          />
                          <RotaryKnob
                            label="PW"
                            value={currentTrack.pulseWidth ?? 50}
                            min={5}
                            max={95}
                            step={5}
                            unit="%"
                            color="#d19a66"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ pulseWidth: v })}
                          />
                          <RotaryKnob
                            label="PHS"
                            value={currentTrack.phaseOffset}
                            min={0}
                            max={360}
                            step={15}
                            unit="°"
                            color="#98c379"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ phaseOffset: v })}
                          />
                          <RotaryKnob
                            label="SUB"
                            value={Math.round((currentTrack.subOscGain ?? 0) * 100)}
                            min={0}
                            max={100}
                            unit="%"
                            color="#61afef"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ subOscGain: v / 100 })}
                          />
                          <RotaryKnob
                            label="NOISE"
                            value={Math.round((currentTrack.noiseGain ?? 0) * 100)}
                            min={0}
                            max={100}
                            unit="%"
                            color="#abb2bf"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ noiseGain: v / 100 })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* MODULE 2: TIMBRE FUSION (LEFT: 2x2 BUTTONS GRID, RIGHT: 2 HORIZONTAL KNOBS 32px) */}
                    <div className="border border-[#c678dd]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[115px] lg:min-h-0 lg:h-full lg:overflow-hidden">
                      <div className="flex justify-between items-center font-black text-[#c678dd] text-xs border-b border-white/10 pb-0.5 shrink-0">
                        <span>2. FUSION</span>
                        <span className="text-white/40 font-mono text-xs">──▼</span>
                      </div>

                      <div className="grid grid-cols-12 gap-2 items-center flex-1 min-h-0 my-auto py-0.5">
                        {/* Left: 4 Blend Mode Buttons in a 2x2 GRID (Equal Size, Pure Text, Stretched to Fill Height) */}
                        <div className="col-span-6 grid grid-cols-2 grid-rows-2 gap-1 h-full py-0.5">
                          {(['layer', 'fm', 'ring', 'sync'] as BlendMode[]).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => { handleTrackParamChange({ blendMode: mode }); playSound('click'); }}
                              title={BLEND_TOOLTIPS[mode] || mode} className={`h-full w-full flex items-center justify-center text-xs border rounded-xs font-black cursor-pointer transition-colors leading-none text-center ${
                                currentTrack.blendMode === mode
                                  ? 'border-[#c678dd] bg-[#c678dd] text-black font-black'
                                  : 'border-white/20 text-white/70 hover:bg-white/10'
                              }`}
                            >
                              {mode.toUpperCase()}
                            </button>
                          ))}
                        </div>

                        {/* Right: 3 Knobs Arranged HORIZONTALLY Side-by-Side (MORPH, RATIO, GLIDE 32px) */}
                        <div className="col-span-6 grid grid-cols-3 gap-0.5 border-l border-white/10 pl-1.5 h-full items-center py-0.5">
                          <RotaryKnob
                            label="MORPH"
                            value={Math.round(currentTrack.morphAmount * 100)}
                            min={0}
                            max={100}
                            unit="%"
                            color="#c678dd"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ morphAmount: v / 100 })}
                          />
                          <RotaryKnob
                            label="RATIO"
                            value={currentTrack.osc2Ratio}
                            min={0.5}
                            max={4}
                            step={0.5}
                            unit="x"
                            color="#56b6c2"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ osc2Ratio: v })}
                          />
                          <RotaryKnob
                            label="GLIDE"
                            value={currentTrack.glideTime ?? 0}
                            min={0}
                            max={300}
                            step={10}
                            unit="ms"
                            color="#e5c07b"
                            size={32}
                            onChange={(v) => handleTrackParamChange({ glideTime: v })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* MODULE 3: MULTI-MODE VCF (LEFT: 2x2 BUTTONS GRID, RIGHT: 3 KNOBS 32px, No Divider) */}
                    <div className="border border-[#56b6c2]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[115px] lg:min-h-0 lg:h-full lg:overflow-hidden">
                      <div className="flex justify-between items-center font-black text-[#56b6c2] text-xs border-b border-white/10 pb-0.5 shrink-0">
                        <span>3. VCF FILTER</span>
                        <span className="text-white/40 font-mono text-xs">──▼</span>
                      </div>

                      <div className="grid grid-cols-12 gap-2 items-center flex-1 min-h-0 my-auto py-0.5">
                        {/* Left: 4 Filter Mode Buttons in a 2x2 GRID (Stretched to Fill Height) */}
                        <div className="col-span-5 grid grid-cols-2 grid-rows-2 gap-1 h-full py-0.5">
                          {(['lowpass', 'bandpass', 'highpass', 'notch'] as FilterType[]).map((f) => (
                            <button
                              key={f}
                              onClick={() => { handleTrackParamChange({ filterType: f }); playSound('click'); }}
                              title={FILTER_TOOLTIPS[f] || f} className={`h-full w-full flex items-center justify-center text-xs border rounded-xs font-black cursor-pointer transition-colors leading-none text-center ${
                                currentTrack.filterType === f
                                  ? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
                                  : 'border-white/20 text-white/70 hover:bg-white/10'
                              }`}
                            >
                              {f === 'lowpass' ? 'LPF' : f === 'bandpass' ? 'BPF' : f === 'highpass' ? 'HPF' : 'NOTCH'}
                            </button>
                          ))}
                        </div>

                        {/* Right: 3 Knobs Arranged in Triangular Close Packing (32px, No Divider) */}
                        <div className="col-span-7 flex flex-col justify-around border-l border-white/10 pl-1.5 h-full py-0.5">
                          {/* Top Row: 2 Knobs (CUTOFF, RES) */}
                          <div className="grid grid-cols-4 gap-0.5 items-center">
                            <div className="col-span-2 flex justify-center">
                              <RotaryKnob
                                label="CUTOFF"
                                value={currentTrack.cutoff}
                                min={40}
                                max={12000}
                                step={50}
                                unit="Hz"
                                color="#56b6c2"
                                size={32}
                                onChange={(v) => handleTrackParamChange({ cutoff: v })}
                              />
                            </div>
                            <div className="col-span-2 flex justify-center">
                              <RotaryKnob
                                label="RES (Q)"
                                value={currentTrack.resonance}
                                min={0.2}
                                max={14}
                                step={0.2}
                                color="#e5c07b"
                                size={32}
                                onChange={(v) => handleTrackParamChange({ resonance: v })}
                              />
                            </div>
                          </div>

                          {/* Bottom Row: 1 Knob (ENV AMT) Nested in the Interstice */}
                          <div className="grid grid-cols-4 gap-0.5 items-center">
                            <div className="col-start-2 col-span-2 flex justify-center">
                              <RotaryKnob
                                label="ENV AMT"
                                value={Math.round((currentTrack.filterEnvAmount ?? currentTrack.envFilterMod ?? 0.5) * 100)}
                                min={-100}
                                max={100}
                                unit="%"
                                color="#98c379"
                                size={32}
                                onChange={(v) => handleTrackParamChange({ filterEnvAmount: v / 100, envFilterMod: Math.max(0, v / 100) })}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* RIGHT COLUMN: PIANO ROLL MATRIX WORKSPACE (TOP ON MOBILE/LOW-RES, RIGHT ON DESKTOP) */}
                  <div className="order-1 lg:order-2 lg:col-span-4 flex flex-col min-h-[420px] lg:min-h-0 lg:h-full lg:overflow-hidden">
                    {/* 2. FULL-BLEED PIANO ROLL MATRIX WITH DYNAMIC METER TIMELINE & INTEGRATED PRESETS */}
                    {(() => {
                      const meterSpec = METER_SPECS[timeMeter] || METER_SPECS['4/4'];
                      const colsPerPage = meterSpec.colsPerBar;
                      const stepsPerPage = meterSpec.stepsPerBar;
                      const viewportStartCol = activeStepPage * colsPerPage;
                      const activeCol = (isSeqPlaying && Math.floor(seqCurrentStep / stepsPerPage) === activeStepPage)
                        ? Math.floor((seqCurrentStep % stepsPerPage) / 2)
                        : -1;
                      const activeSubCol = isSeqPlaying ? (seqCurrentStep % 2) : -1;

                      return (
                    <div className="border border-white/20 p-1.5 bg-black/60 rounded-xs flex-1 min-h-0 flex flex-col overflow-hidden gap-1">
                      {/* Header with Title, Presets, Playhead Tracker, Octaves & Quick Tools */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs font-bold shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs" style={{ color: currentTrack.color }}>
                            PIANO ROLL // {currentTrack.name}
                          </span>
                          <span className="text-xs text-[#98c379] font-mono font-bold">
                            BAR {Math.floor(seqCurrentStep / stepsPerPage) + 1}.{Math.floor(((seqCurrentStep % stepsPerPage) / (stepsPerPage / meterSpec.beatsPerBar))) + 1} (STEP {seqCurrentStep + 1}/{totalPatternSteps})
                          </span>
                          
                        </div>

                        <div className="flex items-center gap-1.5 text-xs">
                          {/* Clear Page Tool */}
                          <button
                            onClick={() => {
                              for (let i = 0; i < stepsPerPage; i++) {
                                const actualStep = activeStepPage * stepsPerPage + i;
                                modularSynth.clearTrackStep(activeTrackId, actualStep);
                              }
                              setTracksState([...modularSynth.getTracks()]);
                              playSound('click');
                            }}
                            className="border border-white/20 px-2 py-0.5 rounded-xs hover:border-red-400 text-red-300 cursor-pointer text-xs font-bold"
                            title="Clear Page (CLR) — Removes all placed notes and chords from the current page on the active track"
                          >
                            ✕ CLR
                          </button>

                          <span className="opacity-30">|</span>

                          {/* Octave Range Selector (FROM - TO) */}
                          <div className="flex items-center gap-1 text-xs">
                            <span className="opacity-60 text-xs font-bold" title="Octave Scope Range (FROM - TO) — Limits visible pitch range in the piano roll without altering grid cell dimensions">OCT:</span>

                            {/* FROM Control */}
                            <div className="flex items-center gap-0.5">
                              <span className="text-white/50 text-[10px] font-bold">FROM</span>
                              <button
                                onClick={() => {
                                  setOctaveFrom((prev) => Math.max(1, prev - 1));
                                  playSound('click');
                                }}
                                disabled={octaveFrom <= 1}
                                className="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
                                title="Lower starting octave (Octave down)"
                              >
                                ◄
                              </button>
                              <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#56b6c2] min-w-[20px] text-center" title={`Starting Octave: Octave ${octaveFrom} (C${octaveFrom})`}>
                                {octaveFrom}
                              </span>
                              <button
                                onClick={() => {
                                  setOctaveFrom((prev) => Math.min(octaveTo, prev + 1));
                                  playSound('click');
                                }}
                                disabled={octaveFrom >= octaveTo}
                                className="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
                                title="Raise starting octave (Octave up)"
                              >
                                ►
                              </button>
                            </div>

                            {/* TO Control */}
                            <div className="flex items-center gap-0.5 ml-1">
                              <span className="text-white/50 text-[10px] font-bold">TO</span>
                              <button
                                onClick={() => {
                                  setOctaveTo((prev) => Math.max(octaveFrom, prev - 1));
                                  playSound('click');
                                }}
                                disabled={octaveTo <= octaveFrom}
                                className="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
                                title="Lower ending octave"
                              >
                                ◄
                              </button>
                              <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#e5c07b] min-w-[20px] text-center" title={`Ending Octave: Octave ${octaveTo} (B${octaveTo})`}>
                                {octaveTo}
                              </span>
                              <button
                                onClick={() => {
                                  setOctaveTo((prev) => Math.min(7, prev + 1));
                                  playSound('click');
                                }}
                                disabled={octaveTo >= 7}
                                className="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
                                title="Raise ending octave"
                              >
                                ►
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Piano Roll Main Matrix Body: Fixed Top Ruler, Scrollable Note Rows, Fixed Bottom ACC */}
                      <div className="flex-1 min-h-0 overflow-x-auto no-scrollbar flex flex-col">
                        <div className="min-w-[480px] sm:min-w-0 flex-1 min-h-0 flex flex-col justify-between">

                          {/* 1. Fixed Timeline Ruler at Top with Cursor Selection */}
                          <div className="flex items-center gap-1 pl-10 pr-0.5 text-xs font-mono text-white/50 border-b border-white/10 pb-0.5 shrink-0 select-none">
                            <div
                              className="flex-1 gap-0.5"
                              style={{ display: 'grid', gridTemplateColumns: `repeat(${colsPerPage}, minmax(0, 1fr))` }}
                            >
                              {Array.from({ length: colsPerPage }).map((_, colIdx) => {
                                const globalCol = viewportStartCol + colIdx;
                                const barNum = Math.floor(globalCol / meterSpec.colsPerBar) + 1;
                                const colInBar = globalCol % meterSpec.colsPerBar;
                                const beatNum = Math.floor(colInBar / meterSpec.colsPerBeat) + 1;
                                const isBarStart = colInBar === 0;
                                const isBeatStart = colInBar % meterSpec.colsPerBeat === 0;
                                const isCurrent = isSeqPlaying && Math.floor(seqCurrentStep / 2) === globalCol;
                                const isCursorCol = Math.floor(cursorStep / 2) === globalCol;

                                return (
                                  <div key={colIdx} className="h-full">
                                    {snapDiv === '1/8' ? (
                                      <div className="flex h-full gap-0.5 text-xs">
                                        {[0, 1].map((subCol) => {
                                          const step = globalCol * 2 + subCol;
                                          const isSubCurrent = isSeqPlaying && seqCurrentStep === step;
                                          const isSubCursor = cursorStep === step;
                                          return (
                                            <button
                                              key={subCol}
                                              type="button"
                                              onClick={() => {
                                                setCursorStep(step);
                                                if (!isSeqPlaying) {
                                                  modularSynth.setPlaybackStep(step);
                                                  setSeqCurrentStep(step);
                                                }
                                                playSound('click');
                                              }}
                                              className={`flex-1 text-center py-0.5 rounded-xs transition-colors cursor-pointer select-none font-bold relative ${
                                                isSubCurrent
                                                  ? 'bg-white text-black font-black shadow-[0_0_6px_#fff]'
                                                  : isSubCursor
                                                  ? 'bg-[#56b6c2]/40 text-[#56b6c2] border border-[#56b6c2] font-black'
                                                  : isBarStart && subCol === 0
                                                  ? 'bg-[#56b6c2]/25 text-[#56b6c2] border border-[#56b6c2]/50 font-black'
                                                  : isBeatStart && subCol === 0
                                                  ? 'bg-white/15 text-white font-bold'
                                                  : 'text-white/30 hover:bg-white/10 hover:text-white/70'
                                              }`}
                                              title={`Click to set Playback Cursor to Step ${step + 1} (Bar ${barNum}.${beatNum})`}
                                            >
                                              {isSubCursor && !isSubCurrent && (
                                                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[8px] text-[#56b6c2] leading-none">▼</span>
                                              )}
                                              {subCol === 0 ? (isBarStart ? `${barNum}.1` : isBeatStart ? `${barNum}.${beatNum}` : `${colIdx + 1}`) : '+'}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const step = globalCol * 2;
                                          setCursorStep(step);
                                          if (!isSeqPlaying) {
                                            modularSynth.setPlaybackStep(step);
                                            setSeqCurrentStep(step);
                                          }
                                          playSound('click');
                                        }}
                                        className={`w-full text-center py-0.5 rounded-xs transition-colors font-bold text-xs cursor-pointer select-none relative ${
                                          isCurrent
                                            ? 'bg-white text-black font-black shadow-[0_0_6px_#fff]'
                                            : isCursorCol
                                            ? 'bg-[#56b6c2]/40 text-[#56b6c2] border border-[#56b6c2] font-black'
                                            : isBarStart
                                            ? 'bg-[#56b6c2]/25 text-[#56b6c2] border border-[#56b6c2]/50 font-black'
                                            : isBeatStart
                                            ? 'bg-white/15 text-white'
                                            : 'text-white/30 hover:bg-white/10 hover:text-white/70'
                                        }`}
                                        title={`Click to set Playback Cursor to Column ${colIdx + 1} (Step ${globalCol * 2 + 1}, Bar ${barNum}.${beatNum})`}
                                      >
                                        {isCursorCol && !isCurrent && (
                                          <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[8px] text-[#56b6c2] leading-none">▼</span>
                                        )}
                                        {isBarStart ? `${barNum}.1` : isBeatStart ? `${barNum}.${beatNum}` : `${colIdx + 1}`}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* 2. Middle Scrollable Note Rows (ONLY this area scrolls vertically) */}
                          <div className="flex-1 min-h-0 space-y-0.5 font-mono text-xs pr-0.5 flex flex-col overflow-y-auto custom-scrollbar">
                            {PIANO_ROLL_NOTES.map((nInfo, actualIdx) => {
                              if (nInfo.oct < octaveFrom || nInfo.oct > octaveTo) return null;

                              return (
                                <PianoRollRow
                                  key={nInfo.note}
                                  nInfo={nInfo}
                                  actualIdx={actualIdx}
                                  visibleTracks={visibleTracks}
                                  viewportStartCol={viewportStartCol}
                                  activeCol={activeCol}
                                  activeSubCol={activeSubCol}
                                  timeMeter={timeMeter}
                                  snapDiv={snapDiv}
                                  totalPatternSteps={totalPatternSteps}
                                  onAudition={(idx) => {
                                    modularSynth.triggerTrackVoice(activeTrackId, idx, 0);
                                    playSound('click');
                                  }}
                                  onCellClick={handlePianoRollCellClick}
                                  onSubCellClick={handlePianoRollSubCellClick}
                                />
                              );
                            })}
                          </div>

                          {/* 3. Fixed ACC (Accent) Track at Bottom — 3-LEVEL CYCLE (+3dB Amber, +6dB Red) */}
                          <div className="flex items-center gap-1 pt-1 border-t border-white/10 text-xs font-mono shrink-0 select-none">
                            <div className="w-9 text-right pr-1 font-black text-[#e06c75] shrink-0 select-none text-xs flex items-center justify-end">
                              <span title="Accent Velocity Track — 3-Level Cycle: OFF (0dB) -> Amber (+3dB) -> Red (+6dB)">ACC</span>
                            </div>
                            <div
                              className="flex-1 gap-0.5"
                              style={{ display: 'grid', gridTemplateColumns: `repeat(${colsPerPage}, minmax(0, 1fr))` }}
                            >
                              {Array.from({ length: colsPerPage }).map((_, colIdx) => {
                                const globalCol = viewportStartCol + colIdx;
                                const colInBar = globalCol % meterSpec.colsPerBar;
                                const isBarStart = colInBar === 0;
                                const isBeatStart = colInBar % meterSpec.colsPerBeat === 0;

                                return (
                                  <div key={colIdx} className="h-full">
                                    <div className="flex h-full gap-0.5">
                                      {[0, 1].map((subCol) => {
                                        const step = globalCol * 2 + subCol;
                                        const accVal = Number(currentTrack.accents[step] || 0);
                                        const isSubCurrent = isSeqPlaying && seqCurrentStep === step;

                                        return (
                                          <button
                                            key={subCol}
                                            onClick={() => {
                                              modularSynth.cycleTrackAccent(activeTrackId, step);
                                              setTracksState([...modularSynth.getTracks()]);
                                              playSound('click');
                                            }}
                                            className={`flex-1 py-0.5 text-center text-xs font-bold rounded-xs cursor-pointer border transition-all ${
                                              isSubCurrent
                                                ? 'border-white bg-white text-black font-black shadow-[0_0_8px_#fff]'
                                                : accVal === 2
                                                ? 'border-[#e06c75] bg-[#e06c75] text-black font-black shadow-[0_0_6px_#e06c75]'
                                                : accVal === 1
                                                ? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black shadow-xs'
                                                : isBarStart && subCol === 0
                                                ? 'border-y border-r border-white/15 border-l-2 border-l-[#56b6c2]/80 bg-black/50 text-white/70 hover:border-white/40'
                                                : isBeatStart && subCol === 0
                                                ? 'border-y border-r border-white/15 border-l border-l-white/40 bg-black/50 text-white/50 hover:border-white/40'
                                                : 'border border-white/10 bg-black/40 text-white/40 hover:border-white/30'
                                            }`}
                                            title={`Step ${step + 1} (${subCol === 0 ? 'L' : 'R'}) Accent: ${
                                              accVal === 2 ? '+6dB Red' : accVal === 1 ? '+3dB Amber' : 'OFF (0dB)'
                                            } — Click to cycle`}
                                          >
                                            {accVal === 2 ? '+6' : accVal === 1 ? '+3' : subCol === 0 ? `${colIdx + 1}` : '·'}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                    );})()}
                  </div>

                </div>

                {/* BOTTOM L-SHAPE BASE: COMPACT h-[155px], TALL ENVELOPE CURVE & FADERS, ZERO OVERFLOW (MODULES 4, 5, 6, 7) */}
                <div className="order-3 lg:order-3 lg:col-span-5 lg:row-span-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-1.5 text-xs lg:h-[155px] shrink-0">
                  
                  {/* MODULE 4: DUAL INDEPENDENT ENVELOPES (2:1 RATIO -> LEFT 2 COLS: TALL SVG CURVE, RIGHT 1 COL: 4 TALL ADSR FADERS) */}
                  <div className="lg:col-span-3 border border-[#98c379]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[155px] lg:min-h-0 lg:h-full lg:overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between font-black text-xs border-b border-white/10 pb-0.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[#98c379] text-xs font-black">4. ENVELOPES</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setActiveEnvTab('amp'); playSound('click'); }}
                            title="Amplitude Envelope (AMP) — Shapes volume and loudness contour over time via ADSR"
                            className={`px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors ${
                              activeEnvTab === 'amp'
                                ? 'border-[#98c379] bg-[#98c379] text-black font-black'
                                : 'border-white/20 text-white/60 hover:text-white'
                            }`}
                          >
                            AMP
                          </button>
                          <button
                            onClick={() => { setActiveEnvTab('vcf'); playSound('click'); }}
                            title="Filter Envelope (VCF) — Sweeps filter cutoff frequency over time via ADSR"
                            className={`px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors ${
                              activeEnvTab === 'vcf'
                                ? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
                                : 'border-white/20 text-white/60 hover:text-white'
                            }`}
                          >
                            VCF
                          </button>
<button
                            onClick={() => { setActiveEnvTab('pit'); playSound('click'); }}
                            title="Pitch Envelope (PIT) — Modulates transient oscillator pitch over time (ideal for punchy kick drums and laser FX)"
                            className={`px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors ${
                              activeEnvTab === 'pit'
                                ? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
                                : 'border-white/20 text-white/60 hover:text-white'
                            }`}
                          >
                            PIT
                          </button>
                        </div>
                      </div>
                      <span className="text-white/40 font-mono text-xs">──►</span>
                    </div>

                    {/* Left/Right Horizontal Split in 2 : 1 Ratio (Envelope Graph 2 parts : ADSR Faders 1 part) */}
                    <div className="grid grid-cols-3 gap-1.5 items-center flex-1 min-h-0 my-auto">
                      {/* Left: 2 Cols (66.7% width) - Dynamic SVG ADSR Curve Display with Spacious Parameters */}
                      <div className="col-span-2 flex flex-col justify-between h-full py-0.5">
                        <div className="flex-1 flex items-center justify-center">
                          <AdsrVisualizer
                            attack={activeEnvTab === 'amp' ? (currentTrack.ampAttack ?? currentTrack.attack) : activeEnvTab === 'vcf' ? currentTrack.filterAttack : (currentTrack.pitchAttack ?? 0.01)}
                            decay={activeEnvTab === 'amp' ? (currentTrack.ampDecay ?? currentTrack.decay) : activeEnvTab === 'vcf' ? currentTrack.filterDecay : (currentTrack.pitchDecay ?? 0.1)}
                            sustain={activeEnvTab === 'amp' ? (currentTrack.ampSustain ?? currentTrack.sustain) : activeEnvTab === 'vcf' ? currentTrack.filterSustain : 0}
                            release={activeEnvTab === 'amp' ? (currentTrack.ampRelease ?? currentTrack.release) : activeEnvTab === 'vcf' ? currentTrack.filterRelease : 0.01}
                            color={activeEnvTab === 'amp' ? '#98c379' : activeEnvTab === 'vcf' ? '#56b6c2' : '#e5c07b'}
                          />
                        </div>
                      </div>

                      {/* Right: 1 Col (33.3% width) - 4 Precision Hardware Faders */}
                      <div className="col-span-1 flex items-center justify-around gap-0.5 border-l border-white/10 pl-1 h-full py-0.5">
                        <HardwareFader
                          label="A"
                          value={activeEnvTab === 'amp' ? (currentTrack.ampAttack ?? currentTrack.attack) : activeEnvTab === 'vcf' ? currentTrack.filterAttack : (currentTrack.pitchAttack ?? 0.01)}
                          min={0.001}
                          max={0.8}
                          step={0.01}
                          color={activeEnvTab === 'amp' ? '#98c379' : activeEnvTab === 'vcf' ? '#56b6c2' : '#e5c07b'}
                          height={46}
                          onChange={(v) => {
                            if (activeEnvTab === 'amp') handleTrackParamChange({ ampAttack: v, attack: v });
                            else if (activeEnvTab === 'vcf') handleTrackParamChange({ filterAttack: v });
                            else handleTrackParamChange({ pitchAttack: v });
                          }}
                        />
                        <HardwareFader
                          label="D"
                          value={activeEnvTab === 'amp' ? (currentTrack.ampDecay ?? currentTrack.decay) : activeEnvTab === 'vcf' ? currentTrack.filterDecay : (currentTrack.pitchDecay ?? 0.1)}
                          min={0.01}
                          max={1.0}
                          step={0.01}
                          color={activeEnvTab === 'amp' ? '#98c379' : activeEnvTab === 'vcf' ? '#56b6c2' : '#e5c07b'}
                          height={46}
                          onChange={(v) => {
                            if (activeEnvTab === 'amp') handleTrackParamChange({ ampDecay: v, decay: v });
                            else if (activeEnvTab === 'vcf') handleTrackParamChange({ filterDecay: v });
                            else handleTrackParamChange({ pitchDecay: v });
                          }}
                        />
                        <HardwareFader
                          label={activeEnvTab === 'pit' ? 'AMT' : 'S'}
                          value={activeEnvTab === 'amp' ? (currentTrack.ampSustain ?? currentTrack.sustain) : activeEnvTab === 'vcf' ? currentTrack.filterSustain : (currentTrack.pitchEnvAmount ?? 0)}
                          min={activeEnvTab === 'pit' ? -4 : 0}
                          max={activeEnvTab === 'pit' ? 4 : 1.0}
                          step={activeEnvTab === 'pit' ? 0.1 : 0.02}
                          color={activeEnvTab === 'amp' ? '#98c379' : activeEnvTab === 'vcf' ? '#56b6c2' : '#e5c07b'}
                          height={46}
                          onChange={(v) => {
                            if (activeEnvTab === 'amp') handleTrackParamChange({ ampSustain: v, sustain: v });
                            else if (activeEnvTab === 'vcf') handleTrackParamChange({ filterSustain: v });
                            else handleTrackParamChange({ pitchEnvAmount: v });
                          }}
                        />
                        <HardwareFader
                          label={activeEnvTab === 'pit' ? '-' : 'R'}
                          value={activeEnvTab === 'amp' ? (currentTrack.ampRelease ?? currentTrack.release) : activeEnvTab === 'vcf' ? currentTrack.filterRelease : 0}
                          min={0}
                          max={1.5}
                          step={0.02}
                          color={activeEnvTab === 'pit' ? '#333' : activeEnvTab === 'amp' ? '#98c379' : '#56b6c2'}
                          height={46}
                          onChange={(v) => {
                            if (activeEnvTab === 'amp') handleTrackParamChange({ ampRelease: v, release: v });
                            else if (activeEnvTab === 'vcf') handleTrackParamChange({ filterRelease: v });
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* MODULE 5: LFO MOD (1:2 RATIO: LEFT WAVE+RATE, RIGHT 3 DIRECT TARGET KNOBS PITCH/CUT/PAN) */}
                  <div className="lg:col-span-3 border border-[#c678dd]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between h-full min-h-0 overflow-hidden">
                    {/* Header */}
                    <div className="flex justify-between items-center font-black text-[#c678dd] text-xs border-b border-white/10 pb-0.5 shrink-0">
                      <span>5. LFO MOD</span>
                      <span className="text-white/40 font-mono text-xs">──►</span>
                    </div>

                    {/* Left/Right Horizontal Split in 1 : 2 Ratio (Left: col-span-4, Right: col-span-8) */}
                    <div className="grid grid-cols-12 gap-1 items-center flex-1 min-h-0 my-auto">
                      {/* Left: 1 Part (33.3% width) - LFO 2x2 Waveform Grid + RATE Knob */}
                      <div className="col-span-4 flex flex-col justify-between items-center gap-1 border-r border-white/10 pr-1 h-full py-0.5">
                        <div className="grid grid-cols-2 gap-0.5 w-full">
                          {(['sine', 'triangle', 'square', 'sawtooth'] as LfoWaveform[]).map((w) => (
                            <button
                              key={w}
                              onClick={() => { handleTrackParamChange({ lfoWaveform: w }); playSound('click'); }}
                              title={LFO_TOOLTIPS[w] || w}
                              className={`py-1 text-[10px] sm:text-xs border rounded-xs font-black cursor-pointer leading-none text-center ${
                                currentTrack.lfoWaveform === w ? 'border-[#c678dd] bg-[#c678dd] text-black font-black' : 'border-white/20 text-white/60 hover:text-white'
                              }`}
                            >
                              {w === 'sine' ? 'SIN' : w === 'triangle' ? 'TRI' : w === 'square' ? 'SQR' : 'SAW'}
                            </button>
                          ))}
                        </div>
                        <RotaryKnob
                          label="RATE"
                          value={currentTrack.lfoRate}
                          min={0.1}
                          max={20}
                          step={0.2}
                          unit="Hz"
                          color="#c678dd"
                          size={40}
                          onChange={(v) => handleTrackParamChange({ lfoRate: v })}
                        />
                      </div>

                      {/* Right: 2 Parts (66.7% width) - 3 Direct Modulation Destination Knobs */}
                      <div className="col-span-8 flex items-center justify-around h-full py-0.5">
                        <RotaryKnob
                          label="PITCH"
                          value={Math.round((currentTrack.lfoPitchAmt ?? 0) * 100)}
                          min={0}
                          max={100}
                          step={5}
                          unit="%"
                          color="#e5c07b"
                          size={40}
                          onChange={(v) => handleTrackParamChange({ lfoPitchAmt: v / 100 })}
                        />
                        <RotaryKnob
                          label="CUTOFF"
                          value={Math.round((currentTrack.lfoCutoffAmt ?? 0) * 100)}
                          min={0}
                          max={100}
                          step={5}
                          unit="%"
                          color="#56b6c2"
                          size={40}
                          onChange={(v) => handleTrackParamChange({ lfoCutoffAmt: v / 100 })}
                        />
                        <RotaryKnob
                          label="PAN"
                          value={Math.round((currentTrack.lfoPanAmt ?? 0) * 100)}
                          min={0}
                          max={100}
                          step={5}
                          unit="%"
                          color="#98c379"
                          size={40}
                          onChange={(v) => handleTrackParamChange({ lfoPanAmt: v / 100 })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* MODULE 6: FX (5 LARGE ROTARY KNOBS IN HEXAGONAL CLOSE PACKING - 最密堆积: 上3下2交错嵌套, NO DIVIDER) */}
                  <div className="lg:col-span-2 border border-[#e06c75]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between h-full min-h-0 overflow-hidden">
                    <div className="flex justify-between items-center font-black text-[#e06c75] text-xs border-b border-white/10 pb-0.5 shrink-0">
                      <span>6. FX</span>
                      <span className="text-white/40 font-mono text-xs">──►</span>
                    </div>

                    {/* 5 Hardware FX Knobs in Hexagonal Close Packing (最密堆积: 上3下2交错嵌套, No Divider) */}
                    <div className="flex-1 min-h-0 flex flex-col justify-around py-0.5 my-auto">
                      {/* Top Row: 3 Knobs (TIME, FDBK, D-MIX) */}
                      <div className="grid grid-cols-6 gap-0.5 items-center">
                        <div className="col-span-2 flex justify-center">
                          <RotaryKnob
                            label="TIME"
                            value={Math.round(synthDelayTime * 1000)}
                            min={50}
                            max={800}
                            step={10}
                            unit="ms"
                            color="#e06c75"
                            size={40}
                            onChange={(v) => {
                              const t = v / 1000;
                              setSynthDelayTime(t);
                              modularSynth.setDelayTime(t);
                            }}
                          />
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <RotaryKnob
                            label="FDBK"
                            value={Math.round(synthDelayFeedback * 100)}
                            min={0}
                            max={85}
                            step={5}
                            unit="%"
                            color="#e06c75"
                            size={40}
                            onChange={(v) => {
                              const fb = v / 100;
                              setSynthDelayFeedback(fb);
                              modularSynth.setDelayFeedback(fb);
                            }}
                          />
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <RotaryKnob
                            label="D-MIX"
                            value={Math.round(synthDelayMix * 100)}
                            min={0}
                            max={100}
                            step={5}
                            unit="%"
                            color="#e06c75"
                            size={40}
                            onChange={(v) => {
                              const m = v / 100;
                              setSynthDelayMix(m);
                              modularSynth.setDelayMix(m);
                            }}
                          />
                        </div>
                      </div>

                      {/* Bottom Row: 2 Knobs (R-MIX, DRIVE) Nested in the Interstices */}
                      <div className="grid grid-cols-6 gap-0.5 items-center">
                        <div className="col-start-2 col-span-2 flex justify-center">
                          <RotaryKnob
                            label="R-MIX"
                            value={Math.round(synthReverbMix * 100)}
                            min={0}
                            max={100}
                            step={5}
                            unit="%"
                            color="#c678dd"
                          size={40}
                            onChange={(v) => {
                              const rm = v / 100;
                              setSynthReverbMix(rm);
                              modularSynth.setReverbMix(rm);
                            }}
                          />
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <RotaryKnob
                            label="DRIVE"
                            value={Math.round(synthDrive * 100)}
                            min={0}
                            max={100}
                            step={5}
                            unit="%"
                            color="#e5c07b"
                            size={40}
                            onChange={(v) => {
                              const d = v / 100;
                              setSynthDrive(d);
                              modularSynth.setDrive(d);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* MODULE 7: OUT (EXPANDED TO lg:col-span-4 -> WIDE SCREEN GRAPH VISUALIZER) */}
                  <div className="lg:col-span-4 border border-white/20 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[155px] lg:min-h-0 lg:h-full lg:overflow-hidden">
                    <div className="flex items-center justify-between font-black text-white text-xs border-b border-white/10 pb-0.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-xs font-black">7. OUT</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setActiveOutVisualizer('fft'); playSound('click'); }}
                            title="Visualizer Mode: FFT Log Spectrum Analyzer — Shows frequency distribution across 20Hz to 20kHz"
                            className={`px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors ${
                              activeOutVisualizer === 'fft'
                                ? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
                                : 'border-white/20 text-white/60 hover:text-white'
                            }`}
                          >
                            FFT
                          </button>
                          <button
                            onClick={() => { setActiveOutVisualizer('scope'); playSound('click'); }}
                            title="Visualizer Mode: Oscilloscope Waveform — Real-time time-domain audio wave display"
                            className={`px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors ${
                              activeOutVisualizer === 'scope'
                                ? 'border-[#98c379] bg-[#98c379] text-black font-black'
                                : 'border-white/20 text-white/60 hover:text-white'
                            }`}
                          >
                            SCOPE
                          </button>
                          <button
                            onClick={() => { setActiveOutVisualizer('loudness'); playSound('click'); }}
                            title="Visualizer Mode: RMS Loudness Meter & History — Real-time dynamic decibel range (-60dB to +6dB)"
                            className={`px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors ${
                              activeOutVisualizer === 'loudness'
                                ? 'border-[#e06c75] bg-[#e06c75] text-black font-black'
                                : 'border-white/20 text-white/60 hover:text-white'
                            }`}
                          >
                            LOUD
                          </button>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-white/50">60 FPS</span>
                    </div>

                    {/* Left / Right 2-Column Split (Left: col-span-3, Right: col-span-9 Wide Screen) */}
                    <div className="grid grid-cols-12 gap-1.5 items-center flex-1 min-h-0 my-auto">
                      {/* Left: PAN and VOL Stacked Vertically (Large 28px) */}
                      <div className="col-span-3 flex flex-col justify-around items-center border-r border-white/10 pr-1 h-full py-0.5">
                        <RotaryKnob
                          label="PAN"
                          value={Math.round(currentTrack.pan * 100)}
                          min={-100}
                          max={100}
                          step={5}
                          unit=""
                          color="#56b6c2"
                          size={28}
                          onChange={(v) => handleTrackParamChange({ pan: v / 100 })}
                        />
                        <RotaryKnob
                          label="VOL"
                          value={Math.round(currentTrack.volume * 100)}
                          min={0}
                          max={100}
                          unit="%"
                          color="#98c379"
                          size={28}
                          onChange={(v) => handleTrackParamChange({ volume: v / 100 })}
                        />
                      </div>

                      {/* Right: Full-Screen Ultra-Wide High-Resolution Single Visualizer Canvas */}
                      <div className="col-span-9 flex flex-col justify-between border border-white/15 bg-black/90 rounded-xs p-1 h-full">
                        <div className="flex items-center justify-between text-[10px] font-mono text-white/50 px-1 pb-0.5 border-b border-white/10 shrink-0">
                          <span className={activeOutVisualizer === 'fft' ? 'text-[#56b6c2] font-black' : activeOutVisualizer === 'scope' ? 'text-[#98c379] font-black' : 'text-[#e06c75] font-black'}>
                            {activeOutVisualizer === 'fft' ? 'FFT LOG SPECTRUM' : activeOutVisualizer === 'scope' ? 'OSCILLOSCOPE WAVE' : 'RMS LOUDNESS GRAPH'}
                          </span>
                          {activeOutVisualizer === 'fft' ? (
                            <span className="text-[9px] text-white/50 font-bold">20Hz-20k</span>
                          ) : activeOutVisualizer === 'loudness' ? (
                            <span className="text-[9px] text-white/50 font-bold">-60dB to +6dB</span>
                          ) : (
                            <div className="flex items-center gap-0.5">
                              {(['0.5x', '1x', '2x', '4x', '8x', '16x'] as const).map((tb) => (
                                <button
                                  key={tb}
                                  onClick={() => { setTimeBase(tb); playSound('click'); }}
                                  className={`px-1 py-0.2 rounded-xs border text-[8px] cursor-pointer font-black leading-none ${
                                    timeBase === tb
                                      ? 'border-[#98c379] bg-[#98c379] text-black font-black'
                                      : 'border-white/20 text-white/60 hover:text-white'
                                  }`}
                                >
                                  {tb}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="relative flex-1 min-h-[46px] rounded-xs overflow-hidden mt-0.5">
                          <canvas
                            ref={fftCanvasRef}
                            width={360}
                            height={46}
                            className={`w-full h-full ${activeOutVisualizer === 'fft' ? 'block' : 'hidden'}`}
                          />
                          <canvas
                            ref={waveCanvasRef}
                            width={360}
                            height={46}
                            className={`w-full h-full ${activeOutVisualizer === 'scope' ? 'block' : 'hidden'}`}
                          />
                          <canvas
                            ref={loudnessCanvasRef}
                            width={360}
                            height={46}
                            className={`w-full h-full ${activeOutVisualizer === 'loudness' ? 'block' : 'hidden'}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

              </div>


            </div>
          )}

          {/* BOTTOM COMMAND PROMPT (DISPLAYED ONLY ON NON-SYNTH TABS 0-3) */}
          {activeTab !== 4 && (
            <div className="border-t border-white/10 pt-3 space-y-2 shrink-0">
              {commandHistory.length > 0 && (
                <div className="text-xs sm:text-sm opacity-60 space-y-0.5">
                  {commandHistory.map((h, i) => (
                    <div key={i}>{h}</div>
                  ))}
                </div>
              )}
              <div className="text-xs sm:text-sm text-[#98c379] font-bold">{commandOutput}</div>

              <form
                onSubmit={handleCommandSubmit}
                onClick={() => cmdInputRef.current?.focus()}
                className="flex items-center gap-2 sm:gap-2.5 border border-white/25 bg-black/60 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xs cursor-text relative min-h-[40px] sm:min-h-[42px] max-w-full"
              >
                <span className="font-black text-sm select-none" style={{ color: themeStyles.cursorColor }}>:</span>
                
                <div className="relative flex-1 flex items-center font-mono text-sm sm:text-base text-[#eceff4] min-h-[24px] overflow-hidden">
                  <span className="whitespace-pre">{commandInput}</span>
                  <span
                    className="inline-block w-[9px] h-[18px] ml-0.5 align-middle shrink-0 transition-opacity duration-75"
                    style={{
                      backgroundColor: themeStyles.cursorColor,
                      opacity: pulseStep % 6 < 4 ? 0.95 : 0.15,
                    }}
                  />
                  {!commandInput && (
                    <span className="text-xs opacity-40 ml-1.5 sm:ml-2 select-none pointer-events-none truncate block">
                      Type command (e.g. 'eval 2**16', 'seq play', 'bpm 100', 'help')...
                    </span>
                  )}

                  <input
                    ref={cmdInputRef}
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-text outline-none font-mono z-10"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="text-xs sm:text-sm uppercase font-bold cursor-pointer z-20 hover:opacity-80"
                  style={{ color: themeStyles.cursorColor }}
                >
                  [EXEC]
                </button>
              </form>
            </div>
          )}

        </div>

      </div>

      {/* 3. BOTTOM HARDWARE TELEMETRY FOOTER */}
      <footer className={`w-full max-w-full ${themeStyles.headerBg} px-2.5 sm:px-3 py-1.5 sm:py-2 flex flex-wrap items-center justify-between font-bold text-xs sm:text-sm tracking-wide border ${themeStyles.border} rounded-b-sm mt-1.5 sm:mt-2 gap-1.5`}>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span>[0] 0:krsz.in*</span>
          <span className="opacity-40 text-white/30 hidden sm:inline">|</span>
          <a
            href="https://github.com/kurashizu"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playSound('click')}
            title="GitHub Profile — Open https://github.com/kurashizu in a new tab"
            className="hover:underline flex items-center gap-1 text-[#61afef] hover:text-[#98c379] transition-colors"
          >
            <PixelGitHub size={13} />
            <span>1:gh/kurashizu</span>
          </a>
          <a
            href="https://huggingface.co/kurashizu"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playSound('click')}
            title="Hugging Face AI Models Hub — Open https://huggingface.co/kurashizu in a new tab"
            className="hover:underline flex items-center gap-1 text-[#e5c07b] hover:text-[#e06c75] transition-colors"
          >
            <PixelHuggingFace size={13} />
            <span>2:hf/kurashizu</span>
          </a>
          <a
            href="https://oshwhub.com/Kurashizu"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playSound('click')}
            title="OSHWHub Hardware Projects & PCB Schematics — Open https://oshwhub.com/Kurashizu in a new tab"
            className="hover:underline flex items-center gap-1 text-[#e06c75] hover:text-[#56b6c2] transition-colors"
          >
            <PixelHardware size={13} />
            <span>3:oshwhub</span>
          </a>
          <a
            href="https://skill.krsz.in/rules"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playSound('click')}
            title="Skill & System Rules Reference — Open https://skill.krsz.in/rules in a new tab"
            className="hover:underline flex items-center gap-1 text-[#98c379] hover:text-[#56b6c2] transition-colors"
          >
            <PixelRules size={13} />
            <span>4:rules</span>
          </a>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-[#e06c75] hidden sm:inline">"krsz-edge-node"</span>
          <span className="text-[#98c379] text-[11px] sm:text-xs">STATUS: 0ms COLD START</span>
        </div>
      </footer>

    </div>
  );
};
