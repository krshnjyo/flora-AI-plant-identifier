/**
 * File: frontend/app/about/error.tsx
 * Purpose: Source module (error.tsx) used by the Flora application.
 *
 * Responsibilities:
 * - Implements feature-specific logic used by the active runtime
 * - Maintains predictable behavior through explicit module boundaries
 *
 * Design Notes:
 * - Scoped to keep code discoverable and maintainable over time
 */

"use client";

import { Button } from "@/components/ui/button";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
            <h2 className="text-xl font-bold text-red-600">Something went wrong!</h2>
            <p className="text-zinc-500">{error.message}</p>
            <Button onClick={() => reset()}>Try again</Button>
        </div>
    );
}
