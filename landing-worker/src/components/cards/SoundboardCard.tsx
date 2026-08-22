import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Sliders, Music, Radio } from 'lucide-react';
import { sound, playSound } from '../../lib/sound';

interface PadConfig {
  id: number;
  label: string;
  sublabel: string;
  key: string;
  tag: string;
}

const PADS: PadConfig[] = [
  {
    id: 0,
    label: 'SUB_808',
    sublabel: 'Sine 160Hz -> 38Hz Drop',
    key: '1',
    tag: 'KICK_OSC',
  },
  {
    id: 1,
    label: 'MATTE_SNARE',
    sublabel: 'Dual 808/909 Wires + Shell',
    key: '2',
    tag: 'SNAP_2.8K',
  },
  {
    id: 2,
    label: 'FM_BELL',
    sublabel: 'Harmonic C5 + G5 Dual Voice',
    key: '3',
    tag: 'SINE_FM',
  },
  {
    id: 3,
    label: 'SAW_PULSE',
    sublabel: 'Resonant Lowpass E5 Swarm',
    key: '4',
    tag: 'SAW_LPF',
  },
];

export const SoundboardCard: React.FC = () => {
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [activePad, setActivePad] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const triggerPad = (id: number) => {
    setActivePad(id);
    sound.playPad(id);
    setTimeout(() => {
      setActivePad((prev) => (prev === id ? null : prev));
    }, 160);
  };

  const handleToggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
    if (!muted) {
      playSound('toggle');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
        return;
      }
      if (e.key === '1') triggerPad(0);
      if (e.key === '2') triggerPad(1);
      if (e.key === '3') triggerPad(2);
      if (e.key === '4') triggerPad(3);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Oscilloscope canvas visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      animId = requestAnimationFrame(render);
      const data = sound.getVisualizerData();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let y = 10; y < canvas.height; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      if (data && !isMuted) {
        ctx.strokeStyle = 'var(--matte-sand)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const sliceWidth = canvas.width / data.length;
        let x = 0;

        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 128.0;
          const y = (v * canvas.height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      } else {
        // Flatline resting beam
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isMuted]);

  return (
    <div className="w-full space-y-4 font-mono text-xs select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold">
          <Music className="w-3.5 h-3.5 text-[var(--matte-sand)]" />
          <span>DSP SYNTHESIZER ENGINE</span>
          <span className="text-[10px] text-[var(--text-tertiary)] font-normal">// 0-SAMPLE WEB AUDIO</span>
        </div>

        <button
          type="button"
          onClick={handleToggleMute}
          className="btn-dotted px-2.5 py-1 rounded bg-[var(--bg)] border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
        >
          {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3 text-[var(--matte-sand)]" />}
          <span>MASTER: {isMuted ? 'MUTED' : 'LIVE'}</span>
        </button>
      </div>

      {/* Oscilloscope Real-Time Screen */}
      <div className="relative w-full h-24 rounded bg-[var(--bg)] border border-[var(--border)] p-2 flex flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] relative z-10">
          <span>OSCILLOSCOPE // REAL-TIME FFT</span>
          <span>48.0 kHz 32-BIT FLOAT</span>
        </div>
        <canvas ref={canvasRef} width={600} height={96} className="w-full h-full absolute inset-0 block" />
        <div className="flex items-center justify-between text-[9px] text-[var(--text-tertiary)] relative z-10">
          <span>TIME DOMAIN: 2048 BINS</span>
          <span>CHANNELS: 1 (MONO DOWNSAMPLE)</span>
        </div>
      </div>

      {/* 4 Tactile Trigger Pads */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PADS.map((pad) => {
          const isActive = activePad === pad.id;
          return (
            <button
              key={pad.id}
              onClick={() => triggerPad(pad.id)}
              className={`btn-dotted p-3.5 rounded text-left border transition-all cursor-pointer flex flex-col justify-between h-24 ${
                isActive
                  ? 'bg-[var(--bg-card-hover)] border-[var(--text-primary)] translate-y-0.5'
                  : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-hover)]'
              }`}
            >
              <div className="flex items-center justify-between w-full text-[10px]">
                <span className="font-bold text-[var(--text-primary)]">[{pad.key}]</span>
                <span className="text-[var(--text-tertiary)]">{pad.tag}</span>
              </div>

              <div>
                <div className="text-xs font-bold text-[var(--text-primary)]">{pad.label}</div>
                <div className="text-[10px] text-[var(--text-secondary)] truncate">{pad.sublabel}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
