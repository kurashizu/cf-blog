import * as React from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "group relative flex flex-col min-h-[180px] bg-bg-card border border-border rounded-xl transition-all duration-300",
        "hover:border-accent/50 hover:shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_50px_var(--accent-subtle)]",
        "hover:-translate-y-1",
        className
      )}
      style={{
        transition: "all 0.3s ease, box-shadow 0.5s ease, border-color 0.5s ease",
      }}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 pb-2 shrink-0 flex items-center justify-center", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardContent = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 pt-0 flex-1 flex flex-col justify-center items-center", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 pt-0 flex items-center gap-2 shrink-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardContent, CardFooter };