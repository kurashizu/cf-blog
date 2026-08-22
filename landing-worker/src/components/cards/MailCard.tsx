import React, { useState } from 'react';
import { Mail, ShieldCheck, Send, Lock, ArrowUpRight, CheckCircle2, Sparkles, KeyRound } from 'lucide-react';
import { sound } from '../../lib/sound';

export const MailCard: React.FC = () => {
  const [senderEmail, setSenderEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isArmored, setIsArmored] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    sound.playClick(1.2);
    setIsSending(true);
    setSentSuccess(false);

    setTimeout(() => {
      sound.playPing(true);
      setIsSending(false);
      setSentSuccess(true);
      setMessage('');
      setTimeout(() => setSentSuccess(false), 4000);
    }, 900);
  };

  return (
    <div className="group relative flex flex-col justify-between h-full bg-[#111317] border border-dashed border-white/10 hover:border-emerald-500/40 rounded-2xl p-5 md:p-6 transition-all duration-300 hover:shadow-[0_0_30px_-8px_rgba(16,185,129,0.2)]">
      {/* Glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-500" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-medium text-slate-100 text-base tracking-tight">
                  mail.krsz.in
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  DKIM / SPF Pass
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Encrypted Inbound Gateway & CF Email Worker Relay
              </p>
            </div>
          </div>

          <a
            href="mailto:contact@krsz.in"
            onClick={() => sound.playClick(1.0)}
            className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-emerald-300 transition-colors px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30"
          >
            <span>PGP Mail</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Security / Verification Pills */}
        <div className="grid grid-cols-3 gap-1.5 mb-3 text-[10px] font-mono">
          <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex items-center gap-1 text-slate-300">
            <KeyRound className="w-3 h-3 text-emerald-400" />
            <span>PGP 4096b</span>
          </div>
          <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex items-center gap-1 text-slate-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>DMARC 100%</span>
          </div>
          <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex items-center gap-1 text-slate-300">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>0.00 Spam</span>
          </div>
        </div>

        {/* Interactive Quick Ping Composer */}
        <form onSubmit={handleSend} className="space-y-2.5">
          <div className="relative">
            <input
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="Your email (e.g. dev@domain.com)..."
              className="w-full px-3 py-1.5 text-xs bg-[#0b0c0e] border border-white/10 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 font-mono transition-all"
            />
          </div>

          <div className="relative">
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type quick encrypted dispatch to Kurashizu..."
              className="w-full px-3 py-2 text-xs bg-[#0b0c0e] border border-white/10 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 font-mono resize-none transition-all"
            />
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                sound.playClick(1.1);
                setIsArmored(!isArmored);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all ${
                isArmored
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium'
                  : 'text-slate-500 bg-white/[0.02] border border-white/5'
              }`}
            >
              <Lock className="w-3 h-3" />
              <span>{isArmored ? 'PGP Armored' : 'Plain Text'}</span>
            </button>

            <button
              type="submit"
              disabled={isSending || !message.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              {isSending ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                  <span>Encrypting...</span>
                </>
              ) : sentSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Dispatched!</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Ping</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span className="text-emerald-400">Fingerprint: 7F29 4B18 90CD</span>
        <span className="text-slate-500">Worker Relay: &lt;18ms</span>
      </div>
    </div>
  );
};
