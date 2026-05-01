import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-primary disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
          {
            "bg-accent text-white hover:bg-accent/90 hover:shadow-[0_0_20px_var(--accent-glow)] hover:-translate-y-0.5":
              variant === "primary",
            "border border-border bg-transparent text-text-primary hover:bg-bg-secondary hover:-translate-y-0.5":
              variant === "secondary",
            "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]":
              variant === "danger",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };