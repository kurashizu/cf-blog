import React from 'react';

export interface IconBaseProps extends React.SVGProps<SVGSVGElement> {
  /** Size in pixels (default: 20) */
  size?: number | string;
  /** Primary stroke or fill color (default: 'currentColor') */
  color?: string;
  /** Stroke width in px (default: 1.5) */
  strokeWidth?: number;
  /** Style variant */
  variant?: 'default' | 'accent' | 'muted' | 'outline';
  /** Additional CSS class */
  className?: string;
}

/**
 * Helper to compute color and classes based on variant
 */
const getVariantClasses = (variant?: IconBaseProps['variant']) => {
  switch (variant) {
    case 'accent':
      return 'text-matte-accent';
    case 'muted':
      return 'text-matte-muted';
    case 'outline':
      return 'text-matte-faint hover:text-matte-text';
    default:
      return 'text-matte-text';
  }
};

/**
 * 1. IconBlog: Architectural Editorial & Technical Writing Badge
 */
export const IconBlog: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* Outer technical document frame */}
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={strokeWidth} />
    {/* Header banner line */}
    <line x1="3" y1="7.5" x2="21" y2="7.5" strokeOpacity="0.35" />
    {/* Editorial text lines */}
    <line x1="7" y1="11.5" x2="17" y2="11.5" />
    <line x1="7" y1="15" x2="14" y2="15" />
    {/* Micro registration marker */}
    <circle cx="5.5" cy="5.25" r="0.75" fill={color} stroke="none" />
    <line x1="17" y1="15" x2="17.01" y2="15" strokeWidth={2} />
  </svg>
);

/**
 * 2. IconShare: Precision Multi-directional Routing & Peer Dispatch Node
 */
export const IconShare: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* Central origin node */}
    <circle cx="6" cy="12" r="2.5" />
    {/* Output target nodes */}
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    {/* Vector routing links */}
    <path d="M 8.5 10.8 L 15.5 7.2" />
    <path d="M 8.5 13.2 L 15.5 16.8" />
    {/* Micro flow crosshair */}
    <path d="M 12 11.5 L 12 12.5" strokeOpacity="0.4" />
  </svg>
);

/**
 * 3. IconShareTube: Minimalist CRT / Video Scanline & Media Stream Badge
 */
export const IconShareTube: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* CRT Monolithic Display Shell */}
    <rect x="2.5" y="4" width="19" height="15" rx="3" strokeWidth={strokeWidth} />
    {/* Phosphor scanlines */}
    <line x1="5" y1="7.5" x2="19" y2="7.5" strokeOpacity="0.25" strokeDasharray="1 2" />
    <line x1="5" y1="15.5" x2="19" y2="15.5" strokeOpacity="0.25" strokeDasharray="1 2" />
    {/* Playback vector prism */}
    <polygon points="10,8.5 16,11.5 10,14.5" fill={color} fillOpacity="0.2" strokeWidth={strokeWidth} />
    {/* Bottom stand bar */}
    <path d="M 9 20 L 15 20" strokeWidth={strokeWidth} />
  </svg>
);

/**
 * 4. IconMail: Cryptographic Dispatch Envelope & Encrypted Protocol Badge
 */
export const IconMail: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* Envelope Frame */}
    <rect x="3" y="4.5" width="18" height="15" rx="2" strokeWidth={strokeWidth} />
    {/* Seal flap lines */}
    <path d="M 3 6.5 L 12 13 L 21 6.5" />
    {/* Hairline security hash dots */}
    <circle cx="12" cy="16.5" r="1" fill={color} fillOpacity="0.6" stroke="none" />
    <path d="M 3 18 L 8.5 13" strokeOpacity="0.3" />
    <path d="M 21 18 L 15.5 13" strokeOpacity="0.3" />
  </svg>
);

/**
 * 5. IconAgent: Autonomous AI Neural Agent Core with Isolate Ring
 */
export const IconAgent: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* Outer orbital ring */}
    <circle cx="12" cy="12" r="9" strokeWidth={strokeWidth} strokeDasharray="3 2" />
    {/* Central reasoning core */}
    <rect x="8" y="8" width="8" height="8" rx="1.5" strokeWidth={strokeWidth} />
    {/* Core eye / quantum point */}
    <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
    {/* Synapse pins */}
    <line x1="12" y1="3" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="21" />
    <line x1="3" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="21" y2="12" />
  </svg>
);

