"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CenteredPageHero({
  eyebrow,
  title,
  description,
  badge,
  className,
  titleClassName,
  descriptionClassName
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  return (
    <header className={cn("mt-3 flex w-full shrink-0 flex-col items-center text-center xl:mt-5", className)}>
      {eyebrow ? <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">{eyebrow}</p> : null}
      <h1
        className={cn(
          `${eyebrow ? "mt-2" : "mt-0"} text-[clamp(3.6rem,8vw,6.8rem)] leading-[0.84] font-display font-bold tracking-[-0.085em] text-zinc-950`,
          titleClassName
        )}
      >
        {title}
      </h1>
      {description || badge ? (
        <div
          className={cn(
            `${eyebrow ? "mt-2" : "mt-1"} flex flex-wrap items-center justify-center gap-3 text-sm leading-relaxed text-zinc-600 md:text-base`,
            descriptionClassName
          )}
        >
          {description ? <div>{description}</div> : null}
          {badge}
        </div>
      ) : null}
    </header>
  );
}

export function GlassSurface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        "min-h-0 rounded-[30px] border border-zinc-900/12 bg-white/92 shadow-[0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </section>
  );
}

export function DarkShowcaseSurface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        "min-h-0 rounded-[30px] border border-zinc-900/12 bg-zinc-950 text-white shadow-[0_18px_45px_rgba(24,24,27,0.12)]",
        className
      )}
    >
      {children}
    </section>
  );
}
