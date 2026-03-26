/**
 * File: frontend/app/page.tsx
 * Purpose: Route page component responsible for one user-facing screen.
 *
 * Responsibilities:
 * - Coordinates UI state, fetches required data, and renders loading/empty/error states
 * - Delegates reusable chunks to shared components
 *
 * Design Notes:
 * - Keeps route logic readable while avoiding business-logic duplication
 */

"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { navigateWithFloraTransition } from "@/lib/navigation-transition";
import { useHomeLocked } from "@/lib/use-home-locked";

export default function Home() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [floraHovered, setFloraHovered] = useState(false);

  useHomeLocked();

  return (
    <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 px-4 pb-10 pt-8 md:px-8 md:pb-12 md:pt-10 lg:px-10 xl:flex-1 xl:min-h-0 xl:px-12 xl:pb-0">
        <div className="mx-auto flex min-h-[calc(100vh-13rem)] max-w-[1700px] -translate-y-1 flex-col items-center justify-center md:-translate-y-2 xl:h-full xl:min-h-0 xl:-translate-y-6">
          <div
            onMouseEnter={() => setFloraHovered(true)}
            onMouseLeave={() => setFloraHovered(false)}
            className="relative flex h-[clamp(17rem,33vw,25rem)] w-full items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 14 }}
              animate={floraHovered ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: prefersReducedMotion ? 0.14 : 0.32, ease: [0.22, 1, 0.36, 1] }}
              style={{ pointerEvents: floraHovered ? "auto" : "none" }}
              className="absolute inset-0 z-20 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Plant + Disease Intelligence</p>
                <p className="max-w-2xl text-center text-sm text-zinc-600 md:text-base">
                  Upload a clear plant image to identify species and surface probable disease insights instantly.
                </p>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5 md:gap-3">
                  <button
                    type="button"
                    onClick={() => navigateWithFloraTransition(router, "/identify")}
                    className="group pointer-events-auto inline-flex items-center gap-2 rounded-full border border-zinc-900/15 bg-black px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition-transform hover:-translate-y-0.5 md:px-7 md:py-3 md:text-[11px] md:tracking-[0.22em]"
                  >
                    Identify now
                    <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateWithFloraTransition(router, "/gallery")}
                    className="group pointer-events-auto inline-flex items-center gap-2 rounded-full border border-zinc-900/25 bg-white/90 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-transform hover:-translate-y-0.5 md:px-6 md:py-3 md:text-[11px] md:tracking-[0.2em]"
                  >
                    Plant Gallery
                    <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateWithFloraTransition(router, "/disease-gallery")}
                    className="group pointer-events-auto inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50/90 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-red-700 shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-transform hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 md:px-6 md:py-3 md:text-[11px] md:tracking-[0.2em]"
                  >
                    Disease Gallery
                    <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={floraHovered ? { opacity: 0, y: -8, scale: 0.985 } : { opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: prefersReducedMotion ? 0.14 : 0.36, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 flex h-full w-full items-center justify-center"
            >
              <motion.h1 className="pointer-events-none select-none text-center text-[clamp(7.8rem,29vw,24rem)] font-display font-bold leading-[0.86] tracking-[-0.1em] will-change-[opacity,transform]">
                FLORA
              </motion.h1>
            </motion.div>
          </div>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={floraHovered ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.14 : 0.32, delay: floraHovered ? 0 : 0.04 }}
            className="mx-auto -mt-2 w-full max-w-4xl text-center text-base font-medium text-muted-foreground md:-mt-3 md:text-2xl"
          >
            Minimal, direct botanical analysis.
          </motion.p>
        </div>
      </section>
    </main>
  );
}
