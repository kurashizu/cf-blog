import React, { useState, useEffect } from 'react';
import { Share2, UploadCloud, Copy, Check, Lock, Zap, ArrowUpRight, FileCode2, Clock, Trash2 } from 'lucide-react';
import { sound } from '../../lib/sound';

type ExpirationOption = '1h' | '24h' | '7d' | 'never';

export const ShareCard: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileUploaded, setFileUploaded] = useState<{
    name: string;
    size: string;
    shareUrl: string;
    hash: string;
  } | null>(null);
  const [expiration, setExpiration] = useState<ExpirationOption>('24h');
  const [copied, setCopied] = useState(false);
  const [simulatedSpeed, setSimulatedSpeed] = useState('112.4 MB/s');

  const startSimulatedUpload = (filename = 'benchmark-dataset.parquet', size = '48.2 MB') => {
    sound.playClick(1.2);
    setUploading(true);
    setProgress(0);
    setFileUploaded(null);
    setCopied(false);

    const randomSpeed = (95 + Math.random() * 35).toFixed(1) + ' MB/s';
    setSimulatedSpeed(randomSpeed);

    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 18) + 12;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setProgress(100);
        setTimeout(() => {
          setUploading(false);
          setFileUploaded({
            name: filename,
            size: size,
            shareUrl: `https://share.krsz.in/f/${Math.random().toString(36).substring(2, 8)}`,
            hash: 'e3b0c442...8bc9',
          });
          sound.playPing(true);
        }, 200);
      } else {
        setProgress(current);
        sound.playSseTick();
      }
    }, 120);
  };

  const handleCopy = () => {
    if (!fileUploaded) return;
    navigator.clipboard?.writeText(fileUploaded.shareUrl);
    setCopied(true);
    sound.playPing(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    sound.playClick(0.8);
    setFileUploaded(null);
    setProgress(0);
    setUploading(false);
  };

  return (
    <div className="group relative flex flex-col justify-between h-full bg-[#111317] border border-dashed border-white/10 hover:border-violet-500/40 rounded-2xl p-5 md:p-6 transition-all duration-300 hover:shadow-[0_0_30px_-8px_rgba(168,85,247,0.2)]">
      {/* Glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-violet-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-violet-500/10 transition-all duration-500" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-medium text-slate-100 text-base tracking-tight">
                  share.krsz.in
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  <Zap className="w-3 h-3 text-violet-400 fill-violet-400" />
                  R2 Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Encrypted Peer-to-Edge File Vault & Ephemeral R2 Links
              </p>
            </div>
          </div>

          <a
            href="https://share.krsz.in"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playClick(1.0)}
            className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-violet-300 transition-colors px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-violet-500/10 border border-white/5 hover:border-violet-500/30"
          >
            <span>Launch</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Expiration Controls */}
        <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl bg-black/20 border border-white/5">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>TTL Expiry:</span>
          </div>
          <div className="flex items-center gap-1">
            {(['1h', '24h', '7d', 'never'] as ExpirationOption[]).map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  sound.playClick(1.1);
                  setExpiration(opt);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                  expiration === opt
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 font-semibold'
                    : 'text-slate-500 hover:text-slate-300 bg-white/[0.02]'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Dropzone / Upload State */}
        {!fileUploaded && !uploading ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) {
                startSimulatedUpload(file.name, `${(file.size / (1024 * 1024)).toFixed(1)} MB`);
              } else {
                startSimulatedUpload();
              }
            }}
            onClick={() => startSimulatedUpload()}
            className={`cursor-pointer group/zone flex flex-col items-center justify-center p-5 rounded-xl border border-dashed transition-all duration-200 ${
              isDragging
                ? 'border-violet-400 bg-violet-500/10 scale-[0.99]'
                : 'border-white/10 hover:border-violet-500/30 bg-black/20 hover:bg-white/[0.02]'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-2.5 group-hover/zone:scale-110 transition-transform">
              <UploadCloud className="w-5 h-5" />
            </div>
            <p className="text-xs font-mono text-slate-300 mb-1 text-center">
              Click or Drop file to test direct upload
            </p>
            <p className="text-[10px] font-mono text-slate-500 text-center">
              Simulates multipart chunking to S3/R2 with AES-GCM
            </p>
          </div>
        ) : uploading ? (
          /* Uploading State */
          <div className="p-4 rounded-xl bg-black/30 border border-violet-500/20 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-2 text-violet-300">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                Streaming chunks to R2...
              </span>
              <span className="text-slate-400 font-mono">{progress}%</span>
            </div>

            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-sky-400 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>Rate: {simulatedSpeed}</span>
              <span>Chunk size: 8MB</span>
            </div>
          </div>
        ) : (
          /* File Ready State */
          <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-violet-400" />
                <div>
                  <div className="text-xs font-mono text-slate-200 font-medium">
                    {fileUploaded?.name}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {fileUploaded?.size} • Encrypted in-flight
                  </div>
                </div>
              </div>
              <button
                onClick={handleClear}
                className="p-1 text-slate-500 hover:text-rose-400 transition-colors rounded"
                title="Reset upload"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Generated Link Box */}
            <div className="flex items-center gap-2 p-2 bg-[#090a0c] rounded-lg border border-violet-500/20">
              <input
                type="text"
                readOnly
                value={fileUploaded?.shareUrl}
                className="bg-transparent text-xs font-mono text-violet-300 w-full focus:outline-none select-all"
              />
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-all ${
                  copied
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/40'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Speed & Security Badge */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center gap-1.5 text-violet-400">
          <Lock className="w-3.5 h-3.5" />
          <span>E2EE Zero-Knowledge</span>
        </div>
        <span className="text-slate-500">$0.00 / GB Egress</span>
      </div>
    </div>
  );
};
