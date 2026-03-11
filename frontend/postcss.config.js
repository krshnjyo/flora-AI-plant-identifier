/**
 * File: frontend/postcss.config.js
 * Purpose: Build/runtime configuration module for framework tooling.
 *
 * Responsibilities:
 * - Defines compile-time behavior and framework integration settings
 * - Keeps environment-level defaults in one audited location
 *
 * Design Notes:
 * - Centralized config reduces hidden behavior and deployment drift
 */

module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
