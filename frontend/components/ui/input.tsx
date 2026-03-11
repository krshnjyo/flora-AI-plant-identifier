/**
 * File: frontend/components/ui/input.tsx
 * Purpose: UI component module used to compose page-level screens.
 *
 * Responsibilities:
 * - Encapsulates presentational markup and local interaction behavior
 * - Receives data via props and emits predictable UI states
 *
 * Design Notes:
 * - Separates reusable UI concerns from route/page business logic
 */

import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, placeholder, ["aria-label"]: ariaLabel, ["aria-labelledby"]: ariaLabelledBy, ...props }, ref) => {
    const fallbackAriaLabel =
      !ariaLabel &&
      !ariaLabelledBy &&
      typeof placeholder === "string" &&
      placeholder.trim() &&
      type !== "hidden" &&
      type !== "file"
        ? placeholder
        : undefined;

    return (
      <input
        type={type}
        placeholder={placeholder}
        aria-label={ariaLabel || fallbackAriaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "flex h-11 w-full rounded-xl border border-glass-border bg-glass px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