/**
 * 6. IconHuggingFace: High-Precision Matte Reinterpretation of HF Hub Badge
 */
export const IconHuggingFace: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* Outer head contour */}
    <circle cx="12" cy="12" r="9" strokeWidth={strokeWidth} />
    {/* Precise eye curves */}
    <path d="M 7.5 10.5 C 8 9 9.5 9 10 10.5" />
    <path d="M 14 10.5 C 14.5 9 16 9 16.5 10.5" />
    {/* Smile arc */}
    <path d="M 8.5 14 C 10 16.5 14 16.5 15.5 14" />
    {/* Hugging hands side brackets */}
    <path d="M 2.5 11.5 C 1.8 13.5 3 15.5 4.5 15.5" strokeDasharray="1 1.5" />
    <path d="M 21.5 11.5 C 22.2 13.5 21 15.5 19.5 15.5" strokeDasharray="1 1.5" />
  </svg>
);

/**
 * 7. IconGitHub: Technical Hairline Octocat Monorepo & Git Tree Badge
 */
export const IconGitHub: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

/**
 * 8. ServerlessSeal: 100% SERVERLESS Certified Architectural Stamp
 */
export interface ServerlessSealProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  accentColor?: string;
  rotating?: boolean;
}

export const ServerlessSeal: React.FC<ServerlessSealProps> = ({
  size = 72,
  className = '',
  accentColor = 'var(--matte-accent, #9db2a4)',
  rotating = false,
  ...props
}) => (
  <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="overflow-visible"
      {...props}
    >
      <defs>
        {/* Curved Path for Perimeter Text */}
        <path
          id="seal-text-path"
          d="M 60,60 m -44,0 a 44,44 0 1,1 88,0 a 44,44 0 1,1 -88,0"
          fill="none"
        />
      </defs>

      {/* Outer Octagonal / Circular Frame */}
      <circle
        cx="60"
        cy="60"
        r="54"
        stroke="var(--matte-border, rgba(255,255,255,0.15))"
        strokeWidth="1.2"
        strokeDasharray="2 3"
      />
      <circle
        cx="60"
        cy="60"
        r="49"
        stroke="var(--matte-border, rgba(255,255,255,0.25))"
        strokeWidth="0.8"
      />
      <circle
        cx="60"
        cy="60"
        r="35"
        stroke={accentColor}
        strokeWidth="1.2"
        fill="var(--matte-card, #15181e)"
      />

      {/* Rotating Perimeter Typography */}
      <g
        className={rotating ? 'animate-spin' : ''}
        style={{
          transformOrigin: '60px 60px',
          animationDuration: '24s',
        }}
      >
        <text
          fontSize="7.5"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="700"
          fill="var(--matte-muted, #8e95a2)"
          letterSpacing="0.14em"
        >
          <textPath href="#seal-text-path" startOffset="0%">
            100% SERVERLESS • CLOUDFLARE EDGE • ZERO COLD START •
          </textPath>
        </text>
      </g>

      {/* Central Emblem & Inscription */}
      <g className="text-center font-mono">
        <text
          x="60"
          y="54"
          textAnchor="middle"
          fontSize="11"
          fontFamily="Space Grotesk, sans-serif"
          fontWeight="800"
          fill="var(--matte-highlight, #eceeed)"
          letterSpacing="0.04em"
        >
          100%
        </text>
        <text
          x="60"
          y="66"
          textAnchor="middle"
          fontSize="6.5"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="700"
          fill={accentColor}
          letterSpacing="0.1em"
        >
          EDGE V8
        </text>
        <text
          x="60"
          y="74"
          textAnchor="middle"
          fontSize="5"
          fontFamily="JetBrains Mono, monospace"
          fill="var(--matte-faint, #4e5563)"
          letterSpacing="0.06em"
        >
          0ms COLD START
        </text>
      </g>

      {/* 4-Quadrant Registration Crosses */}
      <path d="M 60 2 L 60 8" stroke={accentColor} strokeWidth="1" />
      <path d="M 60 112 L 60 118" stroke={accentColor} strokeWidth="1" />
      <path d="M 2 60 L 8 60" stroke={accentColor} strokeWidth="1" />
      <path d="M 112 60 L 118 60" stroke={accentColor} strokeWidth="1" />
    </svg>
  </div>
);

