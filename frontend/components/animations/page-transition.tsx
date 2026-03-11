/**
 * File: frontend/components/animations/page-transition.tsx
 * Purpose: UI component module used to compose page-level screens.
 *
 * Responsibilities:
 * - Encapsulates presentational markup and local interaction behavior
 * - Receives data via props and emits predictable UI states
 *
 * Design Notes:
 * - Separates reusable UI concerns from route/page business logic
 */

"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useRef } from "react";

const ROUTE_ORDER = ["/", "/identify", "/about", "/gallery", "/disease-gallery", "/results", "/history", "/settings", "/admin", "/login", "/register"];

function normalizePath(pathname: string) {
  if (pathname.startsWith("/results/")) return "/results";
  if (pathname.startsWith("/admin/")) return "/admin";
  return pathname;
}

function routeRank(pathname: string) {
  const normalized = normalizePath(pathname);
  const index = ROUTE_ORDER.indexOf(normalized);
  return index === -1 ? ROUTE_ORDER.length : index;
}

type TransitionContext = {
  direction: number;
  galleryHop: boolean;
};

const panVariants = {
  initial: ({ direction, galleryHop }: TransitionContext) => ({
    x: direction > 0 ? (galleryHop ? "84%" : "100%") : galleryHop ? "-84%" : "-100%",
    scale: galleryHop ? 1.001 : 1.003,
    opacity: galleryHop ? 0.992 : 0.985
  }),
  animate: {
    x: "0%",
    scale: 1,
    opacity: 1
  },
  exit: ({ direction, galleryHop }: TransitionContext) => ({
    x: direction > 0 ? (galleryHop ? "-84%" : "-100%") : galleryHop ? "84%" : "100%",
    scale: galleryHop ? 0.999 : 0.997,
    opacity: galleryHop ? 0.992 : 0.985
  })
};

const reducedPanVariants = {
  initial: { x: "0%", opacity: 1, scale: 1 },
  animate: { x: "0%", opacity: 1, scale: 1 },
  exit: { x: "0%", opacity: 1, scale: 1 }
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const previousPathRef = useRef(pathname);
  const directionRef = useRef(1);
  const galleryHopRef = useRef(false);

  if (previousPathRef.current !== pathname) {
    const previousNormalized = normalizePath(previousPathRef.current);
    const nextNormalized = normalizePath(pathname);
    const prevRank = routeRank(previousNormalized);
    const nextRank = routeRank(nextNormalized);
    directionRef.current = nextRank >= prevRank ? 1 : -1;
    const isGalleryHop = ["/gallery", "/disease-gallery"].includes(previousNormalized) || ["/gallery", "/disease-gallery"].includes(nextNormalized);
    galleryHopRef.current = isGalleryHop;
    previousPathRef.current = pathname;
  }

  const transitionContext: TransitionContext = {
    direction: directionRef.current,
    galleryHop: galleryHopRef.current
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-x-hidden overflow-y-visible xl:overflow-hidden">
      <AnimatePresence mode="sync" initial={false} custom={transitionContext}>
        <motion.div
          key={pathname}
          custom={transitionContext}
          variants={prefersReducedMotion ? reducedPanVariants : panVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={
            prefersReducedMotion
              ? { duration: 0.1 }
              : galleryHopRef.current
                ? {
                    duration: 0.54,
                    ease: [0.16, 0.9, 0.14, 1]
                  }
                : {
                    duration: 0.42,
                    ease: [0.22, 0.84, 0.2, 1]
                  }
          }
          className="h-full min-h-0 w-full [backface-visibility:hidden] xl:absolute xl:inset-0"
          style={{ willChange: "transform, opacity" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
