import React, { useState, useEffect, useRef } from 'react';
import { Bot, Terminal, Play, ArrowUpRight, Cpu, Sparkles, RefreshCw, CheckCircle2, Search, Calculator, Database } from 'lucide-react';
import { sound } from '../../lib/sound';

interface ToolAction {
  id: 'eval_expression' | 'web_search' | 'blog_search';
  name: string;
  icon: React.ReactNode;
  query: string;
  toolCallJson: string;
  toolResult: string;
  thoughtText: string;
  finalSynthesis: string;
}

const SAMPLE_ACTIONS: ToolAction[] = [
  {
    id: 'eval_expression',
    name: 'eval_expression',
    icon: <Calculator className="w-3.5 h-3.5 text-cyan-400" />,
    query: 'Compute Euclidean norm: Math.hypot(384, 512) * Math.PI',
    thoughtText: 'Evaluating exact mathematical expression in isolated V8 edge isolate...',
    toolCallJson: '{"expression": "Math.hypot(384, 512) * Math.PI"}',
    toolResult: '{"result": 2010.6192982974677, "exec_time_ms": 0.42}',
    finalSynthesis: 'Result: 2,010.6193 (V8 sandbox executed in 0.42ms without cold start).',
  },
  {
    id: 'web_search',
    name: 'web_search',
    icon: <Search className="w-3.5 h-3.5 text-sky-400" />,
    query: 'Find latest Cloudflare Workers AI edge model benchmarks',
    thoughtText: 'Querying edge search indexing with low-latency scraping filter...',
    toolCallJson: '{"query": "Workers AI Llama 3.3 70B latency Tokyo", "max_results": 2}',
    toolResult: '{"hits": [{"title": "Edge Inference P95", "latency": "38ms", "region": "NRT"}]}',
    finalSynthesis: 'Discovered Tokyo (NRT) Workers AI P95 latency is 38ms with KV acceleration.',
  },
  {
    id: 'blog_search',
    name: 'blog_search',
    icon: <Database className="w-3.5 h-3.5 text-indigo-400" />,
    query: 'Query Vectorize index for "Zero Cold-start RAG"',
    thoughtText: 'Performing cosine similarity search across 768-dim embeddings in Cloudflare Vectorize...',
    toolCallJson: '{"vector_index": "krsz-blog-v2", "top_k": 3, "metric": "cosine"}',
    toolResult: '{"matches": [{"score": 0.942, "doc": "serverless-rag-cloudflare-workers"}]}',
    finalSynthesis: 'Top match: "Architecting Zero-Cold-Start RAG" (similarity score: 0.942).',
  },
];

type StreamStep = 'idle' | 'thought' | 'tool_call' | 'tool_result' | 'synthesis' | 'done';

