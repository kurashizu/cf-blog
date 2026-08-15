import * as React from "react";
import { cn } from "@/lib/utils";

interface MiniCardProps extends React.HTMLAttributes<HTMLDivElement> {}

const MiniCard = React.forwardRef<HTMLDivElement, MiniCardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "group bg-bg-card/60 backdrop-blur-sm rounded-lg px-4 py-3 transition-all duration-200",
        "border border-transparent",
        // Resting shadow for subtle floating feel.
        "shadow-[0_2px_12px_rgba(0,0,0,0.4)]",
        "hover:border-accent/40 hover:bg-bg-card/80 hover:-translate-y-1 hover:shadow-[0_10px_28px_rgba(0,0,0,0.55),0_0_30px_var(--accent-subtle)]",
        className
      )}
      {...props}
    />
  )
);
MiniCard.displayName = "MiniCard";

export { MiniCard };