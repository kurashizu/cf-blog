import React, { useState } from 'react';
import { Sparkles, Download, Heart, ArrowUpRight, Copy, Check, Terminal, Layers } from 'lucide-react';
import { ModelHubItem } from '../../lib/types';
import { sound } from '../../lib/sound';

const MODELS: ModelHubItem[] = [
  {
    id: 'krsz-llama3-31b-agent-instruct',
    name: 'krsz-llama3-31b-instruct',
    repo: 'kurashizu/krsz-llama3-31b-agent-instruct',
    paramSize: '31B',
    type: 'Instruct',
    downloads: 14820,
    likes: 312,
    contextLength: '128k',
    quantization: 'Q4_K_M / Q8_0 / BF16',
    url: 'https://huggingface.co/kurashizu',
  },
  {
    id: 'krsz-qwen2.5-9b-tool-calling-lora',
    name: 'qwen2.5-9b-tool-call-lora',
    repo: 'kurashizu/qwen2.5-9b-tool-calling-lora',
    paramSize: '9B',
    type: 'LoRA',
    downloads: 28400,
    likes: 540,
    contextLength: '32k',
    quantization: 'LoRA 16-rank safetensors',
    url: 'https://huggingface.co/kurashizu',
  },
  {
    id: 'krsz-gemma2-2b-edge-router',
    name: 'krsz-gemma2-2b-edge-router',
    repo: 'kurashizu/gemma2-2b-edge-router',
    paramSize: '2B',
    type: 'GGUF',
    downloads: 41200,
    likes: 890,
    contextLength: '8k',
    quantization: 'Q4_0 WASM / Workers AI',
    url: 'https://huggingface.co/kurashizu',
  },
];

export const HuggingFaceCard: React.FC = () => {
  const [selectedSize, setSelectedSize] = useState<'All' | '31B' | '9B' | '2B'>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredModels = MODELS.filter(m => selectedSize === 'All' || m.paramSize === selectedSize);
  const totalDownloads = MODELS.reduce((acc, m) => acc + m.downloads, 0);

  const handleCopyCommand = (model: ModelHubItem) => {
    sound.playClick(1.2);
    const cmd = `ollama run hf.co/${model.repo}`;
    navigator.clipboard?.writeText(cmd);
    setCopiedId(model.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="group relative flex flex-col justify-between h-full bg-[#111317] border border-dashed border-white/10 hover:border-yellow-500/40 rounded-2xl p-5 md:p-6 transition-all duration-300 hover:shadow-[0_0_30px_-8px_rgba(234,179,8,0.2)]">
      {/* Glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-yellow-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-yellow-500/10 transition-all duration-500" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-base">
              🤗
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-medium text-slate-100 text-base tracking-tight">
                  huggingface.co/kurashizu
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">
                  <Sparkles className="w-3 h-3 text-yellow-400" />
                  Open Weights
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Fine-tuned LLMs, LoRA Adapters & GGUF Quantizations
              </p>
            </div>
          </div>

          <a
            href="https://huggingface.co/kurashizu"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playClick(1.0)}
            className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-yellow-300 transition-colors px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-yellow-500/10 border border-white/5 hover:border-yellow-500/30"
          >
            <span>Hub</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Filter Badges & Total Stats */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1">
            {(['All', '31B', '9B', '2B'] as const).map((size) => (
              <button
                key={size}
                onClick={() => {
                  sound.playClick(1.1);
                  setSelectedSize(size);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                  selectedSize === size
                    ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 font-semibold'
                    : 'bg-white/[0.02] text-slate-400 hover:text-slate-200 border border-white/5'
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 text-xs font-mono text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
            <Download className="w-3 h-3" />
            <span>{totalDownloads.toLocaleString()} pull</span>
          </div>
        </div>

        {/* Model Cards List */}
        <div className="space-y-2">
          {filteredModels.map((model) => {
            const isCopied = copiedId === model.id;
            return (
              <div
                key={model.id}
                className="group/item p-2.5 rounded-xl bg-black/20 hover:bg-white/[0.03] border border-white/5 hover:border-yellow-500/20 transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono font-medium text-slate-200 group-hover/item:text-yellow-300 transition-colors">
                      {model.name}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-white/5 text-slate-300 border border-white/10">
                      {model.paramSize}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
                      model.type === 'LoRA'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : model.type === 'GGUF'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    }`}>
                      {model.type}
                    </span>
                  </div>

                  <button
                    onClick={() => handleCopyCommand(model)}
                    title="Copy pull command"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 hover:text-yellow-300 bg-white/[0.02] hover:bg-yellow-500/10 border border-white/5 transition-colors"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Terminal className="w-3 h-3" />
                        <span>Run</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                  <span>{model.quantization}</span>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="flex items-center gap-0.5">
                      <Download className="w-2.5 h-2.5" />
                      {model.downloads.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Heart className="w-2.5 h-2.5 text-rose-400" />
                      {model.likes}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Benchmark */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span className="text-yellow-400">Safetensors • BF16 Native</span>
        <span className="text-slate-500">Context: up to 128k</span>
      </div>
    </div>
  );
};
