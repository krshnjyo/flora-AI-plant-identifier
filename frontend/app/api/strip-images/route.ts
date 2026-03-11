/**
 * File: frontend/app/api/strip-images/route.ts
 * Purpose: Implements an App Router API endpoint used by the frontend shell.
 *
 * Responsibilities:
 * - Reads and normalizes local asset data for client consumption
 * - Returns cache-friendly payloads used by UI sections
 *
 * Design Notes:
 * - Centralizes UI data fetching into route handlers to keep UI components declarative
 */

import { NextResponse } from "next/server";
import path from "node:path";
import { readdir } from "node:fs/promises";

export const runtime = "nodejs";
export const revalidate = 300;

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const toAltText = (fileName: string) => {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  const cleaned = withoutExt.replace(/[-_]+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : "Strip image";
};

export async function GET() {
  try {
    const stripDir = path.join(process.cwd(), "public", "strip");
    const entries = await readdir(stripDir, { withFileTypes: true });

    const images = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((name) => ({
        src: `/strip/${encodeURIComponent(name)}`,
        alt: toAltText(name)
      }));

    return NextResponse.json({ success: true, data: images });
  } catch {
    return NextResponse.json({ success: true, data: [] });
  }
}
