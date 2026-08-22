import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, Maximize2, Minimize2, CornerDownLeft, Sparkles } from 'lucide-react';
import { playSound } from '../lib/sound';

interface TerminalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onThemeChange: (theme: 'obsidian' | 'chalk' | 'sage') => void;
  onToggleSound: () => void;
  soundEnabled: boolean;
}

interface CommandHistory {
  command: string;
  output: React.ReactNode;
  time: string;
}

export const TerminalDrawer: React.FC<TerminalDrawerProps> = ({
  isOpen,
  onClose,
  onThemeChange,
  onToggleSound,
  soundEnabled,
}) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<CommandHistory[]>([
    {
      command: 'sysinfo',
      time: '00:00:01',
      output: (
        <div className="space-y-1 text-matte-muted font-mono">
          <p className="text-matte-accent font-bold">KRSZ SHELL V2.8.4 // SERVERLESS EDGE RUNTIME</p>
          <p>KRSZ stands for: <span className="text-matte-text font-bold">Kurashizu's Random-Stuff Zone</span></p>
          <p>Type <span className="text-matte-highlight font-bold">help</span> to list all interactive subcommands.</p>
        </div>
      ),
    },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      playSound('toggle');
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;

    playSound('keystroke');
    const nowStr = new Date().toLocaleTimeString('en-US', { hour12: false });
    const parts = cmd.toLowerCase().split(' ');
    const mainCmd = parts[0];
    const arg = parts[1];

    let response: React.ReactNode = null;

    switch (mainCmd) {
      case 'help':
        response = (
          <div className="space-y-1.5 font-mono text-xs">
            <p className="text-matte-accent font-bold">AVAILABLE COMMANDS:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-matte-muted">
              <div><strong className="text-matte-text">help</strong> - Display command dictionary</div>
              <div><strong className="text-matte-text">services</strong> - List all serverless destinations</div>
              <div><strong className="text-matte-text">about</strong> - Explain KRSZ mission &amp; architecture</div>
              <div><strong className="text-matte-text">contact</strong> - Display direct developer emails</div>
              <div><strong className="text-matte-text">ping</strong> - Run global edge latency probes</div>
              <div><strong className="text-matte-text">theme [mode]</strong> - Set theme (obsidian/chalk/sage)</div>
              <div><strong className="text-matte-text">sound [on/off]</strong> - Toggle audio feedback</div>
              <div><strong className="text-matte-text">clear</strong> - Clear console buffer</div>
              <div><strong className="text-matte-text">exit</strong> - Close console</div>
            </div>
          </div>
        );
        break;

      case 'services':
        response = (
          <div className="space-y-1 font-mono text-xs text-matte-muted">
            <p className="text-matte-accent font-bold">KRSZ ZONE DESTINATIONS:</p>
            <ul className="space-y-1">
              <li>• <a href="https://blog.krsz.in" target="_blank" className="text-matte-text hover:underline">blog.krsz.in</a> - Engineering blog &amp; AI research</li>
              <li>• <a href="https://share.krsz.in" target="_blank" className="text-matte-text hover:underline">share.krsz.in</a> - Fast zero-knowledge file relays</li>
              <li>• <a href="https://sharetube.krsz.in" target="_blank" className="text-matte-text hover:underline">sharetube.krsz.in</a> - Video stream &amp; media transcoder</li>
              <li>• <a href="https://mail.krsz.in" target="_blank" className="text-matte-text hover:underline">mail.krsz.in</a> - Cloudflare worker mail gateway</li>
              <li>• <a href="https://skill.krsz.in/rules" target="_blank" className="text-matte-text hover:underline">skill.krsz.in</a> - Engineering rules &amp; directives</li>
              <li>• <a href="https://agent.krsz.in" target="_blank" className="text-matte-text hover:underline">agent.krsz.in</a> - Autonomous AI tool calling agent</li>
              <li>• <a href="https://huggingface.co/kurashizu" target="_blank" className="text-matte-text hover:underline">huggingface.co/kurashizu</a> - Fine-tuned models &amp; datasets</li>
              <li>• <a href="https://github.com/kurashizu" target="_blank" className="text-matte-text hover:underline">github.com/kurashizu</a> - Open-source monorepo</li>
            </ul>
          </div>
        );
        break;

      case 'about':
        response = (
          <div className="space-y-1 font-mono text-xs text-matte-muted">
            <p className="text-matte-accent font-bold">KRSZ ARCHITECTURAL MANIFESTO:</p>
            <p><strong className="text-matte-text">KRSZ</strong> stands for <em className="text-matte-accent">Kurashizu's Random-Stuff Zone</em>.</p>
            <p>100% of all microservices, databases, vector indexes, and AI pipelines run serverless on Cloudflare's global edge network.</p>
            <p>Zero cold starts, zero servers to manage, infinite elasticity.</p>
          </div>
        );
        break;

      case 'contact':
        response = (
          <div className="space-y-1 font-mono text-xs text-matte-muted">
            <p className="text-matte-accent font-bold">DIRECT INBOX CHANNELS:</p>
            <p>• Primary Dev: <a href="mailto:krsz.dev@gmail.com" className="text-matte-text font-bold hover:underline">krsz.dev@gmail.com</a></p>
            <p>• Domain Root: <a href="mailto:admin@krsz.in" className="text-matte-text font-bold hover:underline">admin@krsz.in</a></p>
          </div>
        );
        break;

      case 'ping':
        response = (
          <div className="space-y-1 font-mono text-xs text-matte-muted">
            <p className="text-matte-accent font-bold">EDGE LATENCY PROBES (ANYCAST V8):</p>
            <p>• NRT (Tokyo): <span className="text-emerald-400 font-bold">11ms</span> [OPTIMAL]</p>
            <p>• KIX (Osaka): <span className="text-emerald-400 font-bold">16ms</span> [OPTIMAL]</p>
            <p>• SIN (Singapore): <span className="text-emerald-400 font-bold">64ms</span> [GOOD]</p>
            <p>• SJC (San Jose): <span className="text-emerald-400 font-bold">112ms</span> [GOOD]</p>
            <p>• FRA (Frankfurt): <span className="text-emerald-400 font-bold">178ms</span> [ROUTED]</p>
            <p>• LHR (London): <span className="text-emerald-400 font-bold">184ms</span> [ROUTED]</p>
          </div>
        );
        break;

      case 'theme':
        if (arg === 'obsidian' || arg === 'chalk' || arg === 'sage') {
          onThemeChange(arg);
          response = <p className="text-emerald-400 font-mono text-xs">Theme switched to [{arg.toUpperCase()}].</p>;
        } else {
          response = <p className="text-amber-400 font-mono text-xs">Usage: theme [obsidian | chalk | sage]</p>;
        }
        break;

      case 'sound':
        onToggleSound();
        response = <p className="text-emerald-400 font-mono text-xs">Sound toggled. Current: {soundEnabled ? 'MUTED' : 'ENABLED'}</p>;
        break;

      case 'clear':
        setHistory([]);
        setInput('');
        return;

      case 'exit':
      case 'quit':
        onClose();
        setInput('');
        return;

      default:
        response = (
          <p className="text-rose-400 font-mono text-xs">
            Command not recognized: '{cmd}'. Type <span className="text-matte-text underline font-bold">help</span> for available commands.
          </p>
        );
    }

    setHistory((prev) => [...prev, { command: cmd, output: response, time: nowStr }]);
    setInput('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-3xl h-[520px] rounded-lg bg-matte-bg border border-matte-border shadow-2xl flex flex-col overflow-hidden font-mono">
        
        {/* Terminal Titlebar */}
        <div className="px-4 py-3 bg-matte-card border-b border-matte-border flex items-center justify-between select-none">
          <div className="flex items-center gap-2 text-xs text-matte-text font-bold">
            <TerminalIcon className="w-4 h-4 text-matte-accent" />
            <span>KRSZ CLI // INTERACTIVE CONTROL CONSOLE</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-matte-faint uppercase hidden sm:inline">ESC TO CLOSE</span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-matte-bg text-matte-muted hover:text-matte-text transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Console Log Output */}
        <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
          {history.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2 text-matte-faint">
                <span className="text-matte-accent font-bold">krsz@edge:~$</span>
                <span className="text-matte-text font-semibold">{item.command}</span>
                <span className="text-[10px] ml-auto tabular-nums">{item.time}</span>
              </div>
              <div className="pl-4 pt-0.5">{item.output}</div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleCommand} className="p-3 bg-matte-card/80 border-t border-matte-border flex items-center gap-2">
          <span className="text-matte-accent font-bold text-xs">krsz@edge:~$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type 'help' or any command..."
            className="flex-1 bg-transparent text-xs font-mono text-matte-text outline-none placeholder:text-matte-faint"
          />
          <button
            type="submit"
            className="px-2 py-1 rounded bg-matte-tag hover:bg-matte-card border border-matte-border text-matte-text text-[11px] flex items-center gap-1 transition-colors"
          >
            <span>RUN</span>
            <CornerDownLeft className="w-3 h-3 text-matte-accent" />
          </button>
        </form>

      </div>
    </div>
  );
};
