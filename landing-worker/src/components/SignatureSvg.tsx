import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface SignatureSvgProps extends React.SVGProps<SVGSVGElement> {
  /** Width in pixels or CSS units (default: 320) */
  width?: number | string;
  /** Height in pixels or CSS units (default: 120) */
  height?: number | string;
  /** Primary stroke color (default: 'currentColor') */
  color?: string;
  /** Accent stroke color for seal/glow (default: 'var(--matte-accent, #9db2a4)') */
  accentColor?: string;
  /** Base stroke width (default: 2.2) */
  strokeWidth?: number;
  /** Duration of the stroke drawing animation in seconds (default: 2.2) */
  duration?: number;
  /** Whether to animate automatically on mount / scroll into view (default: true) */
  autoPlay?: boolean;
  /** Replay animation when hovered (default: true) */
  hoverToReplay?: boolean;
  /** Show the flourish underline stroke (default: true) */
  showUnderline?: boolean;
  /** Show the micro architectural date/seal stamp (default: true) */
  showStamp?: boolean;
  /** Custom stamp label (default: 'EST. 2026 // KRSZ') */
  stampText?: string;
  /** Callback when stroke drawing animation completes */
  onAnimationComplete?: () => void;
  /** Optional custom CSS class */
  className?: string;
}

export interface SignatureSvgHandle {
  replay: () => void;
  reset: () => void;
}

/**
 * SignatureSvg: High-precision animated vector signature component for KRSZ.
 * Features realistic cursive bezier flow, stroke-dash drawing transitions,
 * micro architectural registration marks, and interactive hover replay.
 */
