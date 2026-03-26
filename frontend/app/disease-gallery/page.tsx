/**
 * File: frontend/app/disease-gallery/page.tsx
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

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import DomeGallery from "@/components/DomeGallery";
import { toAssetUrl } from "@/lib/api-client";
import { navigateWithFloraTransition } from "@/lib/navigation-transition";
import { useHomeLocked } from "@/lib/use-home-locked";
import { getCachedDiseases, refreshDiseases, type DiseaseListItem } from "@/lib/diseases-cache";

export default function DiseaseGalleryPage() {
  const router = useRouter();
  const [diseases, setDiseases] = useState<DiseaseListItem[]>(() => getCachedDiseases() || []);
  const [loaded, setLoaded] = useState(() => Boolean(getCachedDiseases()));

  useHomeLocked();

  useEffect(() => {
    void refreshDiseases()
      .then((data) => setDiseases(data))
      .finally(() => setLoaded(true));
  }, []);

  const galleryItems = diseases.map((disease) => ({
    ...disease,
    src: toAssetUrl(disease.image_url || ""),
    alt: `${disease.disease_name} profile`,
    species_name: disease.affected_species,
    zone: disease.severity_level
  }));

  return (
    <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 w-full xl:flex-1 xl:min-h-0">
        <div className="absolute left-4 top-4 z-50 hidden flex-wrap items-center gap-2 md:left-8 md:top-7 xl:flex">
          <button
            type="button"
            onClick={() => navigateWithFloraTransition(router, "/")}
            className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-white/80 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <button
            type="button"
            onClick={() => navigateWithFloraTransition(router, "/gallery")}
            className="group inline-flex items-center gap-2 rounded-full border border-zinc-900/20 bg-white/90 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
          >
            Plant Gallery
            <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45 }}
          className="hidden w-full xl:block xl:h-full"
        >
          <DomeGallery items={galleryItems} entityType="disease" />
        </motion.div>

        <div className="px-4 pb-6 pt-4 sm:px-6 md:px-8 xl:hidden">
          <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-900/10 bg-white/85 p-2 backdrop-blur">
            <button
              type="button"
              onClick={() => navigateWithFloraTransition(router, "/")}
              className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-white/80 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              type="button"
              onClick={() => navigateWithFloraTransition(router, "/gallery")}
              className="group inline-flex items-center gap-2 rounded-full border border-zinc-900/20 bg-white/90 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
            >
              Plant Gallery
              <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </div>

          {galleryItems.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {galleryItems.map((item) => (
                <button
                  key={`mobile-disease-${item.disease_id}`}
                  type="button"
                  onClick={() => navigateWithFloraTransition(router, `/results/disease/${encodeURIComponent(item.disease_name)}`)}
                  className="group overflow-hidden rounded-[22px] border border-zinc-900/12 bg-white/90 p-2 text-left shadow-[0_12px_28px_rgba(24,24,27,0.08)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-zinc-900/28 hover:shadow-[0_18px_36px_rgba(24,24,27,0.12)]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-900/10 bg-zinc-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.src || ""}
                      alt={item.alt || item.disease_name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/12" />
                    <p className="absolute left-2 top-2 rounded-full border border-red-200 bg-red-50/95 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-red-700">
                      {item.zone}
                    </p>
                  </div>
                  <div className="px-2 pb-2 pt-3">
                    <p className="text-lg font-semibold leading-tight text-zinc-900">{item.disease_name}</p>
                    <p className="mt-1 line-clamp-1 text-sm text-zinc-600">{item.affected_species || item.species_name}</p>
                    <div className="mt-3 flex items-center justify-between border-t border-zinc-900/10 pt-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Open Profile</span>
                      <ArrowUpRight size={14} className="text-zinc-400 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-900" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {loaded && galleryItems.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="text-sm text-zinc-600">No diseases available.</p>
          </div>
        )}
      </section>
    </main>
  );
}
