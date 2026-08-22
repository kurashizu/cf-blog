import React from 'react';

export interface CrosshairProps extends React.SVGProps<SVGSVGElement> {
  /** Size in pixels (default: 24) */
  size?: number | string;
  /** Primary stroke color (default: 'currentColor') */
  color?: string;
  /** Stroke width in pixels (default: 1) */
  strokeWidth?: number;
  /** Coordinate label e.g. "X01", "[00,00]" */
  label?: string;
  /** Label position: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left' */
  labelPlacement?: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left';
  /** Additional CSS classes */
  className?: string;
}

/**
 * 1. Crosshair: Precision 4-Quadrant Registration Crosshair
 */
export const Crosshair: React.FC<CrosshairProps> = ({
  size = 24,
  color = 'currentColor',
  strokeWidth = 1,
  label,
  labelPlacement = 'bottom-right',
  className = '',
  ...props
}) => (
  <div className={`relative inline-flex items-center justify-center select-none font-mono ${className}`}>
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      className="overflow-visible"
      {...props}
    >
      {/* Central Cross Lines */}
      <line x1="12" y1="2" x2="12" y2="22" strokeLinecap="round" />
      <line x1="2" y1="12" x2="22" y2="12" strokeLinecap="round" />
      {/* Inner Gap Clear Circle */}
      <circle cx="12" cy="12" r="2.5" strokeWidth={strokeWidth * 0.8} />
      {/* Center Target Dot */}
      <circle cx="12" cy="12" r="0.75" fill={color} stroke="none" />
      {/* Corner Registration Reticles */}
      <path d="M 4 8 L 4 4 L 8 4" strokeWidth={strokeWidth * 0.75} strokeOpacity="0.4" />
      <path d="M 20 8 L 20 4 L 16 4" strokeWidth={strokeWidth * 0.75} strokeOpacity="0.4" />
      <path d="M 4 16 L 4 20 L 8 20" strokeWidth={strokeWidth * 0.75} strokeOpacity="0.4" />
      <path d="M 20 16 L 20 20 L 16 20" strokeWidth={strokeWidth * 0.75} strokeOpacity="0.4" />
    </svg>
    {label && (
      <span
        className={`absolute text-[8px] tracking-tight text-matte-faint pointer-events-none whitespace-nowrap ${
          labelPlacement === 'bottom-right'
            ? 'top-full left-full ml-1 mt-0.5'
            : labelPlacement === 'top-right'
            ? 'bottom-full left-full ml-1 mb-0.5'
            : labelPlacement === 'top-left'
            ? 'bottom-full right-full mr-1 mb-0.5'
            : 'top-full right-full mr-1 mt-0.5'
        }`}
      >
        {label}
      </span>
    )}
  </div>
);

/**
 * 2. CornerMarks: Architectural 4-Corner Frame Reticles (┌ ┐ └ ┘)
 */
export interface CornerMarksProps {
  /** Arm length of each corner tick (default: 12) */
  size?: number;
  /** Hairline stroke width (default: 1) */
  strokeWidth?: number;
  /** Custom stroke color */
  color?: string;
  /** Offset padding in pixels (default: -2) */
  offset?: number;
  /** Extra container className */
  className?: string;
}