/**
 * 9. EdgeNodeIcon: Multi-region Edge PoP Diamond Badge
 */
export const EdgeNodeIcon: React.FC<IconBaseProps & { region?: string; active?: boolean }> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  region = 'NRT',
  active = true,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* Diamond frame */}
    <polygon points="12,2 22,12 12,22 2,12" strokeWidth={strokeWidth} />
    {/* Inner node square */}
    <rect x="9" y="9" width="6" height="6" rx="1" strokeWidth={1} />
    {/* Center signal ping */}
    {active && <circle cx="12" cy="12" r="1.5" fill="var(--matte-accent, #9db2a4)" stroke="none" />}
  </svg>
);

/**
 * 10. IconD1Database: Distributed SQLite Relational Table Matrix
 */
export const IconD1Database: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* Cylinder top ellipse */}
    <ellipse cx="12" cy="5" rx="9" ry="3" strokeWidth={strokeWidth} />
    {/* Middle tier curve */}
    <path d="M 21 12 C 21 13.66 16.97 15 12 15 C 7.03 15 3 13.66 3 12" />
    {/* Bottom tier curve */}
    <path d="M 21 19 C 21 20.66 16.97 22 12 22 C 7.03 22 3 20.66 3 19" />
    {/* Left and right vertical walls */}
    <line x1="3" y1="5" x2="3" y2="19" />
    <line x1="21" y1="5" x2="21" y2="19" />
    {/* SQL Partition Hairline */}
    <line x1="12" y1="5" x2="12" y2="15" strokeOpacity="0.4" strokeDasharray="1 2" />
  </svg>
);

/**
 * 11. IconVectorize: Vector Space Hyperplane Embedding Badge
 */
export const IconVectorize: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* Coordinate axis */}
    <line x1="3" y1="21" x2="21" y2="21" />
    <line x1="3" y1="21" x2="3" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" strokeDasharray="1 2" strokeOpacity="0.4" />
    {/* High-dimensional cluster nodes */}
    <circle cx="9" cy="9" r="1.5" fill={color} />
    <circle cx="16" cy="6" r="1.5" fill={color} />
    <circle cx="18" cy="14" r="1.5" fill={color} />
    {/* Vector distance path */}
    <path d="M 9 9 L 16 6 L 18 14" strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.75" />
  </svg>
);

/**
 * 12. IconKVStore: Sub-ms Key-Value Cache Slot Badge
 */
export const IconKVStore: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    <rect x="3" y="4" width="18" height="6" rx="1.5" strokeWidth={strokeWidth} />
    <rect x="3" y="14" width="18" height="6" rx="1.5" strokeWidth={strokeWidth} />
    <circle cx="7" cy="7" r="1" fill={color} stroke="none" />
    <circle cx="7" cy="17" r="1" fill={color} stroke="none" />
    <line x1="12" y1="7" x2="17" y2="7" strokeOpacity="0.5" />
    <line x1="12" y1="17" x2="17" y2="17" strokeOpacity="0.5" />
  </svg>
);

/**
 * 13. IconR2Storage: Zero-Egress Object Storage Vault Badge
 */
export const IconR2Storage: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  variant = 'default',
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 ${getVariantClasses(variant)} ${className}`}
    {...props}
  >
    {/* Isometric Cube Vault */}
    <path d="M 21 8 L 12 3 L 3 8 L 12 13 L 21 8 Z" strokeWidth={strokeWidth} />
    <path d="M 3 8 L 3 16 L 12 21 L 12 13" strokeWidth={strokeWidth} />
    <path d="M 21 8 L 21 16 L 12 21" strokeWidth={strokeWidth} />
    {/* Micro registration badge */}
    <line x1="12" y1="13" x2="12" y2="17" strokeOpacity="0.4" />
  </svg>
);
