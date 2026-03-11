/**
 * File: frontend/components/ui/textarea.tsx
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

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, placeholder, ["aria-label"]: ariaLabel, ["aria-labelledby"]: ariaLabelledBy, ...props }, ref) => {
    const fallbackAriaLabel =
      !ariaLabel && !ariaLabelledBy && typeof placeholder === "string" && placeholder.trim() ? placeholder : undefined;

    return (
      <textarea
        placeholder={placeholder}
        aria-label={ariaLabel || fallbackAriaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "min-h-20 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea };
