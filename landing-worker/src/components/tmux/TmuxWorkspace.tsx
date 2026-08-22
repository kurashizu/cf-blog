import React, { useState, useEffect, useRef } from 'react';
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
  PIANO_ROLL_NOTES,
  TrackData,
  INITIAL_TRACKS,
} from '../../lib/synth';
import { RotaryKnob, HardwareFader } from '../synth/HardwareControls';
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

export const TmuxWorkspace: React.FC = () => {
  const [theme, setTheme] = useState<WorkspaceTheme>('tokyo-matte');
  const [activeTab, setActiveTab] = useState<number>(0);
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
  const [synthDelayMix, setSynthDelayMix] = useState<number>(0.18);
  const [synthReverbMix, setSynthReverbMix] = useState<number>(0.15);
  const [octaveScope, setOctaveScope] = useState<'all' | 7 | 6 | 5 | 4 | 3 | 2 | 1>(4);
  const [activeTrackId, setActiveTrackId] = useState<number>(0);
  const [tracksState, setTracksState] = useState(modularSynth.getTracks());
  const [isSeqPlaying, setIsSeqPlaying] = useState<boolean>(false);
  const [seqCurrentStep, setSeqCurrentStep] = useState<number>(0);
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cmdInputRef = useRef<HTMLInputElement | null>(null);

  // Subscribe to Multi-Track Sequencer Tick with Auto Page-Follow
  useEffect(() => {
    const unsub = modularSynth.subscribeStep((step) => {
      setSeqCurrentStep(step);
      if (pageFollow) {
        const p = Math.floor(step / 16);
        setActiveStepPage(p);
      }
    });
    return () => unsub();
  }, [pageFollow]);

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
      if (key === '0') { setActiveTab(0); playSound('click'); return; }
      if (key === '1') { setActiveTab(1); playSound('click'); return; }
      if (key === '2') { setActiveTab(2); playSound('click'); return; }
      if (key === '3') { setActiveTab(3); playSound('click'); return; }
      if (key === '4') { setActiveTab(4); playSound('click'); return; }
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
    const actualStep = activeStepPage * 16 + colIndex;
    modularSynth.toggleTrackCell(activeTrackId, actualStep, noteIndex);
    setTracksState([...modularSynth.getTracks()]);

    const activeNotes = modularSynth.getTrack(activeTrackId)?.grid[actualStep] || [];
    if (activeNotes.includes(noteIndex)) {
      modularSynth.triggerTrackVoice(activeTrackId, noteIndex, tracksState[activeTrackId].accents[actualStep] || false);
    } else {
      playSound('click');
    }
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
        setCommandOutput(`BPM set to ${val}.`);
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

  // Canvas oscilloscope for Master Audio
  useEffect(() => {
    if (activeTab !== 4) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const render = () => {
      animId = requestAnimationFrame(render);
      const data = sound.getVisualizerData();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = themeStyles.cursorColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();

      if (data && !isMuted) {
        const sliceWidth = canvas.width / data.length;
        let x = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 128.0;
          const y = (v * canvas.height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
      } else {
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
      }
      ctx.stroke();
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [activeTab, isMuted, theme]);

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

  const currentTrack = tracksState[activeTrackId];

  return (
    <div className={`w-full min-h-screen font-mono text-sm sm:text-base ${themeStyles.bg} ${themeStyles.text} flex flex-col justify-between select-none p-2 sm:p-4 transition-colors duration-200`}>
      
      {/* 1. TOP STATUS BAR */}
      <header className={`w-full ${themeStyles.headerBg} px-3 py-2 flex items-center justify-between font-bold text-xs sm:text-sm tracking-wider border ${themeStyles.border} rounded-t-sm mb-2`}>
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
          <span className="bg-black/40 px-2.5 py-1 rounded text-xs sm:text-sm text-[#56b6c2] flex items-center gap-2">
            <span className="text-[#e5c07b] font-mono">{SPINNER_FRAMES[spinnerFrame]}</span>
            <span>[tmux:krsz-edge]</span>
          </span>

          <button onClick={() => { setActiveTab(0); playSound('click'); }} className={`px-3 py-1 cursor-pointer rounded transition-colors ${activeTab === 0 ? 'bg-[#56b6c2] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>0:cluster</button>
          <button onClick={() => { setActiveTab(1); playSound('click'); }} className={`px-3 py-1 cursor-pointer rounded transition-colors ${activeTab === 1 ? 'bg-[#e5c07b] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>1:modules</button>
          <button onClick={() => { setActiveTab(2); playSound('click'); }} className={`px-3 py-1 cursor-pointer rounded transition-colors ${activeTab === 2 ? 'bg-[#98c379] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>2:topology</button>
          <button onClick={() => { setActiveTab(3); playSound('click'); }} className={`px-3 py-1 cursor-pointer rounded transition-colors ${activeTab === 3 ? 'bg-[#e06c75] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>3:guestbook</button>
          <button onClick={() => { setActiveTab(4); playSound('click'); }} className={`px-3 py-1 cursor-pointer rounded transition-colors ${activeTab === 4 ? 'bg-[#c678dd] text-black font-black' : 'hover:bg-white/10 text-[#d8dee9]'}`}>4:synth</button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0 text-xs sm:text-sm">
          <span className="text-[#c678dd] hidden xl:inline font-mono">{renderBrailleSpark(0)}</span>
          <button onClick={cycleTheme} className="hover:underline cursor-pointer hidden md:inline text-[#e5c07b]">[THEME: {theme.toUpperCase()}]</button>
          <span className="tabular-nums text-[#98c379]">SYDNEY {sydneyTime || '12:14:00'}</span>
          <span className="bg-black/40 px-2 py-0.5 text-[#56b6c2] hidden lg:inline">100%_SERVERLESS</span>
        </div>
      </header>

      {/* 2. MAIN MULTI-PANE WORKSPACE */}
      <div className="grid grid-cols-12 gap-2 flex-1 min-h-0">
        
        {/* LEFT PANE: IDENTITY, TELEMETRY & SYSTEM RADAR (4 Cols) */}
        <div className={`col-span-12 lg:col-span-4 border ${themeStyles.border} p-2.5 sm:p-3 flex flex-col gap-2 ${themeStyles.cardBg} rounded-sm min-h-0 overflow-hidden`}>
          
          {/* 1. ASCII BRAND & ACRONYM BREAKDOWN */}
          <div className="border border-white/15 p-2 bg-black/40 rounded-xs shrink-0 space-y-1.5">
            <div className="text-xs sm:text-sm font-bold text-[#56b6c2] flex items-center justify-between border-b border-white/10 pb-0.5">
              <span>┌─[ SYS_BANNER // KRSZ.IN ]─┐</span>
              <span className="text-[#98c379] font-mono text-xs flex items-center gap-1">
                <span>{SPINNER_FRAMES[(spinnerFrame + 3) % 10]} RUNNING</span>
              </span>
            </div>
            
            <pre className="text-xs leading-none font-black tracking-tight text-[#e5c07b] overflow-x-hidden select-none py-0.5">
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

          {/* 2. REAL-TIME EDGE TELEMETRY & ISOLATE METRICS (ENLARGED TYPOGRAPHY & COMFORTABLE RHYTHM) */}
          <div className="border border-white/15 p-3 sm:p-3.5 bg-black/40 rounded-xs flex-1 min-h-0 flex flex-col justify-between text-xs sm:text-sm font-mono">
            <div className="text-xs sm:text-sm font-bold text-[#98c379] flex items-center justify-between border-b border-white/10 pb-1 shrink-0">
              <span>┌─[ EDGE_TELEMETRY ]─┐</span>
              <span className="text-white/50 text-xs font-mono">{sydneyTime} AEST</span>
            </div>
            
            <div className="space-y-2 py-1.5 text-xs sm:text-sm">
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

            <div className="border-t border-white/10 pt-1.5 text-xs text-white/50 flex justify-between shrink-0 font-mono">
              <span>REGION: AP-SOUTHEAST-2 (SYD)</span>
              <span>ISOLATE: #4902-ACTIVE</span>
            </div>
          </div>

          {/* 3. OPERATOR SPECS & PHILOSOPHY (ENLARGED TYPOGRAPHY & COMFORTABLE RHYTHM) */}
          <div className="border border-white/15 p-3 sm:p-3.5 bg-black/40 rounded-xs flex-1 min-h-0 flex flex-col justify-between text-xs sm:text-sm font-mono">
            <div className="text-xs sm:text-sm font-bold text-[#61afef] flex items-center justify-between border-b border-white/10 pb-1 shrink-0">
              <span>┌─[ OPERATOR_PROFILE ]─┐</span>
              <span className="text-xs text-[#98c379] font-bold border border-[#98c379]/40 bg-[#98c379]/15 px-1.5 py-0.2 rounded-xs">VERIFIED</span>
            </div>
            <div className="space-y-2 py-1.5 text-xs sm:text-sm leading-relaxed">
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
            <div className="border-t border-white/10 pt-1.5 text-xs text-[#98c379] shrink-0 font-bold flex items-center justify-between">
              <span>STATUS: OPEN FOR RESEARCH</span>
              <span>AVAILABLE NOW</span>
            </div>
          </div>

          {/* 4. INTERACTIVE HOTKEYS QUICK-SWITCH PANEL (TACTILE SQUARE LAUNCHPAD TILES) */}
          <div className="border border-white/15 p-2 bg-black/40 rounded-xs flex-1 min-h-0 flex flex-col justify-between text-xs">
            <div className="text-xs font-bold text-[#e5c07b] flex items-center justify-between border-b border-white/10 pb-0.5 shrink-0">
              <span>┌─[ QUICK_HOTKEYS // LAUNCHPAD ]─┐</span>
              <span className="text-white/50 text-xs">[0-4, T]</span>
            </div>

            {/* 3x2 Tactile Square Launchpad Grid */}
            <div className="grid grid-cols-3 gap-1.5 py-1 flex-1 min-h-0">
              {[
                { id: 0, key: '0', title: 'OVERVIEW', desc: 'Cluster', color: '#56b6c2', icon: '⊞' },
                { id: 1, key: '1', title: 'MODULES', desc: 'Specs', color: '#e5c07b', icon: '◈' },
                { id: 2, key: '2', title: 'TOPOLOGY', desc: 'Edge PoP', color: '#98c379', icon: '☊' },
                { id: 3, key: '3', title: 'GUESTBOOK', desc: 'Packets', color: '#e06c75', icon: '✉' },
                { id: 4, key: '4', title: 'SYNTH', desc: 'WebAudio', color: '#c678dd', icon: '♫' },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); playSound('click'); }}
                    className={`border rounded-xs p-1.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all active:scale-95 group relative overflow-hidden ${
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

          {/* 5. VERIFIED EXTERNAL HUB GATEWAYS */}
          <div className="border border-white/15 p-2 bg-black/40 rounded-xs flex flex-wrap items-center justify-between gap-1.5 text-xs shrink-0">
            <a
              href="https://github.com/kurashizu"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playSound('click')}
              className="hover:underline flex items-center gap-1 text-[#61afef] hover:text-[#98c379] transition-colors text-xs"
            >
              <PixelGitHub size={14} />
              <span>gh/kurashizu</span>
            </a>
            <a
              href="https://huggingface.co/kurashizu"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playSound('click')}
              className="hover:underline flex items-center gap-1 text-[#e5c07b] hover:text-[#e06c75] transition-colors text-xs"
            >
              <PixelHuggingFace size={14} />
              <span>hf/kurashizu</span>
            </a>
            <a
              href="https://oshwhub.com/Kurashizu"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playSound('click')}
              className="hover:underline flex items-center gap-1 text-[#e06c75] hover:text-[#56b6c2] transition-colors text-xs"
            >
              <PixelHardware size={14} />
              <span>oshwhub</span>
            </a>
            <a
              href="https://skill.krsz.in/rules"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playSound('click')}
              className="hover:underline flex items-center gap-1 text-[#98c379] hover:text-[#56b6c2] transition-colors text-xs"
            >
              <PixelRules size={14} />
              <span>rules</span>
            </a>
          </div>
        </div>

        {/* RIGHT PANE: ACTIVE WORKBENCH WINDOW (8 Cols) */}
        <div className={`col-span-12 lg:col-span-8 border ${themeStyles.border} ${activeTab === 4 ? 'p-2 sm:p-3 space-y-1.5' : 'p-3 sm:p-4 space-y-2'} flex flex-col justify-between ${themeStyles.cardBg} rounded-sm min-h-0 overflow-hidden`}>
          
          {/* TAB 0: CLUSTER OVERVIEW */}
          {activeTab === 0 && (
            <div className="space-y-4 flex-1">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <pre className="text-xs font-black tracking-tight text-[#56b6c2] leading-tight">
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
                      onClick={() => { setSelectedModule(m); setActiveTab(1); playSound('click'); }}
                      style={{ backgroundColor: m.bgTint, borderColor: m.borderColor }}
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

              <div className="border border-white/10 p-3.5 bg-black/30 font-mono text-xs sm:text-sm leading-relaxed rounded-xs">
                <div className="font-bold text-xs text-[#e5c07b] mb-1">┌─[ ANYCAST PIPELINE MAP ]─────────────────────────────────────────┐</div>
                <pre className="text-xs sm:text-sm text-[#d8dee9] opacity-90 overflow-x-auto whitespace-pre">
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
            <div className="space-y-4 flex-1">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <pre className="text-xs font-black tracking-tight text-[#e5c07b] leading-tight">
{`███╗   ███╗ ██████╗ ██████╗ ██╗   ██╗██╗     ███████╗███████╗
████╗ ████║██╔═══██╗██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
██╔████╔██║██║   ██║██║  ██║██║   ██║██║     █████╗  ███████╗
██║╚██╔╝██║██║   ██║██║  ██║██║   ██║██║     ██╔══╝  ╚════██║
██║ ╚═╝ ██║╚██████╔╝██████╔╝╚██████╔╝███████╗███████╗███████║
╚═╝     ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝╚══════╝╚══════╝`}
                </pre>
                <div className="flex items-center gap-1.5 text-xs sm:text-sm overflow-x-auto no-scrollbar">
                  {MODULES.map((m) => (
                    <button key={m.id} onClick={() => { setSelectedModule(m); playSound('click'); }} className={`px-2.5 py-1 border rounded-xs cursor-pointer transition-colors ${selectedModule.id === m.id ? 'border-white bg-white/20 text-white font-bold' : 'border-white/20 hover:border-white/60 opacity-70'}`} style={{ color: selectedModule.id === m.id ? m.color : undefined }}>{m.id}</button>
                  ))}
                </div>
              </div>

              <div style={{ backgroundColor: selectedModule.bgTint, borderColor: selectedModule.borderColor }} className="border p-5 rounded-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs opacity-70 font-bold" style={{ color: selectedModule.color }}>NODE_ID // {selectedModule.badge}</span>
                    <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2 mt-0.5">
                      <span style={{ color: selectedModule.color }}>{selectedModule.name}</span>
                      <span className="text-xs font-normal border border-current px-2 py-0.5 rounded-xs">{selectedModule.tag}</span>
                    </h3>
                  </div>
                  <a href={selectedModule.url} target="_blank" rel="noopener noreferrer" onClick={() => playSound('click')} style={{ backgroundColor: selectedModule.color }} className="px-4 py-2 rounded-xs text-black font-bold text-xs sm:text-sm flex items-center gap-1.5 hover:opacity-90 transition-opacity">
                    <span>LAUNCH</span>
                    <PixelArrowUpRight size={16} />
                  </a>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-[#eceff4]">{selectedModule.desc}</p>
                <div className="grid grid-cols-3 gap-3 text-xs sm:text-sm">
                  {selectedModule.metrics.map((m, i) => (
                    <div key={i} className="border border-white/10 p-3 bg-black/40 rounded-xs">
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
            <div className="space-y-3.5 flex-1">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <pre className="text-xs font-black tracking-tight text-[#98c379] leading-tight overflow-x-hidden">
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

              <div className="border border-[#98c379]/30 p-4 bg-black/40 overflow-x-auto font-mono text-xs sm:text-sm leading-tight rounded-xs">
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
            <div className="space-y-3.5 flex-1">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <pre className="text-xs font-black tracking-tight text-[#e06c75] leading-tight overflow-x-hidden">
{` ██████╗ ██╗   ██╗███████╗███████╗████████╗██████╗  ██████╗  ██████╗ ██╗  ██╗
██╔════╝ ██║   ██║██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗██╔═══██╗██║ ██╔╝
██║  ███╗██║   ██║█████╗  ███████╗   ██║   ██████╔╝██║   ██║██║   ██║█████╔╝ 
██║   ██║██║   ██║██╔══╝  ╚════██║   ██║   ██╔══██╗██║   ██║██║   ██║██╔═██╗ 
╚██████╔╝╚██████╔╝███████╗███████║   ██║   ██████╔╝╚██████╔╝╚██████╔╝██║  ██╗
 ╚═════╝  ╚═════╝ ╚══════╝╚══════╝   ╚═╝   ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝`}
                </pre>
                <div className="flex items-center gap-2 text-xs sm:text-sm shrink-0">
                  <button onClick={() => handleCopy('krsz.dev@gmail.com')} className="border border-[#e06c75] px-2.5 py-0.5 rounded-xs text-[#e06c75] hover:bg-[#e06c75] hover:text-black cursor-pointer transition-colors">[krsz.dev@gmail.com]</button>
                  <button onClick={() => handleCopy('admin@krsz.in')} className="border border-[#e06c75] px-2.5 py-0.5 rounded-xs text-[#e06c75] hover:bg-[#e06c75] hover:text-black cursor-pointer transition-colors">[admin@krsz.in]</button>
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
              
              {/* 1. TOP MASTER TRANSPORT & MULTI-TRACK MIXER DECK (WITH INLINE MUTE/SOLO & BAR NAVIGATION) */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1 bg-black/30 p-1 rounded-xs shrink-0">
                {/* Transport & Track Selectors */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const playing = modularSynth.toggleSequencer();
                      setIsSeqPlaying(playing);
                      playSound('click');
                    }}
                    className={`px-3 py-0.5 rounded-xs font-black text-xs cursor-pointer transition-all flex items-center gap-1.5 ${
                      isSeqPlaying
                        ? 'bg-[#e06c75] text-black shadow-[0_0_8px_#e06c75]'
                        : 'bg-[#98c379] text-black hover:opacity-90'
                    }`}
                  >
                    <span>{isSeqPlaying ? '■ STOP' : '► PLAY'}</span>
                    <span className="text-xs opacity-80 font-mono">[{synthBpm} BPM]</span>
                  </button>

                  {/* Multi-Track Channel Selectors with Inline Mute/Solo */}
                  <div className="flex items-center gap-1">
                    {tracksState.map((trk) => {
                      const isSelected = activeTrackId === trk.id;
                      return (
                        <div
                          key={trk.id}
                          className={`flex items-center border rounded-xs transition-all ${
                            isSelected
                              ? 'border-white bg-white/20 text-white shadow-sm'
                              : 'border-white/20 text-[#eceff4] opacity-80 hover:opacity-100'
                          }`}
                        >
                          <button
                            onClick={() => { setActiveTrackId(trk.id); playSound('click'); }}
                            className="px-2 py-0.5 font-bold text-xs cursor-pointer flex items-center gap-1.5"
                            style={{ color: isSelected ? trk.color : undefined }}
                          >
                            <span className="w-2 h-2 inline-block shrink-0" style={{ backgroundColor: trk.color }} />
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

                {/* Dynamic Pattern Length (16/32/64/128/256/512) & Bar Page Navigation */}
                <div className="flex items-center gap-2 text-xs">
                  {/* Sequence Length */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="opacity-60">LEN:</span>
                    {([16, 32, 64, 128, 256, 512] as const).map((len) => (
                      <button
                        key={len}
                        onClick={() => {
                          setTotalPatternSteps(len);
                          modularSynth.setTotalSteps(len);
                          if (activeStepPage >= Math.ceil(len / 16)) setActiveStepPage(0);
                          playSound('click');
                        }}
                        className={`px-1 py-0.5 border rounded-xs font-bold cursor-pointer ${
                          totalPatternSteps === len
                            ? 'border-[#98c379] bg-[#98c379] text-black'
                            : 'border-white/20 text-white/70 hover:border-white/50'
                        }`}
                      >
                        {len}
                      </button>
                    ))}
                  </div>

                  {/* Bar / Page Tabs (Supports up to 32 Bars for 512 Steps) */}
                  <div className="flex items-center gap-0.5 text-xs border-l border-white/15 pl-1.5 max-w-[180px] sm:max-w-[340px] overflow-x-auto no-scrollbar">
                    <span className="opacity-60 shrink-0">BAR:</span>
                    {Array.from({ length: Math.ceil(totalPatternSteps / 16) }).map((_, pIdx) => {
                      const isPlayingThis = isSeqPlaying && Math.floor(seqCurrentStep / 16) === pIdx;
                      const isViewing = activeStepPage === pIdx;
                      return (
                        <button
                          key={pIdx}
                          onClick={() => { setActiveStepPage(pIdx); playSound('click'); }}
                          className={`px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-all flex items-center gap-1 shrink-0 ${
                            isViewing
                              ? 'border-white bg-white/25 text-white shadow-sm'
                              : 'border-white/20 text-white/50 hover:text-white'
                          }`}
                        >
                          <span>{pIdx + 1}</span>
                          {isPlayingThis && <span className="w-1.5 h-1.5 bg-[#98c379] inline-block animate-pulse shrink-0" />}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => { setPageFollow(!pageFollow); playSound('click'); }}
                      className={`px-1.5 py-0.5 border rounded-xs text-xs font-bold cursor-pointer shrink-0 ${
                        pageFollow ? 'border-[#98c379] text-[#98c379] bg-[#98c379]/15' : 'border-white/20 text-white/40'
                      }`}
                      title="Auto-follow playhead bar"
                    >
                      FLW
                    </button>
                  </div>

                  {/* Tempo & Mute */}
                  <div className="flex items-center gap-1 text-xs border-l border-white/15 pl-1.5">
                    <span className="opacity-70">BPM:</span>
                    <input
                      type="range"
                      min="60"
                      max="220"
                      value={synthBpm}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setSynthBpm(val);
                        modularSynth.setBpm(val);
                      }}
                      className="w-12 accent-[#98c379] h-1"
                    />
                    <span className="text-[#98c379] font-bold font-mono">{synthBpm}</span>
                  </div>

                  <button
                    onClick={() => {
                      const m = sound.toggleMute();
                      setIsMuted(m);
                      if (!m) playSound('click');
                    }}
                    className="border border-[#c678dd] px-2 py-0.5 rounded-xs text-xs font-bold text-[#c678dd] hover:bg-[#c678dd] hover:text-black cursor-pointer transition-colors"
                  >
                    [{isMuted ? 'UNMUTE' : 'MUTE'}]
                  </button>
                </div>
              </div>

              {/* 2. FULL-BLEED 3-OCTAVE PIANO ROLL MATRIX (8-VOICE POLYPHONIC + DYNAMIC 512 STEPS) */}
              <div className="border border-white/20 p-1.5 bg-black/60 rounded-xs flex-1 min-h-0 flex flex-col overflow-hidden gap-1">
                {/* Header with Title, Playhead Tracker, Octaves & Presets */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs font-bold shrink-0">
                  <div className="flex items-center gap-2">
                    <span style={{ color: currentTrack.color }}>
                      PIANO ROLL // {currentTrack.name} (8-VOICE POLY)
                    </span>
                    <span className="text-xs text-[#98c379] font-mono">
                      PLAYHEAD: STEP {seqCurrentStep + 1} / {totalPatternSteps} (BAR {Math.floor(seqCurrentStep / 16) + 1} • {(seqCurrentStep % 16) + 1})
                    </span>
                  </div>

                  {/* Right Header Toolbar: Pattern Presets & Octave Scope */}
                  <div className="flex items-center gap-2 text-xs">
                    {/* Quick Pattern Presets */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          // Reload Super Mario Theme Score (Authentic Complete 512-Step NES Score)
                          INITIAL_TRACKS.forEach((initT, trkId) => {
                            initT.grid.forEach((notes, sIdx) => {
                              modularSynth.setTrackStepNotes(trkId, sIdx, notes);
                            });
                          });
                          modularSynth.setTotalSteps(512);
                          setTotalPatternSteps(512);
                          setSynthBpm(100);
                          modularSynth.setBpm(100);
                          setTracksState([...modularSynth.getTracks()]);
                          playSound('power');
                        }}
                        className="border border-[#e06c75] bg-[#e06c75]/20 text-[#e06c75] px-1.5 py-0.5 rounded-xs hover:bg-[#e06c75] hover:text-black cursor-pointer font-black flex items-center gap-1"
                        title="Load Super Mario Bros Overworld 512-Step Complete Score"
                      >
                        <span>🍄 MARIO</span>
                      </button>

                      <button
                        onClick={() => {
                          // Random Chord Arp
                          for (let i = 0; i < 16; i++) {
                            const actualStep = activeStepPage * 16 + i;
                            const root = Math.floor(Math.random() * 24) + 24;
                            const chord = Math.random() > 0.4 ? [root, root + 4, root + 7].filter((n) => n < 88) : [];
                            modularSynth.setTrackStepNotes(activeTrackId, actualStep, chord);
                          }
                          setTracksState([...modularSynth.getTracks()]);
                          playSound('toggle');
                        }}
                        className="border border-white/20 px-1.5 py-0.5 rounded-xs hover:border-white/60 cursor-pointer"
                      >
                        🎲 RND
                      </button>

                      <button
                        onClick={() => {
                          for (let i = 0; i < 16; i++) {
                            const actualStep = activeStepPage * 16 + i;
                            modularSynth.clearTrackStep(activeTrackId, actualStep);
                          }
                          setTracksState([...modularSynth.getTracks()]);
                          playSound('click');
                        }}
                        className="border border-white/20 px-1.5 py-0.5 rounded-xs hover:border-red-400 text-red-300 cursor-pointer"
                        title="Clear current bar"
                      >
                        ✕ CLR
                      </button>
                    </div>

                    <span className="opacity-30">|</span>

                    {/* Octave Scope Quick Selectors (Full 88 Piano Keys) */}
                    <div className="flex items-center gap-1">
                      <span className="opacity-60">OCTAVES:</span>
                      {(['all', 6, 5, 4, 3, 2, 1] as const).map((sc) => (
                        <button
                          key={sc}
                          onClick={() => { setOctaveScope(sc); playSound('click'); }}
                          className={`px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors ${
                            octaveScope === sc
                              ? 'border-white bg-white/20 text-white shadow-sm'
                              : 'border-white/20 text-[#eceff4] opacity-70 hover:opacity-100'
                          }`}
                        >
                          {sc === 'all' ? 'ALL 88' : `OCT ${sc}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top 16-Step Timeline Bar / Ruler for Current Bar */}
                <div className="flex items-center gap-1 pl-10 pr-0.5 text-xs font-mono text-white/50 border-b border-white/10 pb-0.5 shrink-0">
                  <div
                    className="flex-1 gap-0.5"
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                  >
                    {Array.from({ length: 16 }).map((_, colIdx) => {
                      const actualStep = activeStepPage * 16 + colIdx;
                      const isCurrent = isSeqPlaying && seqCurrentStep === actualStep;
                      const isDownbeat = colIdx % 4 === 0;
                      const barNum = activeStepPage + 1;
                      const beatNum = Math.floor(colIdx / 4) + 1;
                      return (
                        <div
                          key={colIdx}
                          className={`text-center py-0.5 rounded-xs transition-colors ${
                            isCurrent
                              ? 'bg-white text-black font-black shadow-[0_0_6px_#fff]'
                              : isDownbeat
                              ? 'bg-white/15 text-white font-bold'
                              : 'text-white/40'
                          }`}
                        >
                          {isDownbeat ? `${barNum}.${beatNum}` : actualStep + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 36 / 12 Chromatic Pitch Rows x 16 Steps Grid (Polyphonic up to 8 notes) */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 font-mono text-xs pr-0.5 flex flex-col">
                  {PIANO_ROLL_NOTES.filter((n) => octaveScope === 'all' || n.oct === octaveScope).map((nInfo) => {
                    const actualIdx = PIANO_ROLL_NOTES.findIndex((p) => p.note === nInfo.note);
                    const isRootC = nInfo.note.startsWith('C') && !nInfo.note.includes('#');

                    return (
                      <div
                        key={nInfo.note}
                        className={`flex items-center gap-1 shrink-0 ${
                          octaveScope === 'all' ? 'min-h-[16px] h-4.5' : 'flex-1 min-h-[18px]'
                        }`}
                      >
                        {/* Playable Interactive Note Key Badge */}
                        <button
                          type="button"
                          onClick={() => {
                            modularSynth.triggerTrackVoice(activeTrackId, actualIdx, false);
                            playSound('click');
                          }}
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

                        {/* 16 Step Horizontal Grid Cells (Polyphonic Multi-Voice Selection) */}
                        <div
                          className="flex-1 h-full gap-0.5"
                          style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                        >
                          {Array.from({ length: 16 }).map((_, colIdx) => {
                            const actualStep = activeStepPage * 16 + colIdx;
                            const stepNotes = currentTrack.grid[actualStep] || [];
                            const isSelected = stepNotes.includes(actualIdx);
                            const isCurrent = isSeqPlaying && seqCurrentStep === actualStep;
                            const isBarStart = colIdx % 4 === 0;

                            return (
                              <button
                                key={colIdx}
                                onClick={() => handlePianoRollCellClick(actualIdx, colIdx)}
                                className={`h-full rounded-xs transition-all cursor-pointer border ${
                                  isSelected
                                    ? 'shadow-sm scale-[1.02]'
                                    : isCurrent
                                    ? 'border-white/60 bg-white/25'
                                    : isBarStart
                                    ? 'border-white/15 bg-white/[0.05] hover:bg-white/20'
                                    : 'border-white/5 bg-black/40 hover:bg-white/10'
                                }`}
                                style={{
                                  backgroundColor: isSelected ? currentTrack.color : undefined,
                                  borderColor: isSelected ? currentTrack.color : undefined,
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 100% Full-Width Aligned Accent (ACC) Track */}
                <div className="flex items-center gap-1 pt-0.5 border-t border-white/10 text-xs font-mono shrink-0">
                  <div className="w-9 text-right pr-1 font-bold text-[#e06c75] shrink-0 select-none">ACC</div>
                  <div
                    className="flex-1 gap-0.5"
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                  >
                    {Array.from({ length: 16 }).map((_, colIdx) => {
                      const actualStep = activeStepPage * 16 + colIdx;
                      const isAccent = currentTrack.accents[actualStep];
                      const isCurrent = isSeqPlaying && seqCurrentStep === actualStep;

                      return (
                        <button
                          key={colIdx}
                          onClick={() => {
                            modularSynth.toggleTrackAccent(activeTrackId, actualStep);
                            setTracksState([...modularSynth.getTracks()]);
                            playSound('click');
                          }}
                          className={`py-0.5 text-center font-bold rounded-xs cursor-pointer border transition-all ${
                            isCurrent
                              ? 'border-white bg-white text-black'
                              : isAccent
                              ? 'border-[#e06c75] bg-[#e06c75] text-black shadow-sm'
                              : 'border-white/10 bg-black/40 text-white/40 hover:border-white/30'
                          }`}
                        >
                          {actualStep + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 3. MODULAR DSP SIGNAL FLOWCHART RACK (5 CONNECTED HARDWARE NODES) */}
              <div className="border border-white/15 p-1.5 bg-black/50 rounded-xs space-y-1 shrink-0 overflow-x-auto no-scrollbar">
                <div className="flex items-center justify-between text-xs border-b border-white/10 pb-0.5 font-bold">
                  <span style={{ color: currentTrack.color }}>
                    ┌─[ MODULAR DSP SIGNAL FLOW // {currentTrack.name} HARDWARE RACK ]─┐
                  </span>
                  <span className="text-xs opacity-60 font-mono hidden md:inline">
                    SIGNAL: [1.OSC] ─► [2.FUSION] ─► [3.VCF] ─► [4.MOD] ─► [5.OUT]
                  </span>
                </div>

                {/* 5-Node Interactive Flowchart Grid */}
                <div className="grid grid-cols-12 gap-1.5 text-xs items-stretch pt-0.5">
                  
                  {/* NODE 1: DUAL INPUT OSCILLATORS */}
                  <div className="col-span-12 lg:col-span-3 border border-[#e5c07b]/40 p-1 bg-black/60 rounded-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between font-bold text-[#e5c07b] text-xs border-b border-white/10 pb-0.5">
                      <span>1. DUAL OSC</span>
                      <span className="text-xs opacity-60">IN ──►</span>
                    </div>

                    {/* Waveform Selectors */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="opacity-80 font-semibold">OSC A</span>
                        <div className="flex gap-0.5">
                          {(['sawtooth', 'square', 'sine', 'triangle', 'noise'] as SynthWaveform[]).map((w) => (
                            <button
                              key={w}
                              onClick={() => { handleTrackParamChange({ osc1Waveform: w }); playSound('click'); }}
                              className={`px-1.5 py-0.5 text-xs border rounded-xs cursor-pointer ${
                                currentTrack.osc1Waveform === w ? 'border-[#e5c07b] bg-[#e5c07b] text-black font-bold' : 'border-white/20'
                              }`}
                            >
                              {w === 'sawtooth' ? '/|' : w === 'square' ? '⊓' : w === 'sine' ? '~' : w === 'triangle' ? '/\\' : '▒'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="opacity-80 font-semibold">OSC B</span>
                        <div className="flex gap-0.5">
                          {(['sawtooth', 'square', 'sine', 'triangle', 'noise'] as SynthWaveform[]).map((w) => (
                            <button
                              key={w}
                              onClick={() => { handleTrackParamChange({ osc2Waveform: w }); playSound('click'); }}
                              className={`px-1.5 py-0.5 text-xs border rounded-xs cursor-pointer ${
                                currentTrack.osc2Waveform === w ? 'border-[#56b6c2] bg-[#56b6c2] text-black font-bold' : 'border-white/20'
                              }`}
                            >
                              {w === 'sawtooth' ? '/|' : w === 'square' ? '⊓' : w === 'sine' ? '~' : w === 'triangle' ? '/\\' : '▒'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Hardware Knobs for Level, Ratio, Phase, Detune */}
                    <div className="grid grid-cols-4 gap-1 pt-0.5 border-t border-white/10">
                      <RotaryKnob
                        label="OSC A"
                        value={Math.round(currentTrack.osc1Gain * 100)}
                        min={0}
                        max={100}
                        unit="%"
                        color="#e5c07b"
                        size={26}
                        onChange={(v) => handleTrackParamChange({ osc1Gain: v / 100 })}
                      />
                      <RotaryKnob
                        label="OSC B"
                        value={Math.round(currentTrack.osc2Gain * 100)}
                        min={0}
                        max={100}
                        unit="%"
                        color="#56b6c2"
                        size={26}
                        onChange={(v) => handleTrackParamChange({ osc2Gain: v / 100 })}
                      />
                      <RotaryKnob
                        label="PHASE"
                        value={currentTrack.phaseOffset}
                        min={0}
                        max={360}
                        step={15}
                        unit="°"
                        color="#98c379"
                        size={26}
                        onChange={(v) => handleTrackParamChange({ phaseOffset: v })}
                      />
                      <RotaryKnob
                        label="DETUNE"
                        value={currentTrack.detuneCents}
                        min={-50}
                        max={50}
                        step={2}
                        unit="c"
                        color="#e06c75"
                        size={26}
                        onChange={(v) => handleTrackParamChange({ detuneCents: v })}
                      />
                    </div>
                  </div>

                  {/* NODE 2: TIMBRE FUSION NODE */}
                  <div className="col-span-12 lg:col-span-2 border border-[#c678dd]/40 p-1 bg-black/60 rounded-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between font-bold text-[#c678dd] text-xs border-b border-white/10 pb-0.5">
                      <span>2. FUSION</span>
                      <span className="text-xs opacity-60">──►</span>
                    </div>

                    {/* Mode Selectors */}
                    <div className="grid grid-cols-2 gap-0.5">
                      {(['layer', 'fm', 'ring', 'sync'] as BlendMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => { handleTrackParamChange({ blendMode: mode }); playSound('click'); }}
                          className={`py-1 text-xs border rounded-xs font-bold cursor-pointer transition-colors ${
                            currentTrack.blendMode === mode
                              ? 'border-[#c678dd] bg-[#c678dd] text-black shadow-sm'
                              : 'border-white/20 text-[#eceff4] hover:bg-white/10'
                          }`}
                        >
                          {mode === 'layer' ? 'LAYER ⊕' : mode === 'fm' ? 'FM ⨉' : mode === 'ring' ? 'RING ⊗' : 'SYNC ⚡'}
                        </button>
                      ))}
                    </div>

                    {/* Rotary Knobs */}
                    <div className="grid grid-cols-2 gap-1 pt-0.5 border-t border-white/10">
                      <RotaryKnob
                        label="MORPH"
                        value={Math.round(currentTrack.morphAmount * 100)}
                        min={0}
                        max={100}
                        unit="%"
                        color="#c678dd"
                        size={28}
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
                        size={28}
                        onChange={(v) => handleTrackParamChange({ osc2Ratio: v })}
                      />
                    </div>
                  </div>

                  {/* NODE 3: MULTI-MODE VCF RESONANT FILTER */}
                  <div className="col-span-12 lg:col-span-2 border border-[#56b6c2]/40 p-1 bg-black/60 rounded-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between font-bold text-[#56b6c2] text-xs border-b border-white/10 pb-0.5">
                      <span>3. VCF FILTER</span>
                      <span className="text-xs opacity-60">──►</span>
                    </div>

                    {/* Filter Mode Selector */}
                    <div className="flex gap-0.5">
                      {(['lowpass', 'bandpass', 'highpass', 'notch'] as FilterType[]).map((f) => (
                        <button
                          key={f}
                          onClick={() => { handleTrackParamChange({ filterType: f }); playSound('click'); }}
                          className={`flex-1 py-1 text-xs border rounded-xs font-bold cursor-pointer ${
                            currentTrack.filterType === f ? 'border-[#56b6c2] bg-[#56b6c2] text-black' : 'border-white/20'
                          }`}
                        >
                          {f === 'lowpass' ? 'LPF' : f === 'bandpass' ? 'BPF' : f === 'highpass' ? 'HPF' : 'NOTCH'}
                        </button>
                      ))}
                    </div>

                    {/* Cutoff, Resonance, EnvMod Knobs */}
                    <div className="grid grid-cols-3 gap-0.5 pt-0.5 border-t border-white/10">
                      <RotaryKnob
                        label="CUTOFF"
                        value={currentTrack.cutoff}
                        min={40}
                        max={12000}
                        step={50}
                        unit="Hz"
                        color="#56b6c2"
                        size={26}
                        onChange={(v) => handleTrackParamChange({ cutoff: v })}
                      />
                      <RotaryKnob
                        label="RES (Q)"
                        value={currentTrack.resonance}
                        min={0.2}
                        max={14}
                        step={0.2}
                        color="#e5c07b"
                        size={26}
                        onChange={(v) => handleTrackParamChange({ resonance: v })}
                      />
                      <RotaryKnob
                        label="ENV MOD"
                        value={Math.round(currentTrack.envFilterMod * 100)}
                        min={0}
                        max={100}
                        unit="%"
                        color="#98c379"
                        size={26}
                        onChange={(v) => handleTrackParamChange({ envFilterMod: v / 100 })}
                      />
                    </div>
                  </div>

                  {/* NODE 4: ADSR HARDWARE FADERS & LFO MODULATION */}
                  <div className="col-span-12 lg:col-span-3 border border-[#98c379]/40 p-1 bg-black/60 rounded-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between font-bold text-[#98c379] text-xs border-b border-white/10 pb-0.5">
                      <span>4. ADSR &amp; LFO MOD</span>
                      <span className="text-xs opacity-60">──►</span>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      {/* 4 Vertical ADSR Faders */}
                      <div className="flex items-center gap-1.5 flex-1 justify-around">
                        <HardwareFader
                          label="A"
                          value={currentTrack.attack}
                          min={0.005}
                          max={0.8}
                          step={0.01}
                          color="#98c379"
                          height={40}
                          onChange={(v) => handleTrackParamChange({ attack: v })}
                        />
                        <HardwareFader
                          label="D"
                          value={currentTrack.decay}
                          min={0.01}
                          max={1.0}
                          step={0.01}
                          color="#98c379"
                          height={40}
                          onChange={(v) => handleTrackParamChange({ decay: v })}
                        />
                        <HardwareFader
                          label="S"
                          value={currentTrack.sustain}
                          min={0}
                          max={1.0}
                          step={0.02}
                          color="#98c379"
                          height={40}
                          onChange={(v) => handleTrackParamChange({ sustain: v })}
                        />
                        <HardwareFader
                          label="R"
                          value={currentTrack.release}
                          min={0.01}
                          max={1.5}
                          step={0.02}
                          color="#98c379"
                          height={40}
                          onChange={(v) => handleTrackParamChange({ release: v })}
                        />
                      </div>

                      {/* LFO Knobs & Routing */}
                      <div className="border-l border-white/10 pl-1.5 flex flex-col items-center justify-between space-y-1">
                        <div className="flex gap-0.5">
                          {(['filter', 'pitch', 'amp', 'pan'] as LfoTarget[]).map((tgt) => (
                            <button
                              key={tgt}
                              onClick={() => { handleTrackParamChange({ lfoTarget: tgt }); playSound('click'); }}
                              className={`px-1.5 py-0.5 text-xs border rounded-xs font-bold cursor-pointer ${
                                currentTrack.lfoTarget === tgt ? 'border-[#98c379] bg-[#98c379] text-black' : 'border-white/20 text-white/60'
                              }`}
                            >
                              {tgt === 'filter' ? 'VCF' : tgt === 'pitch' ? 'PIT' : tgt.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <RotaryKnob
                            label="RATE"
                            value={currentTrack.lfoRate}
                            min={0.1}
                            max={20}
                            step={0.2}
                            unit="Hz"
                            color="#98c379"
                            size={24}
                            onChange={(v) => handleTrackParamChange({ lfoRate: v })}
                          />
                          <RotaryKnob
                            label="DEPTH"
                            value={Math.round(currentTrack.lfoDepth * 100)}
                            min={0}
                            max={100}
                            unit="%"
                            color="#c678dd"
                            size={24}
                            onChange={(v) => handleTrackParamChange({ lfoDepth: v / 100 })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* NODE 5: MASTER OUTPUT & FFT VISUALIZER */}
                  <div className="col-span-12 lg:col-span-2 border border-white/20 p-1 bg-black/60 rounded-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between font-bold text-white text-xs border-b border-white/10 pb-0.5">
                      <span>5. MASTER OUT</span>
                      <span className="text-[#98c379] text-xs">60 FPS</span>
                    </div>

                    {/* Volume & Pan Knobs */}
                    <div className="grid grid-cols-2 gap-1">
                      <RotaryKnob
                        label="PAN"
                        value={Math.round(currentTrack.pan * 100)}
                        min={-100}
                        max={100}
                        step={5}
                        unit=""
                        color="#56b6c2"
                        size={26}
                        onChange={(v) => handleTrackParamChange({ pan: v / 100 })}
                      />
                      <RotaryKnob
                        label="VOL"
                        value={Math.round(currentTrack.volume * 100)}
                        min={0}
                        max={100}
                        unit="%"
                        color="#e5c07b"
                        size={26}
                        onChange={(v) => handleTrackParamChange({ volume: v / 100 })}
                      />
                    </div>

                    {/* Real-time Oscilloscope Canvas */}
                    <div className="border border-white/15 bg-black/70 relative h-8 rounded-xs overflow-hidden flex items-center">
                      <canvas ref={canvasRef} width={180} height={32} className="w-full h-full block" />
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* BOTTOM COMMAND PROMPT WITH FLAT MATTE RECTANGLE TERMINAL BLOCK CURSOR */}
          <div className="border-t border-white/10 pt-3 space-y-2">
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
              className="flex items-center gap-2.5 border border-white/25 bg-black/60 px-3 py-2 rounded-xs cursor-text relative min-h-[42px]"
            >
              <span className="font-black text-sm select-none" style={{ color: themeStyles.cursorColor }}>:</span>
              
              <div className="relative flex-1 flex items-center font-mono text-sm sm:text-base text-[#eceff4] min-h-[24px]">
                <span className="whitespace-pre">{commandInput}</span>
                <span
                  className="inline-block w-[9px] h-[18px] ml-0.5 align-middle shrink-0 transition-opacity duration-75"
                  style={{
                    backgroundColor: themeStyles.cursorColor,
                    opacity: pulseStep % 6 < 4 ? 0.95 : 0.15,
                  }}
                />
                {!commandInput && (
                  <span className="text-xs opacity-40 ml-2 select-none pointer-events-none">
                    Type command (e.g. 'eval 2**16', 'seq play', 'bpm 130', 'blend fm', 'help')...
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

        </div>

      </div>

      {/* 3. BOTTOM HARDWARE TELEMETRY FOOTER */}
      <footer className={`w-full ${themeStyles.headerBg} px-3 py-2 flex items-center justify-between font-bold text-xs sm:text-sm tracking-wide border ${themeStyles.border} rounded-b-sm mt-2`}>
        <div className="flex items-center gap-3">
          <span>[0] 0:krsz.in*</span>
          <span className="opacity-70 text-[#98c379] hidden sm:inline">1:v8-workers</span>
          <span className="opacity-70 text-[#56b6c2] hidden sm:inline">2:d1-sql</span>
          <span className="opacity-70 text-[#e5c07b] hidden md:inline">3:vectorize</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[#e06c75] hidden sm:inline">"krsz-edge-node"</span>
          <span className="text-[#98c379]">STATUS: 0ms COLD START</span>
        </div>
      </footer>

    </div>
  );
};
