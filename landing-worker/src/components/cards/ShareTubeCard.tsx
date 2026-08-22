import React, { useState, useEffect, useRef } from 'react';
import { Film, Play, Pause, ArrowUpRight, Volume2, Sparkles, Sliders, Layers, Radio } from 'lucide-react';
import { VideoResolutionConfig } from '../../lib/types';
import { sound } from '../../lib/sound';

const RESOLUTIONS: VideoResolutionConfig[] = [
  { resolution: '1080p', bitrate: '12.4 Mbps', fps: 60, codec: 'av01', approxSizeMb: 142 },
  { resolution: '720p', bitrate: '5.8 Mbps', fps: 60, codec: 'vp9', approxSizeMb: 68 },
  { resolution: '480p', bitrate: '2.4 Mbps', fps: 30, codec: 'h264', approxSizeMb: 28 },
  { resolution: '360p', bitrate: '1.1 Mbps', fps: 30, codec: 'h264', approxSizeMb: 14 },
];

const FORMATS = [
  { name: 'MP4', badge: 'Byte-Range' },
  { name: 'WebM', badge: 'Opus+VP9' },
  { name: 'HLS', badge: 'm3u8 ABR' },
];

export const ShareTubeCard: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedRes, setSelectedRes] = useState<VideoResolutionConfig>(RESOLUTIONS[0]);
  const [activeFormat, setActiveFormat] = useState('HLS');
  const [waveHeights, setWaveHeights] = useState<number[]>([40, 65, 30, 85, 95, 55, 75, 45, 90, 60, 35, 70, 80, 50, 65, 40]);
  const animationRef = useRef<number | null>(null);

  // Animate waveform bars
  useEffect(() => {
    let phase = 0;
    const updateWave = () => {
      if (isPlaying) {
        phase += 0.08;
        setWaveHeights(prev =>
          prev.map((_, i) => {
            const val = Math.sin(phase + i * 0.45) * 35 + Math.cos(phase * 1.5 + i * 0.3) * 20 + 50;
            return Math.max(15, Math.min(95, Math.round(val)));
          })
        );
      }
      animationRef.current = requestAnimationFrame(updateWave);
    };

    animationRef.current = requestAnimationFrame(updateWave);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying]);

  const togglePlayback = () => {
    sound.playClick(isPlaying ? 0.9 : 1.3);
    setIsPlaying(!isPlaying);
  };

  const handleResChange = (res: VideoResolutionConfig) => {
    sound.playClick(1.1);
    setSelectedRes(res);
  };

  const handleFormatChange = (fmt: string) => {
    sound.playClick(1.0);
    setActiveFormat(fmt);
  };

  return (
    <div className="group relative flex flex-col justify-between h-full bg-[#111317] border border-dashed border-white/10 hover:border-amber-500/40 rounded-2xl p-5 md:p-6 transition-all duration-300 hover:shadow-[0_0_30px_-8px_rgba(245,158,11,0.2)]">
      {/* Glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-amber-500/10 transition-all duration-500" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-medium text-slate-100 text-base tracking-tight">
                  sharetube.krsz.in
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  <Radio className="w-3 h-3 text-amber-400 animate-pulse" />
                  HLS Edge
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Adaptive Media Transmuxing & Zero-Buffer Video Sandbox
              </p>
            </div>
          </div>

          <a
            href="https://sharetube.krsz.in"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playClick(1.0)}
            className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-amber-300 transition-colors px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/30"
          >
            <span>Stream</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Video Canvas & Audio Waveform Preview */}
        <div className="relative mb-3 p-3.5 rounded-xl bg-black/40 border border-white/10 overflow-hidden">
          {/* Top Preview Bar */}
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2.5">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlayback}
                className="w-6 h-6 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center justify-center transition-all"
                title={isPlaying ? 'Pause simulation' : 'Play simulation'}
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
              </button>
              <span className="text-slate-300 font-medium">stream_master.ts</span>
            </div>
            <span className="text-[10px] text-amber-400 font-mono">
              {selectedRes.codec.toUpperCase()} • {selectedRes.bitrate}
            </span>
          </div>

          {/* Waveform Equalizer Display */}
          <div className="h-16 flex items-end justify-between gap-1 px-1 py-1.5 bg-black/50 rounded-lg border border-white/5">
            {waveHeights.map((height, idx) => (
              <div
                key={idx}
                className="w-full rounded-t-sm transition-all duration-100 ease-out"
                style={{
                  height: isPlaying ? `${height}%` : '8%',
                  backgroundColor:
                    idx % 3 === 0
                      ? 'rgba(245, 158, 11, 0.9)'
                      : idx % 2 === 0
                      ? 'rgba(251, 191, 36, 0.7)'
                      : 'rgba(217, 119, 6, 0.6)',
                }}
              />
            ))}
          </div>

          {/* Live stream timeline track */}
          <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-slate-500">
            <span>Buffer: 98.4% (32s forward)</span>
            <span>Audio: 48kHz Stereo FLAC</span>
          </div>
        </div>

        {/* Resolution Toggle Matrix */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <Sliders className="w-3 h-3 text-slate-500" />
              ABR Resolution Profile:
            </span>
            <span className="text-amber-400 font-mono">{selectedRes.fps} FPS</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {RESOLUTIONS.map((res) => {
              const isSelected = selectedRes.resolution === res.resolution;
              return (
                <button
                  key={res.resolution}
                  onClick={() => handleResChange(res)}
                  className={`py-1.5 px-2 rounded-lg text-center font-mono text-xs transition-all ${
                    isSelected
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm font-semibold'
                      : 'bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] border border-white/5'
                  }`}
                >
                  <div>{res.resolution}</div>
                  <div className="text-[9px] text-slate-500 font-normal">{res.bitrate}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Format Badges */}
        <div className="flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-slate-500 mr-0.5" />
          {FORMATS.map((fmt) => {
            const isFmtActive = activeFormat === fmt.name;
            return (
              <button
                key={fmt.name}
                onClick={() => handleFormatChange(fmt.name)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono transition-all ${
                  isFmtActive
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'bg-white/[0.02] text-slate-400 hover:text-slate-200 border border-white/5'
                }`}
              >
                <span className="font-semibold">{fmt.name}</span>
                <span className="text-slate-500 text-[9px]">{fmt.badge}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Benchmark */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span className="text-amber-400">HLS Byte-Range Slicing</span>
        <span className="text-slate-500">Transmux: &lt;8.4ms</span>
      </div>
    </div>
  );
};
