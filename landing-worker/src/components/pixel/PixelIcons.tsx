import React from 'react';

interface PixelIconProps {
  size?: number;
  className?: string;
  color?: string;
}

// Crisp Pixel SVG Wrapper (Streamline Pixel Style)
const PixelSvg: React.FC<{ size?: number; className?: string; viewBox?: string; children: React.ReactNode }> = ({
  size = 20,
  className = '',
  viewBox = '0 0 16 16',
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    fill="currentColor"
    className={`inline-block shrink-0 ${className}`}
    style={{ shapeRendering: 'crispEdges' }}
  >
    {children}
  </svg>
);

// 1. Pixel Terminal
export const PixelTerminal: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M1 2h14v12H1V2zm2 2v8h10V4H3zm2 2h2v1H5V6zm2 1h2v1H7V7zm-2 1h2v1H5V8zm5 1h3v1h-3V9z" />
  </PixelSvg>
);

// 2. Pixel Blog / Document
export const PixelBlog: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M3 1h8l3 3v11H3V1zm2 2v10h8V5h-3V3H5zm2 4h4v1H7V7zm0 2h4v1H7V9zm0 2h3v1H7v-1z" />
  </PixelSvg>
);

// 3. Pixel Agent / AI Chip
export const PixelAgent: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M7 1h2v2H7V1zm-4 3h10v9H3V4zm2 2v5h6V6H5zm1 1h1v1H6V7zm3 0h1v1H9V7zm-2 2h2v1H7V9zm-6-2h1v3H1V7zm14 0h1v3h-1V7z" />
  </PixelSvg>
);

// 4. Pixel Vault / Share Storage
export const PixelVault: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M2 2h12v12H2V2zm2 2v8h8V4H4zm3 2h2v1H7V6zm-1 2h1v1H6V8zm3 0h1v1H9V8zm-2 1h2v1H7V9zm1-5h1v1H8V4zm0 6h1v1H8v-1z" />
  </PixelSvg>
);

// 5. Pixel Video / ShareTube
export const PixelVideo: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M1 3h14v10H1V3zm2 2v6h10V5H3zm3 1l4 2-4 2V6z" />
  </PixelSvg>
);

// 6. Pixel Mail / Envelope
export const PixelMail: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M1 3h14v10H1V3zm2 2v1l5 4 5-4V5H3zm0 3v3h10V8L8 12 3 8z" />
  </PixelSvg>
);

// 7. Pixel Rules / Book
export const PixelRules: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M2 2h12v12H2V2zm2 2v8h3V4H4zm5 0v8h3V4H9zm-1 0v8h1V4H8zm-3 2h1v1H5V6zm0 2h1v1H5V8zm5-2h1v1h-1V6zm0 2h1v1h-1V8z" />
  </PixelSvg>
);

// 8. Pixel Topology / Network Server
export const PixelTopology: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M6 1h4v3H6V1zM1 7h4v3H1V7zm10 0h4v3h-4V7zM6 12h4v3H6v-3zM7 4h2v2H7V4zm0 6h2v2H7v-2zM3 5h2v2H3V5zm8 0h2v2h-2V5z" />
  </PixelSvg>
);

// 9. Pixel Globe / Ping
export const PixelGlobe: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M5 1h6v1H5V1zM3 2h2v1H3V2zm8 0h2v1h-2V2zm-9 2h2v2H2V4zm12 0h2v2h-2V4zm-13 3h2v2H1V7zm14 0h2v2h-2V7zM2 10h2v2H2v-2zm12 0h2v2h-2v-2zm-9 3h2v1H5v-1zm6 0h2v1h-2v-1zm-6 1h6v1H5v-1zM7 3h2v10H7V3zM4 6h8v1H4V6zm0 3h8v1H4V9z" />
  </PixelSvg>
);

// 10. Pixel Audio / Sound Wave
export const PixelAudio: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M1 6h2v4H1V6zm3-2h2v8H4V4zm3-3h2v14H7V1zm3 3h2v10h-2V4zm3 2h2v4h-2V6z" />
  </PixelSvg>
);

// 11. Pixel Arrow ↗
export const PixelArrowUpRight: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M6 3h7v7h-2V6.4L4.4 13 3 11.6 9.6 5H6V3z" />
  </PixelSvg>
);

// 12. Pixel Check
export const PixelCheck: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M13 3l1.5 1.5-8.5 8.5L1 8l1.5-1.5 3.5 3.5L13 3z" />
  </PixelSvg>
);

// 13. Pixel Close / X
export const PixelClose: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M3 2l5 5 5-5 1 1-5 5 5 5-1 1-5-5-5 5-1-1 5-5-5-5 1-1z" />
  </PixelSvg>
);

// 14. Pixel GitHub
export const PixelGitHub: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M5 1h6v1H5V1zm-2 2h2v1H3V3zm8 0h2v1h-2V3zM2 4h1v3H2V4zm11 0h1v3h-1V4zM1 7h1v4H1V7zm13 0h1v4h-1V7zM2 11h1v2H2v-2zm11 0h1v2h-1v-2zm-9 2h1v1H4v-1zm7 0h1v1h-1v-1zm-6 1h6v1H5v-1zm0-7h2v2H5V7zm4 0h2v2H9V7zm-2 4h2v1H7v-1z" />
  </PixelSvg>
);

// 15. Pixel Hugging Face (Robot Smiley)
export const PixelHuggingFace: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M4 2h8v1H4V2zM2 3h2v1H2V3zm10 0h2v1h-2V3zM1 4h1v8H1V4zm13 0h1v8h-1V4zM2 12h2v1H2v-1zm10 0h2v1h-2v-1zM4 13h8v1H4v-1zM4 6h2v2H4V6zm6 0h2v2h-2V6zm-3 3h2v1H7V9zm-2 1h1v1H5v-1zm5 0h1v1h-1v-1zm-3 1h2v1H7v-1z" />
  </PixelSvg>
);

// 16. Pixel Hardware / PCB (OSHWHub Open Source Hardware)
export const PixelHardware: React.FC<PixelIconProps> = ({ size, className }) => (
  <PixelSvg size={size} className={className}>
    <path d="M2 1h1v2h2V1h1v2h4V1h1v2h2V1h1v2h1v10h-1v2h-1v-2h-2v2h-1v-2H6v2H5v-2H3v2H2v-2H1V3h1V1zm1 3v8h10V4H3zm2 2h3v3H5V6zm4 0h2v1H9V6zm0 2h2v1H9V8zm-4 2h6v1H5v-1z" />
  </PixelSvg>
);
