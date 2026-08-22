import React, { useState } from 'react';
import { RefreshCw, Globe, Activity } from 'lucide-react';
import { playSound } from '../../lib/sound';

interface Probe {
  code: string;
  city: string;
  region: string;
  latency: number;
  jitter: number;
  status: string;
}

const PROBES: Probe[] = [
  { code: 'SYD', city: 'Sydney', region: 'AU-NSW (Local)', latency: 2.1, jitter: 0.2, status: 'LOCAL' },
  { code: 'NRT', city: 'Tokyo', region: 'JP-Kanto', latency: 12.4, jitter: 0.6, status: 'OPTIMAL' },
  { code: 'KIX', city: 'Osaka', region: 'JP-Kansai', latency: 17.8, jitter: 0.9, status: 'OPTIMAL' },
  { code: 'SIN', city: 'Singapore', region: 'SG-Central', latency: 62.5, jitter: 1.8, status: 'ROUTED' },
  { code: 'SJC', city: 'San Jose', region: 'US-West', latency: 114.2, jitter: 2.4, status: 'ROUTED' },
  { code: 'FRA', city: 'Frankfurt', region: 'EU-Central', latency: 164.0, jitter: 3.1, status: 'TRANSIT' },
];

export const EdgeLatencyCard: React.FC = () => {
  const [probes, setProbes] = useState<Probe[]>(PROBES);
  const [isPinging, setIsPinging] = useState(false);

  const handleReping = () => {
    setIsPinging(true);
    playSound('ping', true);

    setTimeout(() => {
      setProbes((prev) =>
        prev.map((p) => ({
          ...p,
          latency: +(p.latency + (Math.random() * 2 - 1)).toFixed(1),
          jitter: +(p.jitter + (Math.random() * 0.4 - 0.2)).toFixed(1),
        }))
      );
      setIsPinging(false);
      playSound('sseTick');
    }, 600);
  };

  return (
    <div className="w-full space-y-4 font-mono text-xs select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold">
          <Globe className="w-3.5 h-3.5 text-[var(--matte-sand)]" />
          <span>GLOBAL EDGE LATENCY TELEMETRY</span>
          <span className="text-[10px] text-[var(--text-tertiary)] font-normal">// ANYCAST V8 PROBES</span>
        </div>

        <button
          type="button"
          onClick={handleReping}
          disabled={isPinging}
          className="btn-dotted px-2.5 py-1 rounded bg-[var(--bg)] border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isPinging ? 'animate-spin text-[var(--matte-sand)]' : ''}`} />
          <span>{isPinging ? 'PROBING...' : 'RE-PROBE ALL'}</span>
        </button>
      </div>

      {/* Latency Table Grid */}
      <div className="rounded bg-[var(--bg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
        <div className="grid grid-cols-12 px-3 py-2 text-[10px] font-bold text-[var(--text-tertiary)] uppercase bg-[var(--bg-card)]">
          <div className="col-span-3">COLO / IATA</div>
          <div className="col-span-4">LOCATION / REGION</div>
          <div className="col-span-3 text-right">ROUND-TRIP (RTT)</div>
          <div className="col-span-2 text-right">STATUS</div>
        </div>

        {probes.map((probe) => (
          <div key={probe.code} className="grid grid-cols-12 px-3 py-2.5 items-center hover:bg-[var(--bg-card)]/50 transition-colors">
            <div className="col-span-3 font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <span>[{probe.code}]</span>
            </div>

            <div className="col-span-4 text-[var(--text-secondary)] text-[11px]">
              <span>{probe.city}</span>
              <span className="text-[10px] text-[var(--text-tertiary)] ml-1.5 hidden sm:inline">({probe.region})</span>
            </div>

            <div className="col-span-3 text-right font-bold text-[var(--text-primary)] tabular-nums text-xs">
              <span>{probe.latency} ms</span>
              <span className="text-[10px] text-[var(--text-tertiary)] font-normal ml-1">±{probe.jitter}</span>
            </div>

            <div className="col-span-2 text-right text-[10px] font-bold text-[var(--matte-sand)]">
              <span>[{probe.status}]</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
