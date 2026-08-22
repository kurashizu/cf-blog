import React, { useState } from 'react';
import { Check, Copy, ArrowUpRight, Send, Terminal } from 'lucide-react';
import { playSound } from '../lib/sound';

export const ContactSection: React.FC = () => {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Guestbook Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [websiteHoneypot, setWebsiteHoneypot] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const handleCopy = (text: string) => {
    playSound('click');
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2200);
  };

  const handleGuestbookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !content.trim()) {
      setStatusMessage('ERROR: Name, email and message are required.');
      setSubmitStatus('error');
      playSound('click');
      return;
    }

    if (websiteHoneypot) {
      setSubmitStatus('error');
      return;
    }

    setSubmitStatus('submitting');
    playSound('click');

    try {
      const resp = await fetch('https://blog.krsz.in/api/guestbook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          content: content.trim(),
        }),
      });

      if (resp.ok) {
        setSubmitStatus('success');
        setStatusMessage('TRANSMITTED: Message posted to blog.krsz.in guestbook.');
        setName('');
        setEmail('');
        setContent('');
        playSound('power');
      } else {
        const data = (await resp.json().catch(() => ({}))) as { error?: string };
        setSubmitStatus('error');
        setStatusMessage(`GATEWAY ERROR: ${data.error || `HTTP ${resp.status}`}`);
        playSound('toggle');
      }
    } catch (err: any) {
      setSubmitStatus('error');
      setStatusMessage(`NETWORK ERROR: ${err?.message || 'Transmission failed.'}`);
      playSound('toggle');
    }
  };

  return (
    <footer id="contact" className="relative w-full min-h-screen flex flex-col justify-between px-4 sm:px-8 lg:px-12 py-16 lg:py-20 border-t border-[var(--border)] select-none">
      {/* 1. TOP LABEL */}
      <div className="font-mono text-xs text-[var(--text-secondary)] flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-primary)] font-bold">[DISPATCH DECK]</span>
          <span>// DIRECT INBOX &amp; GUESTBOOK</span>
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono hidden sm:inline">
          RFC-2026 // ZERO TRACKING
        </span>
      </div>

      {/* 2. MIDDLE TWO-COLUMN DISPATCH PLATFORM */}
      <div className="grid grid-cols-12 gap-8 my-auto py-6">
        
        {/* Left Column: Direct Inboxes & Headline */}
        <div className="col-span-12 lg:col-span-6 space-y-6">
          <div>
            <div className="font-mono text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              // CHANNELS
            </div>
            <h2 className="font-sans font-black text-3xl sm:text-4xl lg:text-5xl uppercase leading-[0.95] tracking-tight text-[var(--text-primary)]">
              Direct Communication.
            </h2>
            <p className="mt-3 text-xs sm:text-sm font-mono text-[var(--text-secondary)] leading-relaxed">
              Reach out for system architecture, serverless infrastructure, open-source models, or collaboration.
            </p>
          </div>

          {/* Email Copy Buttons */}
          <div className="space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between p-3 rounded bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors">
              <div>
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase">DEV INBOX</div>
                <div className="text-sm font-bold text-[var(--text-primary)]">krsz.dev@gmail.com</div>
              </div>
              <button
                onClick={() => handleCopy('krsz.dev@gmail.com')}
                className="btn-dotted px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded flex items-center gap-1.5 cursor-pointer"
              >
                {copiedText === 'krsz.dev@gmail.com' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[var(--matte-sand)]" />
                )}
                <span>{copiedText === 'krsz.dev@gmail.com' ? 'COPIED' : 'COPY'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors">
              <div>
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase">DOMAIN ROOT</div>
                <div className="text-sm font-bold text-[var(--text-primary)]">admin@krsz.in</div>
              </div>
              <button
                onClick={() => handleCopy('admin@krsz.in')}
                className="btn-dotted px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded flex items-center gap-1.5 cursor-pointer"
              >
                {copiedText === 'admin@krsz.in' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[var(--matte-sand)]" />
                )}
                <span>{copiedText === 'admin@krsz.in' ? 'COPIED' : 'COPY'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Guestbook Dispatch Form (Connected to blog.krsz.in) */}
        <div className="col-span-12 lg:col-span-6">
          <div className="p-5 rounded bg-[var(--bg-card)] border border-[var(--border)] space-y-4">
            <div className="flex items-center justify-between font-mono text-xs border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-bold">
                <Terminal className="w-3.5 h-3.5 text-[var(--matte-sand)]" />
                <span>GUESTBOOK TRANSMITTER</span>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase">
                DEST: BLOG.KRSZ.IN/API
              </span>
            </div>

            <form onSubmit={handleGuestbookSubmit} className="space-y-3 font-mono text-xs">
              {/* Honeypot */}
              <input
                type="text"
                name="website"
                value={websiteHoneypot}
                onChange={(e) => setWebsiteHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[var(--text-tertiary)] uppercase mb-1">
                    YOUR NAME
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Satoshi"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--border-hover)] rounded px-2.5 py-1.5 text-[var(--text-primary)] outline-none text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[var(--text-tertiary)] uppercase mb-1">
                    CONTACT EMAIL
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. dev@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--border-hover)] rounded px-2.5 py-1.5 text-[var(--text-primary)] outline-none text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[var(--text-tertiary)] uppercase mb-1">
                  TRANSMISSION PAYLOAD
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Drop a note to the public guestbook..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--border-hover)] rounded px-2.5 py-1.5 text-[var(--text-primary)] outline-none text-xs resize-none"
                />
              </div>

              {/* Status Banner */}
              {statusMessage && (
                <div className={`p-2 rounded text-[11px] font-mono ${submitStatus === 'success' ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40' : 'bg-rose-950/40 text-rose-300 border border-rose-800/40'}`}>
                  {statusMessage}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitStatus === 'submitting'}
                className="w-full btn-dotted py-2 rounded bg-[var(--text-primary)] text-[var(--bg)] font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                <span>{submitStatus === 'submitting' ? 'TRANSMITTING...' : 'DISPATCH TO GUESTBOOK'}</span>
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* 3. BOTTOM FOOTER NAVIGATION BAR */}
      <div className="font-mono text-xs text-[var(--text-secondary)] pt-6 border-t border-[var(--border)]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="text-[11px] text-[var(--text-tertiary)]">
            <span>© 2024-2026 KURASHIZU · 100% SERVERLESS V8 RUNTIME</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs uppercase font-mono">
            <a
              href="https://skill.krsz.in/rules"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playSound('click')}
              className="btn-dotted px-2 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
            >
              <span>Rules</span>
              <ArrowUpRight className="w-3 h-3 text-[var(--matte-sand)]" />
            </a>

            <a
              href="https://github.com/kurashizu"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playSound('click')}
              className="btn-dotted px-2 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
            >
              <span>GitHub</span>
              <ArrowUpRight className="w-3 h-3 text-[var(--matte-sand)]" />
            </a>

            <a
              href="https://huggingface.co/kurashizu"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playSound('click')}
              className="btn-dotted px-2 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
            >
              <span>HuggingFace</span>
              <ArrowUpRight className="w-3 h-3 text-[var(--matte-sand)]" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