export const CornerMarks: React.FC<CornerMarksProps> = ({
  size = 12,
  strokeWidth = 1,
  color = 'var(--matte-border-hover, rgba(255,255,255,0.25))',
  offset = -2,
  className = '',
}) => {
  const styleOffset = { top: offset, bottom: offset, left: offset, right: offset };

  return (
    <div className={`absolute inset-0 pointer-events-none select-none ${className}`}>
      {/* Top Left */}
      <svg
        className="absolute"
        style={{ top: styleOffset.top, left: styleOffset.left }}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
      >
        <path d={`M 0 ${size} L 0 0 L ${size} 0`} stroke={color} strokeWidth={strokeWidth} />
      </svg>

      {/* Top Right */}
      <svg
        className="absolute"
        style={{ top: styleOffset.top, right: styleOffset.right }}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
      >
        <path d={`M 0 0 L ${size} 0 L ${size} ${size}`} stroke={color} strokeWidth={strokeWidth} />
      </svg>

      {/* Bottom Left */}
      <svg
        className="absolute"
        style={{ bottom: styleOffset.bottom, left: styleOffset.left }}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
      >
        <path d={`M 0 0 L 0 ${size} L ${size} ${size}`} stroke={color} strokeWidth={strokeWidth} />
      </svg>

      {/* Bottom Right */}
      <svg
        className="absolute"
        style={{ bottom: styleOffset.bottom, right: styleOffset.right }}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
      >
        <path d={`M 0 ${size} L ${size} ${size} L ${size} 0`} stroke={color} strokeWidth={strokeWidth} />
      </svg>
    </div>
  );
};

/**
 * 3. RulerTicks: Technical Edge Ruler Scale
 */
export interface RulerTicksProps {
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Number of segments / ticks (default: 20) */
  ticks?: number;
  /** Major tick interval (e.g. every 5 ticks) */
  majorInterval?: number;
  /** Custom stroke color */
  color?: string;
  /** Show numerical millimeter markings */
  showLabels?: boolean;
  className?: string;
}

