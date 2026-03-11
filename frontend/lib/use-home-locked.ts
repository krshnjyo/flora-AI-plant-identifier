/**
 * File: frontend/lib/use-home-locked.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

"use client";

import { useEffect } from "react";

export function useHomeLocked() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const applyLockState = () => {
      // Keep the cinematic non-scroll layout only on large desktop viewports.
      // Smaller windows, tablets, and phones should remain scrollable.
      const isDesktopWidth = window.matchMedia("(min-width: 1280px)").matches;
      const isDesktopHeight = window.innerHeight >= 820;
      const shouldLock = isDesktopWidth && isDesktopHeight;

      html.classList.toggle("home-locked-html", shouldLock);
      body.classList.toggle("home-locked", shouldLock);
    };

    applyLockState();
    window.addEventListener("resize", applyLockState);

    return () => {
      window.removeEventListener("resize", applyLockState);
      html.classList.remove("home-locked-html");
      body.classList.remove("home-locked");
    };
  }, []);
}
