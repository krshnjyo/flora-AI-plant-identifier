/**
 * File: frontend/tailwind.config.ts
 * Purpose: Build/runtime configuration module for framework tooling.
 *
 * Responsibilities:
 * - Defines compile-time behavior and framework integration settings
 * - Keeps environment-level defaults in one audited location
 *
 * Design Notes:
 * - Centralized config reduces hidden behavior and deployment drift
 */

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./pages/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f4f5f4",
        foreground: "#18181b",
        primary: {
          DEFAULT: "#18181b",
          foreground: "#ffffff",
          glow: "rgba(24, 24, 27, 0.22)"
        },
        surface: {
          DEFAULT: "#ffffff",
          soft: "#fafafa"
        },
        glass: {
          DEFAULT: "rgba(255, 255, 255, 0.75)",
          border: "rgba(0, 0, 0, 0.08)",
          nav: "rgba(255, 255, 255, 0.8)"
        },
        border: "#e4e4e7",
        muted: "#71717a",
        "muted-foreground": "#71717a",
        accent: "#3f3f46",
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff"
        }
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.625rem",
        sm: "0.5rem"
      },
      fontFamily: {
        body: ["var(--font-body)"],
        display: ["var(--font-display)"]
      }
    }
  },
  plugins: []
};

export default config;
