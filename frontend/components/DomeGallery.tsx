/**
 * File: frontend/components/DomeGallery.tsx
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { navigateWithFloraTransition } from "@/lib/navigation-transition";

const WHITE_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

const CELL_WIDTH = 300;
const CELL_HEIGHT = 420;
const GAP = 20;
const COLUMNS = 10;
const ROWS = 6;

const DEFAULTS = {
  friction: 0.92,
  keySpeed: 2.5,
  dragFactor: 0.32,
  maxSpeed: 30
};

type GalleryEntityType = "plant" | "disease";

export type DomeGalleryEntity = {
  plant_id?: number;
  disease_id?: number;
  common_name?: string;
  species_name?: string;
  species?: string;
  disease_name?: string;
  affected_species?: string;
  severity_level?: string;
  image_url?: string | null;
  src?: string | null;
  alt?: string | null;
  confidence_score?: number;
  zone?: string;
};

type GalleryCell = {
  id: string;
  gridX: number;
  gridY: number;
  src: string;
  alt: string;
  title: string;
  subtitle: string;
  code: string;
  index: number;
  zone: string;
  confidence_score: number;
  entityType: GalleryEntityType;
};

function severityToScore(level: string) {
  const normalized = level.toLowerCase();
  if (normalized.includes("critical")) return 95;
  if (normalized.includes("high")) return 82;
  if (normalized.includes("medium") || normalized.includes("moderate")) return 62;
  if (normalized.includes("low")) return 36;
  return 50;
}

function buildItems(pool: DomeGalleryEntity[], entityType: GalleryEntityType): GalleryCell[] {
  const coords: Array<{ gridX: number; gridY: number }> = [];
  const rowOffset = Math.floor(ROWS / 2);

  for (let col = 0; col < COLUMNS; col += 1) {
    const stagger = col % 2 === 0 ? 0 : (CELL_HEIGHT + GAP) / 2;
    for (let row = -rowOffset; row < ROWS - rowOffset; row += 1) {
      coords.push({
        gridX: col * (CELL_WIDTH + GAP),
        gridY: row * (CELL_HEIGHT + GAP) + stagger
      });
    }
  }

  // Do not synthesize placeholder entities when catalog data is empty.
  // Empty states are handled by parent pages with dedicated messaging.
  if (pool.length === 0) {
    return [];
  }

  const normalizedImages = pool.map((item, index) => {
    const label =
      entityType === "plant"
        ? item.common_name || item.species_name || item.species || "Unknown Specimen"
        : item.disease_name || "Unknown Disease";

    const secondary =
      entityType === "plant"
        ? item.species || item.species_name || "Botanical specimen"
        : item.affected_species || "Host not specified";

    const numericId =
      entityType === "plant"
        ? (item.plant_id ?? index + 1)
        : (item.disease_id ?? index + 1);

    const severityZone = item.severity_level ? item.severity_level.toUpperCase() : "UNSPECIFIED";

    return {
      src: item.src || item.image_url || WHITE_PLACEHOLDER,
      alt: item.alt || label,
      title: label,
      subtitle: secondary,
      code: `${entityType === "plant" ? "PL" : "DS"}-${String(numericId).padStart(4, "0")}`,
      index: numericId % 100,
      zone: item.zone || (entityType === "plant" ? `Z-${(numericId % 9) + 1}` : severityZone),
      confidence_score:
        item.confidence_score ??
        (entityType === "disease" ? severityToScore(item.severity_level || "") : 90),
      entityType
    };
  });

  return coords.map((coord, index) => {
    const image = normalizedImages[index % normalizedImages.length];
    return {
      id: `item-${index}`,
      gridX: coord.gridX,
      gridY: coord.gridY,
      ...image
    };
  });
}

export default function DomeGallery({
  items = [],
  entityType = "plant"
}: {
  items?: DomeGalleryEntity[];
  entityType?: GalleryEntityType;
}) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const galleryItems = useMemo(() => buildItems(items, entityType), [items, entityType]);
  const basePositions = useMemo(
    () => galleryItems.map((item) => ({ x: item.gridX, y: item.gridY })),
    [galleryItems]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const positionRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const keysPressed = useRef<Set<string>>(new Set());
  const dragRef = useRef({ active: false, pointerId: -1, lastX: 0, lastY: 0 });
  const lastMotionAtRef = useRef(Date.now());
  const navHintVisibleRef = useRef(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GalleryCell[]>([]);
  const [showNavHint, setShowNavHint] = useState(false);

  const worldWidth = COLUMNS * (CELL_WIDTH + GAP);
  const worldHeight = ROWS * (CELL_HEIGHT + GAP);

  const setNavHintVisible = useCallback((visible: boolean) => {
    if (navHintVisibleRef.current === visible) return;
    navHintVisibleRef.current = visible;
    setShowNavHint(visible);
  }, []);

  const markInteraction = useCallback(() => {
    lastMotionAtRef.current = Date.now();
    setNavHintVisible(false);
    if (prefersReducedMotion) {
      velocityRef.current.x *= 0.85;
      velocityRef.current.y *= 0.85;
    }
  }, [prefersReducedMotion, setNavHintVisible]);

  useEffect(() => {
    let rafId = 0;
    const loop = () => {
      const now = Date.now();

      if (keysPressed.current.size > 0) {
        markInteraction();
        if (keysPressed.current.has("ArrowUp") || keysPressed.current.has("w")) velocityRef.current.y += DEFAULTS.keySpeed;
        if (keysPressed.current.has("ArrowDown") || keysPressed.current.has("s")) velocityRef.current.y -= DEFAULTS.keySpeed;
        if (keysPressed.current.has("ArrowLeft") || keysPressed.current.has("a")) velocityRef.current.x += DEFAULTS.keySpeed;
        if (keysPressed.current.has("ArrowRight") || keysPressed.current.has("d")) velocityRef.current.x -= DEFAULTS.keySpeed;
      }

      velocityRef.current.x *= DEFAULTS.friction;
      velocityRef.current.y *= DEFAULTS.friction;

      const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y);
      if (speed > DEFAULTS.maxSpeed) {
        const ratio = DEFAULTS.maxSpeed / speed;
        velocityRef.current.x *= ratio;
        velocityRef.current.y *= ratio;
      }

      if (Math.abs(velocityRef.current.x) < 0.05) velocityRef.current.x = 0;
      if (Math.abs(velocityRef.current.y) < 0.05) velocityRef.current.y = 0;

      positionRef.current.x += velocityRef.current.x;
      positionRef.current.y += velocityRef.current.y;

      const moving =
        dragRef.current.active ||
        keysPressed.current.size > 0 ||
        Math.abs(velocityRef.current.x) > 0.08 ||
        Math.abs(velocityRef.current.y) > 0.08;

      if (moving) {
        lastMotionAtRef.current = now;
        setNavHintVisible(false);
      } else if (now - lastMotionAtRef.current >= 3000) {
        setNavHintVisible(true);
      }

      for (let i = 0; i < nodeRefs.current.length; i += 1) {
        const node = nodeRefs.current[i];
        const base = basePositions[i];
        if (!node || !base) continue;

        let visualX = (base.x + positionRef.current.x) % worldWidth;
        let visualY = (base.y + positionRef.current.y) % worldHeight;

        if (visualX > worldWidth / 2) visualX -= worldWidth;
        if (visualX < -worldWidth / 2) visualX += worldWidth;
        if (visualY > worldHeight / 2) visualY -= worldHeight;
        if (visualY < -worldHeight / 2) visualY += worldHeight;

        node.style.transform = `translate3d(${visualX}px, ${visualY}px, 0)`;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [basePositions, markInteraction, setNavHintVisible, worldHeight, worldWidth]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }
      keysPressed.current.add(event.key);
    };

    const handleKeyUp = (event: KeyboardEvent) => keysPressed.current.delete(event.key);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const lowerQuery = searchQuery.toLowerCase();
    const uniqueMap = new Map<string, GalleryCell>();
    galleryItems.forEach((item) => {
      const searchable = `${item.title} ${item.subtitle}`.toLowerCase();
      if (searchable.includes(lowerQuery) && !uniqueMap.has(item.title)) {
        uniqueMap.set(item.title, item);
      }
    });
    setSearchResults(Array.from(uniqueMap.values()).slice(0, 6));
  }, [searchQuery, galleryItems]);

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [data-no-drag="true"]')) return;
    dragRef.current.active = true;
    dragRef.current.pointerId = event.pointerId;
    dragRef.current.lastX = event.clientX;
    dragRef.current.lastY = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    markInteraction();
  };

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragRef.current.lastX;
    const deltaY = event.clientY - dragRef.current.lastY;

    velocityRef.current.x += deltaX * DEFAULTS.dragFactor;
    velocityRef.current.y += deltaY * DEFAULTS.dragFactor;
    dragRef.current.lastX = event.clientX;
    dragRef.current.lastY = event.clientY;
    markInteraction();
  };

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.active = false;
    dragRef.current.pointerId = -1;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const searchPlaceholder = entityType === "plant" ? "SEARCH PLANT DATABASE..." : "SEARCH DISEASE DATABASE...";

  return (
    <div className="relative h-full w-full touch-none overflow-hidden bg-transparent" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      <div data-no-drag="true" className={`absolute right-0 top-0 z-50 p-6 ${isSearchOpen ? "w-full md:w-[min(30rem,38vw)]" : "w-auto"}`}>
        <div
          className={`overflow-hidden border border-black/5 bg-white shadow-2xl transition-[border-color,transform,width,border-radius] duration-300 ${
            isSearchOpen ? "rounded-2xl" : "rounded-full hover:scale-105 active:scale-95"
          }`}
        >
          {!isSearchOpen ? (
            <button
              onClick={() => setIsSearchOpen(true)}
              aria-label={`Open ${entityType} gallery search`}
              className="flex h-12 w-12 items-center justify-center text-zinc-900"
            >
              <Search size={20} strokeWidth={1.5} />
            </button>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center border-b border-black/5 p-4">
                <Search size={18} className="mr-3 text-zinc-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder={searchPlaceholder}
                  className="flex-1 bg-transparent text-sm font-medium uppercase tracking-wide text-zinc-900 outline-none placeholder:text-zinc-300"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <button
                  onClick={() => setIsSearchOpen(false)}
                  aria-label="Close gallery search"
                  className="rounded-full p-2 transition-colors hover:bg-zinc-100"
                >
                  <X size={16} className="text-zinc-500" />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigateWithFloraTransition(router, `/results/${item.entityType}/${encodeURIComponent(item.title)}`)}
                    aria-label={`Open result for ${item.title}`}
                    className="group flex w-full items-center gap-4 border-b border-black/5 p-4 text-left transition-colors hover:bg-zinc-50 last:border-0"
                  >
                    <div className="h-12 w-12 overflow-hidden rounded-md border border-black/5 bg-zinc-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.src}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        alt={item.alt}
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          const target = event.currentTarget;
                          if (target.dataset.fallbackApplied === "true") return;
                          target.dataset.fallbackApplied = "true";
                          target.src = WHITE_PLACEHOLDER;
                        }}
                      />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase text-zinc-900">{item.title}</h4>
                      <p className="mt-0.5 font-mono text-[9px] text-zinc-400">{item.code}</p>
                    </div>
                    <ArrowUpRight size={14} className="ml-auto text-zinc-300 transition-colors group-hover:text-black" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div ref={containerRef} className="relative h-0 w-0">
          {galleryItems.map((item, index) => (
            <div
              key={item.id}
              ref={(node) => {
                nodeRefs.current[index] = node;
              }}
              className="absolute left-0 top-0 flex items-center justify-center will-change-transform"
              style={{
                width: `${CELL_WIDTH}px`,
                height: `${CELL_HEIGHT}px`,
                transform: `translate3d(${item.gridX}px, ${item.gridY}px, 0)`
              }}
            >
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigateWithFloraTransition(router, `/results/${item.entityType}/${encodeURIComponent(item.title)}`);
                  }}
                  aria-label={`Open ${item.title} details`}
                  className="group relative h-full w-full cursor-pointer overflow-hidden rounded-[22px] border border-black/10 bg-white/95 text-left shadow-[0_14px_30px_rgba(24,24,27,0.08)] transition-[transform,border-color,box-shadow] duration-300 hover:z-50 hover:-translate-y-0.5 hover:border-black/30 hover:shadow-[0_22px_42px_rgba(24,24,27,0.16)]"
                >
                  <div className="absolute inset-0 overflow-hidden rounded-[20px]">
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.src}
                      alt={item.alt}
                      loading="lazy"
                      decoding="async"
                      className="relative z-10 h-full w-full object-cover object-[52%_48%] transition-transform duration-700 ease-out group-hover:scale-105 group-hover:grayscale-0 md:grayscale"
                      onError={(event) => {
                        const target = event.currentTarget;
                        if (target.dataset.fallbackApplied === "true") return;
                        target.dataset.fallbackApplied = "true";
                        target.src = WHITE_PLACEHOLDER;
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-black/55 via-black/10 to-black/45" />
                    <div className="absolute bottom-3 left-3 right-3 z-30">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/75">{item.code}</p>
                      <h3 className="mt-2 truncate text-2xl font-bold uppercase leading-none tracking-tight text-white">{item.title}</h3>
                      <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wider text-zinc-200">{item.subtitle}</p>
                    </div>
                  </div>
                </button>
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-6">
        <div
          className={`flex items-center gap-3 rounded-full border border-black/10 bg-white/90 px-3 py-2 shadow-lg shadow-black/5 transition-all duration-300 ${
            showNavHint && !isSearchOpen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          <div className="flex items-center gap-1">
            {["←", "↑", "↓", "→"].map((key, index) => (
              <span
                key={key}
                className={`grid h-6 w-6 place-items-center border border-black/15 bg-white font-mono text-[11px] text-zinc-700 ${
                  prefersReducedMotion ? "" : "idle-arrow-key"
                }`}
                style={{ animationDelay: `${index * 110}ms` }}
              >
                {key}
              </span>
            ))}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Arrow keys to navigate</span>
        </div>
      </div>

      <style jsx>{`
        .idle-arrow-key {
          animation: idleArrowPulse 1.6s ease-in-out infinite;
        }

        @keyframes idleArrowPulse {
          0%,
          100% {
            transform: translateY(0);
            box-shadow: 0 0 0 rgba(24, 24, 27, 0);
          }
          50% {
            transform: translateY(-2px);
            box-shadow: 0 4px 14px rgba(24, 24, 27, 0.18);
          }
        }
      `}</style>
    </div>
  );
}