export const RulerTicks: React.FC<RulerTicksProps> = ({
  orientation = 'horizontal',
  ticks = 20,
  majorInterval = 5,
  color = 'var(--matte-border, rgba(255,255,255,0.12))',
  showLabels = false,
  className = '',
}) => {
  return (
    <div
      className={`select-none pointer-events-none font-mono ${
        orientation === 'horizontal' ? 'w-full h-4 flex items-end justify-between' : 'h-full w-4 flex flex-col justify-between'
      } ${className}`}
    >
      {Array.from({ length: ticks }).map((_, i) => {
        const isMajor = i % majorInterval === 0;
        const tickHeight = isMajor ? 'h-3' : 'h-1.5';
        const tickWidth = isMajor ? 'w-3' : 'w-1.5';

        return (
          <div
            key={i}
            className={`flex ${orientation === 'horizontal' ? 'flex-col items-center' : 'flex-row items-center'} gap-0.5`}
          >
            {orientation === 'horizontal' ? (
              <>
                {showLabels && isMajor && (
                  <span className="text-[7px] text-matte-faint leading-none mb-0.5">{i * 10}</span>
                )}
                <div className={`${tickHeight} w-[1px]`} style={{ backgroundColor: color }} />
              </>
            ) : (
              <>
                <div className={`${tickWidth} h-[1px]`} style={{ backgroundColor: color }} />
                {showLabels && isMajor && (
                  <span className="text-[7px] text-matte-faint leading-none ml-0.5">{i * 10}</span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

/**
 * 4. SchematicFrame: Blueprint Container Frame with Engraved Specs
 */
export interface SchematicFrameProps {
  children?: React.ReactNode;
  title?: string;
  specId?: string;
  region?: string;
  showTicks?: boolean;
  className?: string;
}

export const SchematicFrame: React.FC<SchematicFrameProps> = ({
  children,
  title = 'SYS_SCHEMATIC',
  specId = 'CF-REV-2026.8',
  region = 'NRT // TOKYO',
  showTicks = true,
  className = '',
}) => (
  <div className={`relative p-4 md:p-6 rounded border border-matte-border bg-matte-card/75 backdrop-blur-sm ${className}`}>
    {/* 4-Corner Hairline Markings */}
    <CornerMarks size={14} offset={-1} />

    {/* Top Header Registry Ribbon */}
    <div className="flex items-center justify-between pb-3 mb-4 border-b border-matte-border/60 text-[10px] font-mono text-matte-muted select-none">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-matte-accent inline-block" />
        <span className="text-matte-text font-bold tracking-wider">{title}</span>
        <span className="text-matte-faint">[{specId}]</span>
      </div>

      <div className="flex items-center gap-3 text-matte-faint">
        <span className="hidden sm:inline">REGION: {region}</span>
        <span className="text-matte-border">•</span>
        <span className="text-emerald-400/90 font-medium">ISOLATE: ACTIVE</span>
      </div>
    </div>

    {/* Frame Content */}
    <div className="relative">{children}</div>

    {/* Bottom Footer Registry Ribbon */}
    {showTicks && (
      <div className="mt-4 pt-2 border-t border-matte-border/40 flex items-center justify-between text-[8px] font-mono text-matte-faint select-none">
        <span>ARCHITECTURAL_GRID // 0.5MM</span>
        <RulerTicks orientation="horizontal" ticks={16} majorInterval={4} className="max-w-[200px]" />
        <span>SEC_HASH: 0x8F92A</span>
      </div>
    )}
  </div>
);

/**
 * 5. AxisLabels: Precision Spatial X / Y Readout Badges
 */
export interface AxisLabelsProps {
  x?: number | string;
  y?: number | string;
  prefix?: string;
  className?: string;
}

export const AxisLabels: React.FC<AxisLabelsProps> = ({
  x = 0,
  y = 0,
  prefix = 'COORD',
  className = '',
}) => (
  <div className={`inline-flex items-center gap-2 px-2 py-1 rounded bg-matte-bg/80 border border-matte-border text-[9px] font-mono text-matte-muted select-none ${className}`}>
    <span className="text-matte-accent font-semibold">{prefix}:</span>
    <span>X: <strong className="text-matte-text">{x}</strong></span>
    <span>Y: <strong className="text-matte-text">{y}</strong></span>
  </div>
);

/**
 * 6. RegistrationMark: Circular Optical CAD Alignment Target
 */
export const RegistrationMark: React.FC<{ size?: number; color?: string; className?: string }> = ({
  size = 28,
  color = 'currentColor',
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    stroke={color}
    strokeWidth="1"
    className={`inline-block select-none ${className}`}
  >
    <circle cx="16" cy="16" r="13" strokeDasharray="2 2" strokeOpacity="0.4" />
    <circle cx="16" cy="16" r="8" strokeWidth="1" />
    <line x1="16" y1="1" x2="16" y2="31" strokeWidth="0.75" />
    <line x1="1" y1="16" x2="31" y2="16" strokeWidth="0.75" />
    <circle cx="16" cy="16" r="2" fill={color} stroke="none" />
  </svg>
);

/**
 * 7. StatusBeacon: Pulsing Architectural Status LED with Live Wave Ring
 */
export interface StatusBeaconProps {
  status?: 'healthy' | 'warning' | 'standby' | 'syncing';
  label?: string;
  className?: string;
}

export const StatusBeacon: React.FC<StatusBeaconProps> = ({
  status = 'healthy',
  label = '200 OK // EDGE',
  className = '',
}) => {
  const getColors = () => {
    switch (status) {
      case 'warning':
        return { dot: 'bg-amber-400', ping: 'bg-amber-400', text: 'text-amber-300' };
      case 'standby':
        return { dot: 'bg-matte-faint', ping: 'bg-matte-muted', text: 'text-matte-muted' };
      case 'syncing':
        return { dot: 'bg-cyan-400', ping: 'bg-cyan-400', text: 'text-cyan-300' };
      case 'healthy':
      default:
        return { dot: 'bg-emerald-400', ping: 'bg-emerald-400', text: 'text-emerald-400' };
    }
  };

  const { dot, ping, text } = getColors();

  return (
    <div className={`inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-matte-card/80 border border-matte-border text-[10px] font-mono select-none ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${ping}`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dot}`} />
      </span>
      <span className={`font-semibold tracking-tight ${text}`}>{label}</span>
    </div>
  );
};
