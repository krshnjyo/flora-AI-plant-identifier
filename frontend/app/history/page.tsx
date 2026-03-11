/**
 * File: frontend/app/history/page.tsx
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

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetchJson, getApiErrorMessage, toAssetUrl } from "@/lib/api-client";
import { useHomeLocked } from "@/lib/use-home-locked";

type ScanHistory = {
  scan_id: number;
  plant_name: string | null;
  disease_name: string | null;
  image_url: string | null;
  created_at: string;
};

export default function HistoryPage() {
  const [items, setItems] = useState<ScanHistory[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useHomeLocked();

  useEffect(() => {
    apiFetchJson<ScanHistory[]>("/api/history")
      .then(({ response, json }) => {
        if (!response.ok || !json?.success) {
          setError(getApiErrorMessage(json, "Failed to load history"));
          return;
        }
        setItems(json.data);
      })
      .catch(() => setError("Failed to load history"))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    let withDisease = 0;
    const diseaseCount = new Map<string, number>();
    for (const item of items) {
      if (!item.disease_name) continue;
      withDisease += 1;
      diseaseCount.set(item.disease_name, (diseaseCount.get(item.disease_name) || 0) + 1);
    }

    const topDetections = Array.from(diseaseCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const total = items.length;
    return { total, withDisease, healthy: total - withDisease, topDetections };
  }, [items]);
  const hasItems = items.length > 0;

  if (loading) {
    return (
      <main className="relative isolate h-full min-h-0 overflow-x-hidden overflow-y-auto xl:overflow-hidden bg-transparent text-foreground">
        <div className="grid h-full place-items-center">
          <motion.div
            className="h-12 w-12 rounded-full border border-zinc-300 border-t-zinc-900"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="relative isolate h-full min-h-0 overflow-x-hidden overflow-y-auto xl:overflow-hidden bg-transparent text-foreground">
        <div className="grid h-full place-items-center px-4">
          <div className="w-full max-w-xl border border-red-200/70 bg-red-50/90 px-5 py-4 text-sm font-medium text-red-700">{error}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate h-full min-h-0 overflow-x-hidden overflow-y-auto xl:overflow-hidden bg-transparent text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 h-auto xl:h-full px-4 pb-6 pt-14 md:px-8 md:pb-8 md:pt-20 lg:px-10 xl:px-12">
        <div className="mx-auto grid h-auto xl:h-full w-full max-w-[1700px] min-h-0 gap-5 xl:grid-cols-12">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38 }}
            className="flex min-h-0 flex-col overflow-hidden p-2 xl:col-span-4 xl:p-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">Scan Archive</p>
            <h1 className="mt-2 text-[clamp(3.4rem,7.2vw,6.6rem)] leading-[0.84] font-display font-bold tracking-[-0.08em]">HISTORY</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 md:text-base">
              Timeline of every scan with species, disease output, and recent visual records.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-900/14 pt-4 sm:grid-cols-3">
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Total</p>
                <p className="mt-1 text-3xl font-semibold text-zinc-900">{summary.total}</p>
              </article>
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Healthy</p>
                <p className="mt-1 text-3xl font-semibold text-zinc-900">{summary.healthy}</p>
              </article>
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Disease</p>
                <p className="mt-1 text-3xl font-semibold text-zinc-900">{summary.withDisease}</p>
              </article>
            </div>

            <div className="mt-6 border-t border-zinc-900/14 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Top Detections</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.topDetections.length ? (
                  summary.topDetections.map(([name, count]) => (
                    <span key={name} className="floating-chip rounded-full px-3 py-1 text-xs">
                      {name} · {count}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-500">No disease detections yet.</span>
                )}
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.05 }}
            className="min-h-0 rounded-[28px] border border-zinc-900/12 bg-white/90 p-5 shadow-[0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur-xl xl:col-span-8 xl:p-6"
          >
            <div className="flex h-auto min-h-0 flex-col xl:h-full">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Extended Surface</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">Structured Detail Cards</p>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-6 pb-2">
                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Latest Records</p>
                    <div className="mt-3 border-t border-zinc-900/14 pt-3">
                      {!hasItems ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="border border-zinc-900/12 bg-white/75 p-3">
                            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Archive Status</p>
                            <p className="mt-2 text-sm font-semibold text-zinc-800">No scans yet.</p>
                            <p className="mt-1 text-xs text-zinc-600">Run the first identify scan to start timeline tracking.</p>
                          </div>
                          <div className="border border-zinc-900/12 bg-white/75 p-3">
                            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Expected Capture</p>
                            <p className="mt-2 text-xs text-zinc-700">Species</p>
                            <p className="mt-1 text-xs text-zinc-700">Disease output</p>
                            <p className="mt-1 text-xs text-zinc-700">Confidence and timestamp</p>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-zinc-900/10">
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Plant</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Disease</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Image</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Scanned At</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.slice(0, 12).map((item) => (
                                <TableRow key={item.scan_id} className="border-zinc-900/10">
                                  <TableCell className="font-medium text-zinc-800">{item.plant_name || "-"}</TableCell>
                                  <TableCell className={item.disease_name ? "text-red-600" : "text-zinc-500"}>
                                    {item.disease_name || "Healthy"}
                                  </TableCell>
                                  <TableCell>
                                    {item.image_url ? (
                                      <Image
                                        src={toAssetUrl(item.image_url)}
                                        alt="Scan thumbnail"
                                        width={44}
                                        height={44}
                                        className="h-11 w-11 border border-zinc-200 object-cover"
                                        sizes="44px"
                                      />
                                    ) : (
                                      "-"
                                    )}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-zinc-500">{new Date(item.created_at).toLocaleString()}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </article>

                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Visual Stream</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 border-t border-zinc-900/14 pt-3 sm:grid-cols-2">
                      {hasItems
                        ? items.slice(0, 8).map((item) => (
                            <div key={item.scan_id} className="overflow-hidden border border-zinc-900/12 bg-zinc-100">
                              {item.image_url ? (
                                <Image
                                  src={toAssetUrl(item.image_url)}
                                  alt={item.plant_name || "Scan"}
                                  width={220}
                                  height={160}
                                  className="h-24 w-full object-cover"
                                  sizes="220px"
                                />
                              ) : (
                                <div className="grid h-24 place-items-center text-xs text-zinc-400">No image</div>
                              )}
                              <div className="px-2 py-1.5">
                                <p className="truncate text-xs font-semibold text-zinc-800">{item.plant_name || "Unknown"}</p>
                                <p className="truncate text-[11px] text-zinc-500">{item.disease_name || "Healthy"}</p>
                              </div>
                            </div>
                          ))
                        : Array.from({ length: 4 }).map((_, index) => (
                            <div key={`placeholder-visual-${index}`} className="border border-zinc-900/12 bg-white/75 p-3">
                              <div className="h-14 w-full bg-zinc-100" />
                              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Pending</p>
                              <p className="mt-1 text-xs text-zinc-600">Awaiting scan image</p>
                            </div>
                          ))}
                    </div>
                  </article>

                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Activity Log</p>
                    <div className="mt-3 space-y-2 border-t border-zinc-900/14 pt-3">
                      {hasItems ? (
                        items.slice(0, 14).map((item) => (
                          <div key={`log-${item.scan_id}`} className="flex items-start justify-between gap-4 border-b border-zinc-900/10 pb-2">
                            <div>
                              <p className="text-sm font-semibold text-zinc-800">{item.plant_name || "Unknown specimen"}</p>
                              <p className={item.disease_name ? "text-xs text-red-600" : "text-xs text-zinc-500"}>{item.disease_name || "Healthy"}</p>
                            </div>
                            <p className="font-mono text-[11px] text-zinc-500">{new Date(item.created_at).toLocaleDateString()}</p>
                          </div>
                        ))
                      ) : (
                        Array.from({ length: 5 }).map((_, index) => (
                          <div key={`log-placeholder-${index}`} className="border-b border-zinc-900/10 pb-2">
                            <p className="text-sm font-semibold text-zinc-700">No recent entries</p>
                            <p className="text-xs text-zinc-500">Activity appears here after your first scan.</p>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </motion.section>
        </div>
      </section>
    </main>
  );
}