export const SignatureSvg: React.FC<SignatureSvgProps> = ({
  width = 320,
  height = 120,
  color = 'currentColor',
  accentColor = 'var(--matte-accent, #9db2a4)',
  strokeWidth = 2.2,
  duration = 2.2,
  autoPlay = true,
  hoverToReplay = true,
  showUnderline = true,
  showStamp = true,
  stampText = 'EST. 2026 // KRSZ.IN',
  onAnimationComplete,
  className = '',
  ...restProps
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [key, setKey] = useState(0);
  const containerRef = useRef<SVGSVGElement | null>(null);

  const startAnimation = useCallback(() => {
    setIsDrawing(false);
    // Force re-render key to re-trigger CSS keyframe/stroke-dash animations
    setKey((prev) => prev + 1);
    requestAnimationFrame(() => {
      setIsDrawing(true);
      setHasAnimated(true);
    });
  }, []);

  // Intersection observer for viewport entry trigger
  useEffect(() => {
    if (!autoPlay) return;

    const elem = containerRef.current;
    if (!elem) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            startAnimation();
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(elem);
    return () => observer.disconnect();
  }, [autoPlay, hasAnimated, startAnimation]);

  // Handle animation complete callback
  useEffect(() => {
    if (isDrawing) {
      const timer = setTimeout(() => {
        setIsDrawing(false);
        onAnimationComplete?.();
      }, duration * 1000 + 400);
      return () => clearTimeout(timer);
    }
  }, [isDrawing, duration, onAnimationComplete]);

  const handleMouseEnter = () => {
    if (hoverToReplay && !isDrawing) {
      startAnimation();
    }
  };

  // Primary Cursive Signature Paths (KRSZ / Kurashizu Fluid Monogram)
  // Masterfully plotted bezier curves with organic acceleration & deceleration
  const pathData = {
    // 1. Initial flourish and ascending down-stem of 'K'
    stemK: 'M 42 78 C 38 62 46 36 62 26 C 72 20 78 24 74 36 C 68 56 52 98 46 112 C 43 118 41 122 39 122',
    
    // 2. The upper loop & diagonal kick connecting to 'u'-'r'-'a'
    bodyKtoR: 'M 48 58 C 58 42 76 34 84 44 C 90 52 82 66 68 76 C 78 80 94 92 108 94 C 118 95 124 90 128 80 C 132 70 136 62 142 62 C 146 62 146 72 146 80 C 146 90 156 94 164 92 C 172 90 180 82 184 72',
    
    // 3. 's'-'h'-'i'-'z'-'u' signature loop cascade
    ligatureSZ: 'M 184 72 C 188 64 195 56 202 56 C 208 56 206 66 198 78 C 192 88 198 94 208 94 C 218 94 226 84 232 70 C 238 54 246 32 250 28 C 254 24 258 28 254 44 C 248 68 244 86 248 94 C 252 100 262 94 270 86 C 278 78 284 66 292 66 C 298 66 296 76 288 88 C 282 98 288 104 300 98 C 314 90 332 76 348 58',
    
    // 4. Sweeping architectural flourish underline
    flourishUnderline: 'M 28 132 C 84 136 172 138 248 126 C 304 116 358 98 392 82 C 404 76 414 70 418 64',
    
    // 5. Terminal accent mark / dot
    accentDot: 'M 426 60 C 428 58 430 58 432 60 C 434 62 434 64 432 66 C 430 68 428 68 426 66 C 424 64 424 62 426 60 Z'
  };

  return (
    <div 
      className={`relative inline-block select-none group cursor-pointer ${className}`}
      onMouseEnter={handleMouseEnter}
      onClick={startAnimation}
      title="Click or hover to replay signature"
    >
      <svg
        key={key}
        ref={containerRef}
        viewBox="0 0 460 160"
        width={width}
        height={height}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible transition-transform duration-300 group-hover:scale-[1.01]"
        {...restProps}
      >
        <defs>
          {/* Subtle glow filter for matte neon/accent resonance */}
          <filter id="sig-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Linear gradient for flourish path */}
          <linearGradient id="sig-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="70%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.85" />
          </linearGradient>

          {/* Underline gradient */}
          <linearGradient id="sig-underline-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.3" />
            <stop offset="50%" stopColor={color} stopOpacity="0.85" />
            <stop offset="95%" stopColor={accentColor} stopOpacity="1" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ambient registration corner crosshairs */}
        <g className="opacity-30 transition-opacity duration-300 group-hover:opacity-75" stroke={accentColor} strokeWidth="0.75">
          <path d="M 12 18 L 22 18 M 17 13 L 17 23" />
          <path d="M 438 18 L 448 18 M 443 13 L 443 23" />
          <path d="M 12 142 L 22 142 M 17 137 L 17 147" />
          <path d="M 438 142 L 448 142 M 443 137 L 443 147" />
        </g>

        {/* Micro Guide Rule Lines */}
        <line
          x1="24"
          y1="132"
          x2="436"
          y2="132"
          stroke="currentColor"
          strokeOpacity="0.06"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <line
          x1="24"
          y1="38"
          x2="436"
          y2="38"
          stroke="currentColor"
          strokeOpacity="0.04"
          strokeWidth="1"
          strokeDasharray="2 6"
        />

        {/* 1. Main Signature Strokes */}
        <g
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: isDrawing ? 'drop-shadow(0 0 2px var(--matte-accent-glow, rgba(157,178,164,0.3)))' : 'none'
          }}
        >
          {/* Stem K */}
          <path
            d={pathData.stemK}
            stroke="url(#sig-gradient)"
            strokeWidth={strokeWidth * 1.1}
            pathLength="1"
            className={isDrawing ? 'animate-signature-stem' : ''}
            style={{
              strokeDasharray: '1',
              strokeDashoffset: isDrawing ? '1' : '0',
              animation: isDrawing ? `sigDraw ${duration * 0.35}s cubic-bezier(0.4, 0, 0.2, 1) forwards` : 'none',
            }}
          />

          {/* Body K to R */}
          <path
            d={pathData.bodyKtoR}
            stroke="url(#sig-gradient)"
            strokeWidth={strokeWidth}
            pathLength="1"
            style={{
              strokeDasharray: '1',
              strokeDashoffset: isDrawing ? '1' : '0',
              animation: isDrawing
                ? `sigDraw ${duration * 0.45}s cubic-bezier(0.35, 0, 0.25, 1) ${duration * 0.22}s forwards`
                : 'none',
            }}
          />

          {/* Ligature S-Z */}
          <path
            d={pathData.ligatureSZ}
            stroke="url(#sig-gradient)"
            strokeWidth={strokeWidth * 0.95}
            pathLength="1"
            style={{
              strokeDasharray: '1',
              strokeDashoffset: isDrawing ? '1' : '0',
              animation: isDrawing
                ? `sigDraw ${duration * 0.5}s cubic-bezier(0.3, 0, 0.2, 1) ${duration * 0.48}s forwards`
                : 'none',
            }}
          />

          {/* Underline Flourish */}
          {showUnderline && (
            <path
              d={pathData.flourishUnderline}
              stroke="url(#sig-underline-grad)"
              strokeWidth={strokeWidth * 1.25}
              pathLength="1"
              style={{
                strokeDasharray: '1',
                strokeDashoffset: isDrawing ? '1' : '0',
                animation: isDrawing
                  ? `sigDraw ${duration * 0.42}s cubic-bezier(0.2, 0.8, 0.25, 1) ${duration * 0.72}s forwards`
                  : 'none',
              }}
            />
          )}

          {/* Accent Terminal Dot */}
          <path
            d={pathData.accentDot}
            fill={accentColor}
            className="transition-transform duration-300"
            style={{
              opacity: isDrawing ? 0 : 1,
              animation: isDrawing
                ? `sigFadeIn 0.3s ease-out ${duration * 0.95}s forwards`
                : 'none',
            }}
          />
        </g>

        {/* Architectural Micro-Stamp (Haoqi / KRSZ Design Authenticity Mark) */}
        {showStamp && (
          <g
            className="font-mono transition-opacity duration-300"
            style={{
              opacity: isDrawing ? 0 : 0.65,
              animation: isDrawing ? `sigFadeIn 0.4s ease-out ${duration}s forwards` : 'none',
            }}
          >
            {/* Box container */}
            <rect
              x="28"
              y="142"
              width="132"
              height="14"
              rx="2"
              fill="var(--matte-card, #15181e)"
              stroke="var(--matte-border, rgba(255,255,255,0.08))"
              strokeWidth="0.75"
            />
            {/* Pulsing indicator dot */}
            <circle
              cx="35"
              cy="149"
              r="2"
              fill={accentColor}
              className="animate-pulse"
            />
            {/* Stamp label */}
            <text
              x="42"
              y="152.5"
              fontSize="7"
              fontFamily="JetBrains Mono, monospace"
              letterSpacing="0.08em"
              fill="var(--matte-muted, #8e95a2)"
            >
              {stampText}
            </text>

            {/* Right coordinate tag */}
            <text
              x="430"
              y="152.5"
              textAnchor="end"
              fontSize="6.5"
              fontFamily="JetBrains Mono, monospace"
              letterSpacing="0.05em"
              fill="var(--matte-faint, #4e5563)"
            >
              SIGN_V4 // 35.6762°N 139.6503°E
            </text>
          </g>
        )}
      </svg>

      {/* Inline styles for keyframe stroke-dash animation */}
      <style>{`
        @keyframes sigDraw {
          0% {
            stroke-dashoffset: 1;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes sigFadeIn {
          0% {
            opacity: 0;
            transform: scale(0.6);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default SignatureSvg;
