"use client";

import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceButtonTone = "default" | "accent" | "danger";

export function WorkspaceButton({
  label,
  title,
  description,
  active,
  tone = "default",
  onClick,
  className
}: {
  label: string;
  title: string;
  description?: string;
  active?: boolean;
  tone?: WorkspaceButtonTone;
  onClick: () => void;
  className?: string;
}) {
  const toneClasses =
    tone === "danger"
      ? active
        ? "border-rose-300 bg-rose-50/50 shadow-[0_14px_32px_rgba(244,63,94,0.10)]"
        : "border-rose-200/80 bg-white hover:border-rose-300 hover:bg-rose-50/30"
      : tone === "accent"
        ? active
          ? "border-emerald-300 bg-emerald-50/45 shadow-[0_14px_32px_rgba(16,185,129,0.10)]"
          : "border-emerald-200/80 bg-white hover:border-emerald-300 hover:bg-emerald-50/25"
        : active
          ? "border-zinc-900/18 bg-zinc-50/80 shadow-[0_14px_32px_rgba(24,24,27,0.08)]"
          : "border-zinc-900/12 bg-white hover:border-zinc-900/24 hover:bg-zinc-50/70";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex h-full min-h-[8.4rem] flex-col rounded-[28px] border px-4 py-4 text-left transition-[transform,border-color,background-color,box-shadow] duration-150 active:scale-[0.985] xl:min-h-0 xl:px-4 xl:py-4",
        toneClasses,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</span>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-900/10 bg-zinc-50 text-zinc-500 transition-colors group-hover:border-zinc-900/20 group-hover:text-zinc-900">
          <ArrowUpRight size={14} />
        </span>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col justify-start">
        <h3 className="text-[1.18rem] leading-[0.94] font-display font-semibold tracking-[-0.05em] text-zinc-950 md:text-[1.36rem]">
          {title}
        </h3>
        {description ? <p className="mt-2 text-sm leading-relaxed text-zinc-600">{description}</p> : null}
      </div>
    </button>
  );
}
