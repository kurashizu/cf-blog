import React from 'react';

export const CornerCrosshairs: React.FC = () => {
  return (
    <div className="pointer-events-none fixed inset-0 z-30 select-none overflow-hidden" aria-hidden="true">
      {/* Top-Left Crosshair */}
      <div className="absolute top-4 left-4 w-4 h-4 text-matte-border-hover">
        <div className="absolute top-2 left-0 w-4 h-[1px] bg-current"></div>
        <div className="absolute top-0 left-2 w-[1px] h-4 bg-current"></div>
      </div>

      {/* Top-Right Crosshair */}
      <div className="absolute top-4 right-4 w-4 h-4 text-matte-border-hover">
        <div className="absolute top-2 left-0 w-4 h-[1px] bg-current"></div>
        <div className="absolute top-0 left-2 w-[1px] h-4 bg-current"></div>
      </div>

      {/* Bottom-Left Crosshair */}
      <div className="absolute bottom-4 left-4 w-4 h-4 text-matte-border-hover">
        <div className="absolute top-2 left-0 w-4 h-[1px] bg-current"></div>
        <div className="absolute top-0 left-2 w-[1px] h-4 bg-current"></div>
      </div>

      {/* Bottom-Right Crosshair */}
      <div className="absolute bottom-4 right-4 w-4 h-4 text-matte-border-hover">
        <div className="absolute top-2 left-0 w-4 h-[1px] bg-current"></div>
        <div className="absolute top-0 left-2 w-[1px] h-4 bg-current"></div>
      </div>

    </div>
  );
};
