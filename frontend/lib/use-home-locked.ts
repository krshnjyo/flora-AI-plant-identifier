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
    html.classList.remove("home-locked-html");
    body.classList.remove("home-locked");

    return () => {
      html.classList.remove("home-locked-html");
      body.classList.remove("home-locked");
    };
  }, []);
}
