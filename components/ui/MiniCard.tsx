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
        "hover:border-accent/40 hover:bg-bg-card/80 hover:shadow-[0_0_25px_var(--accent-glow)]",
        className
      )}
      {...props}
    />
  )
);
MiniCard.displayName = "MiniCard";

export { MiniCard };