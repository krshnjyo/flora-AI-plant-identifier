/**
 * File: frontend/components/layout/footer.tsx
 * Purpose: Renders the global footer and scrolling image strip section.
 *
 * Responsibilities:
 * - Loads strip images with fallback behavior
 * - Shows social and legal links with accessible labels
 * - Preserves consistent branding and visual rhythm across pages
 *
 * Design Notes:
 * - Keeps fallback strip assets to avoid empty UI when API fails
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type StripImage = {
  src: string;
  alt: string;
};

const fallbackStripImages: StripImage[] = [
  { src: "/home/plant-1.jpg", alt: "Dark leaf silhouette" },
  { src: "/home/plant-2.jpg", alt: "Succulent with dew" },
  { src: "/home/plant-3.jpg", alt: "Vertical botanical leaf" }
];

export function Footer() {
  const pathname = usePathname();
  const showStrip = true;
  const [stripImages, setStripImages] = useState<StripImage[]>(fallbackStripImages);

  useEffect(() => {
    if (pathname === "/gallery" || pathname === "/disease-gallery") {
      return;
    }

    let mounted = true;

    const loadStripImages = async () => {
      try {
        const response = await fetch("/api/strip-images", { cache: "force-cache" });
        if (!response.ok) return;

        const payload = await response.json();
        if (!mounted) return;

        if (Array.isArray(payload?.data) && payload.data.length > 0) {
          setStripImages(
            payload.data
              .filter((item: StripImage) => typeof item?.src === "string")
              .map((item: StripImage) => ({
                src: item.src,
                alt: item.alt || "Strip image"
              }))
          );
        }
      } catch {
        // Keep fallback strip images when endpoint is unavailable.
      }
    };

    const timerId = setTimeout(() => {
      void loadStripImages();
    }, 250);

    return () => {
      mounted = false;
      clearTimeout(timerId);
    };
  }, [pathname]);

  const marqueeImages = useMemo(() => {
    const base = stripImages.length > 0 ? stripImages : fallbackStripImages;
    const expanded: StripImage[] = [];
    const minimumItems = 12;

    while (expanded.length < minimumItems) {
      expanded.push(...base);
    }

    const normalized = expanded.slice(0, minimumItems);
    return normalized.concat(normalized);
  }, [stripImages]);

  if (pathname === "/gallery" || pathname === "/disease-gallery") {
    return null;
  }


  return (
    <footer className="relative z-50 overflow-hidden border-t border-white/15 bg-black text-white">
      <div className="mx-auto max-w-[110rem] px-4 pb-0 pt-3 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between">
          <p className="max-w-3xl text-[11px] font-medium leading-snug text-zinc-400">
            Built by Computer Science and Design students at FISAT, Angamaly as an AI-powered plant identification mini project.
          </p>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Flora X profile"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/5 text-xs font-bold text-zinc-300 transition-[border-color,color,background-color,transform] duration-200 hover:scale-105 hover:border-white/70 hover:text-white"
            >
              X
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Flora GitHub profile"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/5 text-xs font-bold text-zinc-300 transition-[border-color,color,background-color,transform] duration-200 hover:scale-105 hover:border-white/70 hover:text-white"
            >
              Gh
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Flora LinkedIn profile"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/5 text-xs font-bold text-zinc-300 transition-[border-color,color,background-color,transform] duration-200 hover:scale-105 hover:border-white/70 hover:text-white"
            >
              In
            </a>
            <p className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400 sm:text-[10px] sm:tracking-widest">Est. 2024</p>
          </div>
        </div>
      </div>

      {showStrip && (
        <div className="relative mt-0 w-full overflow-hidden border-t border-white/15 bg-black">
          <div className="pointer-events-none absolute inset-0 z-20 bg-black/22" />
          <div className="absolute inset-0 z-30 flex items-center justify-between px-3 sm:px-6 md:px-10">
            <span className="truncate pr-3 font-mono text-[9px] font-extrabold uppercase tracking-[0.12em] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.7)] sm:text-[11px] sm:tracking-[0.14em]">
              © 2024 FLORA INTELLIGENCE INC.
            </span>
            <div className="hidden items-center gap-6 sm:flex">
              <Link
                href="/settings"
                className="font-mono text-[11px] font-extrabold uppercase tracking-[0.14em] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.7)] transition-colors hover:text-zinc-200"
              >
                Privacy
              </Link>
              <Link
                href="/settings"
                className="font-mono text-[11px] font-extrabold uppercase tracking-[0.14em] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.7)] transition-colors hover:text-zinc-200"
              >
                Terms
              </Link>
            </div>
          </div>
          <div className="footer-strip-track flex w-max gap-0 pr-0 will-change-transform">
            {marqueeImages.map((image, index) => (
              <article key={`${image.src}-${index}`} className="group relative h-[4.8rem] shrink-0 md:h-[5.1rem]">
                <Image
                  src={image.src}
                  alt={image.alt}
                  width={1200}
                  height={800}
                  className="h-full w-auto max-w-none object-contain transition-transform duration-700 group-hover:scale-[1.02] motion-reduce:transition-none"
                  sizes="(max-width: 768px) 24vw, 14vw"
                />
              </article>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .footer-strip-track {
          animation: footerStripMove 34s linear infinite;
          transform: translateZ(0);
        }

        @keyframes footerStripMove {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .footer-strip-track {
            animation: none;
            transform: translateX(0);
          }
        }
      `}</style>
    </footer>
  );
}
