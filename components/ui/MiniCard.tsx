import * as React from "react";
import { cn } from "@/lib/utils";

interface MiniCardProps extends React.HTMLAttributes<HTMLDivElement> {}

const MiniCard = React.forwardRef<HTMLDivElement, MiniCardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "group bg-bg-card/85 rounded-lg px-4 py-3 border border-transparent shadow-[0_3px_14px_rgba(0,0,0,0.36)] transition-[transform,border-color,background-color] duration-200",
        "hover:border-accent/40 hover:bg-bg-card/95 hover:shadow-[0_0_25px_var(--accent-glow)] hover:-translate-y-0.5",
        className
      )}
      {...props}
    />
  )
);
MiniCard.displayName = "MiniCard";

export { MiniCard };