export const AgentCard: React.FC = () => {
  const [selectedAction, setSelectedAction] = useState<ToolAction>(SAMPLE_ACTIONS[0]);
  const [step, setStep] = useState<StreamStep>('idle');
  const [streamedText, setStreamedText] = useState('');
  const [ttft, setTtft] = useState(38);
  const timeoutRefs = useRef<(ReturnType<typeof setTimeout>)[]>([]);

  const clearTimeouts = () => {
    timeoutRefs.current.forEach(t => clearTimeout(t));
    timeoutRefs.current = [];
  };

  const runSimulation = (action: ToolAction) => {
    clearTimeouts();
    setSelectedAction(action);
    setStep('thought');
    setStreamedText('');
    sound.playClick(1.2);

    // Randomize TTFT
    const randomTtft = Math.floor(32 + Math.random() * 25);
    setTtft(randomTtft);

    // Step 1: Thought
    const t1 = setTimeout(() => {
      sound.playSseTick();
      setStep('tool_call');
    }, 450);

    // Step 2: Tool Call
    const t2 = setTimeout(() => {
      sound.playSseTick();
      setStep('tool_result');
    }, 950);

    // Step 3: Tool Result
    const t3 = setTimeout(() => {
      sound.playSseTick();
      setStep('synthesis');

      // Typewriter effect on synthesis
      let charIdx = 0;
      const textToType = action.finalSynthesis;
      const typeInterval = setInterval(() => {
        if (charIdx < textToType.length) {
          setStreamedText(textToType.slice(0, charIdx + 1));
          if (charIdx % 3 === 0) sound.playSseTick();
          charIdx++;
        } else {
          clearInterval(typeInterval);
          setStep('done');
          sound.playPing(true);
        }
      }, 15);
    }, 1500);

    timeoutRefs.current = [t1, t2, t3];
  };

  useEffect(() => {
    return () => clearTimeouts();
  }, []);

  return (
    <div className="group relative flex flex-col justify-between h-full bg-[#111317] border border-dashed border-white/10 hover:border-cyan-500/40 rounded-2xl p-5 md:p-6 transition-all duration-300 hover:shadow-[0_0_30px_-8px_rgba(6,182,212,0.2)]">
      {/* Glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/10 transition-all duration-500" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-medium text-slate-100 text-base tracking-tight">
                  agent.krsz.in
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  <Cpu className="w-3 h-3 text-cyan-400" />
                  Dual-Phase Loop
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Autonomous Tool Calling Agent & SSE Pipeline
              </p>
            </div>
          </div>

          <a
            href="https://agent.krsz.in"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playClick(1.0)}
            className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-cyan-300 transition-colors px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/30"
          >
            <span>Agent Web</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Tool Simulation Trigger Bar */}
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <Terminal className="w-3 h-3 text-slate-500" />
              Trigger Live Tool Execution:
            </span>
            <span className="text-[10px] text-cyan-400 font-mono">SSE Stream</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {SAMPLE_ACTIONS.map((action) => {
              const isCurrent = selectedAction.id === action.id;
              const isRunningThis = isCurrent && step !== 'idle' && step !== 'done';

              return (
                <button
                  key={action.id}
                  onClick={() => runSimulation(action)}
                  className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-mono transition-all ${
                    isCurrent
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-medium shadow-sm'
                      : 'bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] border border-white/5'
                  }`}
                >
                  {isRunningThis ? (
                    <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
                  ) : (
                    action.icon
                  )}
                  <span className="truncate">{action.name.replace('_', ' ')}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live SSE Tool Terminal Console */}
        <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 font-mono text-[11px] space-y-2 min-h-[140px] max-h-[170px] overflow-y-auto">
          {step === 'idle' ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-5 text-slate-500 space-y-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400/60 animate-bounce" />
              <span>Click a tool above to simulate live SSE agent loop</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* User Goal */}
              <div className="text-slate-400 text-[10px] flex items-center gap-1.5 border-b border-white/5 pb-1">
                <span className="text-slate-500">&gt; Prompt:</span>
                <span className="text-slate-300 truncate">{selectedAction.query}</span>
              </div>

              {/* Thought */}
              {(step === 'thought' || step === 'tool_call' || step === 'tool_result' || step === 'synthesis' || step === 'done') && (
                <div className="text-slate-400 flex items-start gap-1.5">
                  <span className="text-amber-400/90 shrink-0">[think]</span>
                  <span className="text-slate-300 leading-snug">{selectedAction.thoughtText}</span>
                </div>
              )}

              {/* Tool Call */}
              {(step === 'tool_call' || step === 'tool_result' || step === 'synthesis' || step === 'done') && (
                <div className="text-cyan-300/90 flex items-start gap-1.5 bg-cyan-950/30 p-1 rounded border border-cyan-500/20">
                  <span className="text-cyan-400 shrink-0">[call: {selectedAction.name}]</span>
                  <code className="text-cyan-200 text-[10px] truncate">{selectedAction.toolCallJson}</code>
                </div>
              )}

              {/* Tool Result */}
              {(step === 'tool_result' || step === 'synthesis' || step === 'done') && (
                <div className="text-emerald-400 flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0">[result]</span>
                  <code className="text-emerald-300 text-[10px] truncate">{selectedAction.toolResult}</code>
                </div>
              )}

              {/* Synthesis */}
              {(step === 'synthesis' || step === 'done') && (
                <div className="text-slate-100 flex items-start gap-1.5 pt-1 border-t border-white/5">
                  <span className="text-cyan-400 shrink-0">&gt;&gt;</span>
                  <span className="text-slate-200 leading-relaxed font-sans text-xs">
                    {streamedText}
                    {step === 'synthesis' && <span className="inline-block w-1.5 h-3 bg-cyan-400 ml-0.5 animate-pulse" />}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Metrics */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-1 text-cyan-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>TTFT: {ttft}ms</span>
        </div>
        <span className="text-slate-500">Evaluator: AST Isolated</span>
      </div>
    </div>
  );
};
