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

/* eslint-disable @next/next/no-img-element -- Dynamic backend-served scan images intentionally bypass Next image optimization to preserve direct uploaded asset rendering. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, Leaf, ScanSearch, ShieldAlert } from "lucide-react";
import { CenteredPageHero } from "@/components/layout/showcase-shell";
import { WorkspaceExpander } from "@/components/layout/workspace-expander";
import { type WorkspaceButtonTone } from "@/components/layout/workspace-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetchJson, getApiErrorMessage, toAssetUrl } from "@/lib/api-client";
import { navigateWithFloraTransition } from "@/lib/navigation-transition";

type ScanHistory = {
  scan_id: number;
  plant_name: string | null;
  disease_name: string | null;
  image_url: string | null;
  created_at: string;
};

type HistorySummary = {
  total: number;
  withDisease: number;
  healthy: number;
  topDetections: Array<readonly [string, number]>;
};

type HistoryResponse = {
  items: ScanHistory[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  summary: HistorySummary;
};

type HistoryPanelKey = "overview" | "timeline" | "records" | "visuals" | "mix" | "actions";

const HISTORY_PAGE_SIZE = 12;

function toHistoryTimestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatHistoryTimestamp(value: string) {
  const timestamp = toHistoryTimestamp(value);
  if (!timestamp) {
    return "Unknown time";
  }

  return new Date(timestamp).toLocaleString();
}

function formatHistoryDate(value: string) {
  const timestamp = toHistoryTimestamp(value);
  if (!timestamp) {
    return "Unknown date";
  }

  return new Date(timestamp).toLocaleDateString();
}

function SummaryCard({
  label,
  value,
  note,
  accentClassName = "text-zinc-900"
}: {
  label: string;
  value: string;
  note: string;
  accentClassName?: string;
}) {
  return (
    <article className="rounded-[24px] border border-zinc-900/12 bg-white/78 p-4 shadow-[0_12px_28px_rgba(24,24,27,0.06)] backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${accentClassName}`}>{value}</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">{note}</p>
    </article>
  );
}

function PaginationControls({
  page,
  totalPages,
  onPrevious,
  onNext
}: {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrevious}
        disabled={page <= 1}
        className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-900/12 bg-white px-4 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Previous
      </button>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages}
        className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-900/12 bg-white px-4 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Next
      </button>
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<ScanHistory[]>([]);
  const [summary, setSummary] = useState<HistorySummary>({
    total: 0,
    withDisease: 0,
    healthy: 0,
    topDetections: []
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedPanelKey, setSelectedPanelKey] = useState<HistoryPanelKey | "">("");

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError("");

    apiFetchJson<HistoryResponse>(`/api/history?page=${page}&limit=${HISTORY_PAGE_SIZE}`, { cache: "no-store" })
      .then(({ response, json }) => {
        if (cancelled) {
          return;
        }

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok || !json?.success) {
          setError(getApiErrorMessage(json, "Failed to load history"));
          return;
        }

        const sortedItems = [...json.data.items].sort((a, b) => {
          return toHistoryTimestamp(b.created_at) - toHistoryTimestamp(a.created_at);
        });

        setItems(sortedItems);
        setSummary(json.data.summary);
        setPage(json.data.page);
        setTotalPages(json.data.totalPages);
        setTotalItems(json.data.total);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load history");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [page, router]);

  const hasItems = items.length > 0;
  const latestItem = items[0] ?? null;
  const recentItems = items.slice(0, 5);
  const visualItems = items.slice(0, 6);
  const diseaseRate = summary.total ? Math.round((summary.withDisease / summary.total) * 100) : 0;
  const healthyRate = summary.total ? Math.round((summary.healthy / summary.total) * 100) : 0;
  const dominantDetection = summary.topDetections[0]?.[0] || "No active disease trend";
  const panelButtons: Array<{
    key: HistoryPanelKey;
    label: string;
    title: string;
    description: string;
    tone?: WorkspaceButtonTone;
  }> = [
    {
      key: "overview",
      label: "Overview",
      title: "Archive Summary",
      description: `${summary.total} scans · ${summary.withDisease} disease hits`
    },
    {
      key: "timeline",
      label: "Rhythm",
      title: "Timeline View",
      description: recentItems[0] ? `${recentItems.length} most recent archive events.` : "Recent events appear after the first scan."
    },
    {
      key: "records",
      label: "Records",
      title: "Data Table",
      description: `${items.length} rows on this page · ${totalItems} stored overall.`
    },
    {
      key: "visuals",
      label: "Visuals",
      title: "Image Stream",
      description: `${visualItems.length || 0} capture tiles from the latest archive trail.`,
      tone: "accent"
    },
    {
      key: "mix",
      label: "Signals",
      title: "Detection Mix",
      description: `${healthyRate}% healthy · ${diseaseRate}% disease-positive.`,
      tone: "danger"
    },
    {
      key: "actions",
      label: "Routes",
      title: "Quick Actions",
      description: "Jump back into identify or reopen the catalog surfaces."
    }
  ];

  const renderHistoryPanel = () => {
    switch (selectedPanelKey || "overview") {
      case "overview":
        return (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Total Scans"
              value={String(summary.total)}
              note={hasItems ? "Every completed scan stored in your archive." : "Your archive starts after the first identify scan."}
            />
            <SummaryCard
              label="Healthy Reads"
              value={`${summary.healthy}`}
              note={`${healthyRate}% of recorded scans landed without a disease match.`}
              accentClassName="text-emerald-700"
            />
            <SummaryCard
              label="Disease Hits"
              value={`${summary.withDisease}`}
              note={hasItems ? `${diseaseRate}% of scans surfaced an active disease signal.` : "Disease signals will appear here once detected."}
              accentClassName="text-rose-600"
            />
            <SummaryCard
              label="Lead Detection"
              value={dominantDetection}
              note={summary.topDetections[0] ? "Most repeated disease result across the recent archive." : "No repeated disease pattern yet."}
              accentClassName={summary.topDetections[0] ? "text-zinc-900" : "text-zinc-500"}
            />
          </div>
        );
      case "timeline":
        return (
          <div>
            <div className="space-y-3">
              {hasItems ? (
                recentItems.map((item, index) => (
                  <div key={`timeline-${item.scan_id}`} className="flex items-start gap-3 rounded-[24px] border border-zinc-900/10 bg-white p-4">
                    <div className="flex w-7 shrink-0 flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-zinc-900" />
                      {index !== recentItems.length - 1 ? <span className="mt-2 h-full w-px bg-zinc-200" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-900">{item.plant_name || "Unknown specimen"}</p>
                          <p className={item.disease_name ? "mt-1 text-xs text-rose-600" : "mt-1 text-xs text-emerald-700"}>
                            {item.disease_name || "Healthy"}
                          </p>
                        </div>
                        <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                          {formatHistoryDate(item.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-5 text-sm leading-relaxed text-zinc-500">
                  Your recent scan rhythm will appear here as soon as you complete the first identify run.
                </div>
              )}
            </div>
            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPrevious={() => setPage((previous) => Math.max(previous - 1, 1))}
              onNext={() => setPage((previous) => Math.min(previous + 1, totalPages))}
            />
          </div>
        );
      case "records":
        return hasItems ? (
          <div>
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
                  {items.map((item) => (
                    <TableRow key={item.scan_id} className="border-zinc-900/10">
                      <TableCell className="font-medium text-zinc-800">{item.plant_name || "-"}</TableCell>
                      <TableCell className={item.disease_name ? "text-red-600" : "text-zinc-500"}>{item.disease_name || "Healthy"}</TableCell>
                      <TableCell>
                        {item.image_url ? (
                          <img
                            src={toAssetUrl(item.image_url)}
                            alt={item.plant_name || "Scan thumbnail"}
                            width={44}
                            height={44}
                            loading="lazy"
                            className="h-11 w-11 rounded-xl border border-zinc-200 object-cover"
                          />
                        ) : (
                          <span className="text-xs text-zinc-400">No image</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-500">{formatHistoryTimestamp(item.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPrevious={() => setPage((previous) => Math.max(previous - 1, 1))}
              onNext={() => setPage((previous) => Math.min(previous + 1, totalPages))}
            />
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-5 text-sm leading-relaxed text-zinc-500">
            The records table fills automatically once scans are stored.
          </div>
        );
      case "visuals":
        return (
          <div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {hasItems ? (
                visualItems.map((item) => (
                  <div key={`visual-${item.scan_id}`} className="overflow-hidden rounded-[22px] border border-zinc-900/12 bg-zinc-100 shadow-[0_12px_24px_rgba(24,24,27,0.05)]">
                    {item.image_url ? (
                      <img
                        src={toAssetUrl(item.image_url)}
                        alt={item.plant_name || "History scan"}
                        width={260}
                        height={180}
                        loading="lazy"
                        className="h-28 w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-28 place-items-center text-xs text-zinc-400">No image</div>
                    )}
                    <div className="px-3 py-2.5">
                      <p className="truncate text-xs font-semibold text-zinc-800">{item.plant_name || "Unknown specimen"}</p>
                      <p className={item.disease_name ? "truncate text-[11px] text-rose-600" : "truncate text-[11px] text-zinc-500"}>
                        {item.disease_name || "Healthy"}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={`placeholder-visual-${index}`} className="rounded-[22px] border border-zinc-900/12 bg-white/85 p-3">
                    <div className="h-16 w-full rounded-2xl bg-zinc-100" />
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Pending</p>
                    <p className="mt-1 text-xs text-zinc-600">Awaiting your next scan image.</p>
                  </div>
                ))
              )}
            </div>
            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPrevious={() => setPage((previous) => Math.max(previous - 1, 1))}
              onNext={() => setPage((previous) => Math.min(previous + 1, totalPages))}
            />
          </div>
        );
      case "mix":
        return (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,0.9fr)]">
            <article className="rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 p-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-zinc-900">
                  <span>Healthy Reads</span>
                  <span>{summary.healthy}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${healthyRate}%` }} />
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-zinc-900">
                  <span>Disease Signals</span>
                  <span>{summary.withDisease}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${diseaseRate}%` }} />
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-zinc-600">
                {hasItems
                  ? `${diseaseRate}% of your archive currently reflects a disease detection.`
                  : "Once scans arrive, this panel shows how much of the archive is healthy versus disease-positive."}
              </p>
            </article>

            <article className="rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Top Detections</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {summary.topDetections.length ? (
                  summary.topDetections.map(([name, count]) => (
                    <span key={name} className="rounded-full border border-zinc-900/10 bg-white px-3 py-1.5 text-xs text-zinc-800">
                      {name} · {count}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-500">No disease detections yet.</span>
                )}
              </div>
            </article>
          </div>
        );
      case "actions":
        return (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => navigateWithFloraTransition(router, "/identify")}
              className="group inline-flex h-12 items-center justify-between rounded-full bg-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black"
            >
              Run New Scan
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => navigateWithFloraTransition(router, "/gallery")}
              className="group inline-flex h-12 items-center justify-between rounded-full border border-zinc-900/12 bg-white px-5 font-mono text-xs uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:border-zinc-900/24 hover:bg-zinc-50"
            >
              Open Plant Gallery
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => navigateWithFloraTransition(router, "/disease-gallery")}
              className="group inline-flex h-12 items-center justify-between rounded-full border border-zinc-900/12 bg-white px-5 font-mono text-xs uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:border-zinc-900/24 hover:bg-zinc-50"
            >
              Open Disease Gallery
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground">
        <div className="grid min-h-[60vh] place-items-center">
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
      <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground">
        <div className="grid min-h-[60vh] place-items-center px-4">
          <div className="w-full max-w-xl border border-red-200/70 bg-red-50/90 px-5 py-4 text-sm font-medium text-red-700">{error}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 px-4 pb-12 pt-14 md:px-8 md:pb-16 md:pt-20 lg:px-10 xl:flex-1 xl:min-h-0 xl:px-12 xl:pb-6 xl:pt-8">
        <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-4 xl:h-full xl:min-h-0 xl:justify-center">
          <CenteredPageHero
            title="HISTORY"
            description="Review the latest capture, scan the visual trail, and inspect how disease hits are accumulating across your archive."
            titleClassName="text-[clamp(4rem,10vw,8.6rem)] leading-[0.74]"
            descriptionClassName="mt-1 max-w-[56rem]"
            className="mt-4 xl:mt-4"
          />

          <WorkspaceExpander
            panelButtons={panelButtons}
            selectedPanelKey={selectedPanelKey}
            onSelectPanel={setSelectedPanelKey}
            onBackToGrid={() => setSelectedPanelKey("")}
            renderExpandedPanel={renderHistoryPanel}
            sideRail={
              <motion.aside
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38, delay: 0.05 }}
                className="grid gap-4 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1"
              >
              <article className="overflow-hidden rounded-[26px] border border-zinc-900/12 bg-zinc-950 text-white shadow-[0_18px_45px_rgba(24,24,27,0.12)]">
                <div className="relative min-h-[240px]">
                  {latestItem?.image_url ? (
                    <img
                      src={toAssetUrl(latestItem.image_url)}
                      alt={latestItem.plant_name || "Latest scan"}
                      width={640}
                      height={420}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover opacity-80"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#2b2c31,transparent_54%),linear-gradient(180deg,#111215_0%,#09090b_100%)]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/38 to-black/10" />
                  <div className="relative flex h-full min-h-[240px] flex-col justify-between p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/62">Latest Capture</p>
                        <p className="mt-2 text-[2rem] font-display font-semibold leading-[0.92] tracking-[-0.05em] text-white">
                          {latestItem?.plant_name || "Archive idle"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                          latestItem?.disease_name
                            ? "border-rose-300/30 bg-rose-400/12 text-rose-100"
                            : "border-emerald-300/28 bg-emerald-400/12 text-emerald-100"
                        }`}
                      >
                        {latestItem ? (latestItem.disease_name ? "Disease hit" : "Healthy") : "No scans"}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                      <div className="rounded-[18px] border border-white/10 bg-white/7 px-4 py-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/46">Plant</p>
                        <p className="mt-2 text-sm font-medium text-white">{latestItem?.plant_name || "Run Identify to start the archive."}</p>
                      </div>
                      <div className="rounded-[18px] border border-white/10 bg-white/7 px-4 py-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/46">Detection</p>
                        <p className="mt-2 text-sm font-medium text-white">{latestItem?.disease_name || "Healthy"}</p>
                      </div>
                      <div className="rounded-[18px] border border-white/10 bg-white/7 px-4 py-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/46">Time</p>
                        <p className="mt-2 text-sm font-medium text-white">{latestItem ? formatHistoryDate(latestItem.created_at) : "Waiting"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Quick Actions</p>
                  <ScanSearch className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="mt-4 grid gap-2 border-t border-zinc-900/10 pt-4">
                  <button
                    type="button"
                    onClick={() => navigateWithFloraTransition(router, "/identify")}
                    className="group inline-flex items-center justify-between rounded-full bg-white px-4 py-2.5 font-mono text-xs uppercase tracking-[0.14em] text-zinc-950 transition-colors hover:bg-zinc-100"
                  >
                    Run New Scan
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateWithFloraTransition(router, "/gallery")}
                    className="group inline-flex items-center justify-between rounded-full border border-zinc-900/12 bg-white px-4 py-2.5 font-mono text-xs uppercase tracking-[0.14em] text-zinc-900 transition-colors hover:border-zinc-900/24 hover:bg-zinc-50"
                  >
                    Open Plant Gallery
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </button>
                </div>
              </article>

              <article className="rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Detection Mix</p>
                  <ShieldAlert className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="mt-4 space-y-3 border-t border-zinc-900/10 pt-4">
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm font-medium text-zinc-900">
                      <span>Healthy Reads</span>
                      <span>{summary.healthy}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${healthyRate}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm font-medium text-zinc-900">
                      <span>Disease Signals</span>
                      <span>{summary.withDisease}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                      <div className="h-full rounded-full bg-rose-400" style={{ width: `${diseaseRate}%` }} />
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    {hasItems
                      ? `${diseaseRate}% of your archive currently reflects a disease detection.`
                      : "Once scans arrive, this panel shows how much of the archive is healthy versus disease-positive."}
                  </p>
                </div>
              </article>

              <article className="rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Top Detections</p>
                  <Leaf className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-900/10 pt-4">
                  {summary.topDetections.length ? (
                    summary.topDetections.map(([name, count]) => (
                      <span key={name} className="rounded-full border border-zinc-900/10 bg-white px-3 py-1.5 text-xs text-zinc-800">
                        {name} · {count}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-zinc-500">No disease detections yet.</span>
                  )}
                </div>
              </article>

              <article className="rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Archive Notes</p>
                <div className="mt-4 space-y-2 border-t border-zinc-900/10 pt-4 text-sm leading-relaxed text-zinc-600">
                  <p>Every successful identify run lands here with plant output, disease status, image evidence, and a timestamp.</p>
                  <p>Use the archive surface on the left to scan the latest capture first, then skim the table or image stream below.</p>
                </div>
              </article>
              </motion.aside>
            }
          />
        </div>
      </section>
    </main>
  );
}
