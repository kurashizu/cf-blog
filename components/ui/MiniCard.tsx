import * as React from "react";
import { cn } from "@/lib/utils";

interface MiniCardProps extends React.HTMLAttributes<HTMLDivElement> {}

const MiniCard = React.forwardRef<HTMLDivElement, MiniCardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "group bg-bg-card/80 border border-border/50 rounded-lg px-3 py-2.5 transition-all duration-200",
        "hover:border-accent/30 hover:bg-bg-card",
        className
      )}
      {...props}
    />
  )
);
MiniCard.displayName = "MiniCard";

export { MiniCard };