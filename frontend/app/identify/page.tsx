/**
 * File: frontend/app/identify/page.tsx
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

import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, Camera, ScanLine, Search } from "lucide-react";
import { CenteredPageHero, GlassSurface } from "@/components/layout/showcase-shell";
import { apiFetch, apiFetchJson, getApiErrorMessage } from "@/lib/api-client";
import { navigateWithFloraTransition } from "@/lib/navigation-transition";
import { useHomeLocked } from "@/lib/use-home-locked";

type ScanMode = "smart" | "plant" | "disease";
type SmartChoice = {
  plantName: string;
  diseaseName: string;
};

const RETRYABLE_IDENTIFY_ERROR_CODES = new Set([
  "RETRY_WITH_LEAF",
  "LOW_CONFIDENCE_RETRY",
  "UNCERTAIN_CATALOG_MATCH",
  "IDENTIFICATION_EMPTY"
]);

export default function IdentifyPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [scanMode, setScanMode] = useState<ScanMode>("smart");
  const [smartChoice, setSmartChoice] = useState<SmartChoice | null>(null);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);

  useHomeLocked();

  useEffect(() => {
    try {
      const raw = localStorage.getItem("flora-settings-v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { defaultOutput?: "smart" | "species" | "disease" };
      if (parsed.defaultOutput === "species") {
        setScanMode("plant");
      } else if (parsed.defaultOutput === "disease") {
        setScanMode("disease");
      } else {
        setScanMode("smart");
      }
    } catch {
      // Keep default mode when settings are unavailable.
    }
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const setPreviewFromFile = (file: File | null) => {
    setPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return file ? URL.createObjectURL(file) : "";
    });
  };

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setSmartChoice(null);

    try {
      const formData = new FormData(event.currentTarget);
      formData.set("output_mode", scanMode);
      const { response, json } = await apiFetchJson<{
        type: string;
        identified_name: string;
        plant_name?: string | null;
        disease_name?: string | null;
        has_both?: boolean;
        message?: string;
        unresolved_disease_detected?: boolean;
      }>("/api/identify", {
        method: "POST",
        body: formData
      });

      if (!response.ok || !json?.success) {
        const apiErrorCode = String((json as { error?: { code?: string } } | null)?.error?.code || "");
        const apiErrorMessage = getApiErrorMessage(json, "Identification failed");
        if (response.status === 422 && RETRYABLE_IDENTIFY_ERROR_CODES.has(apiErrorCode)) {
          setMessage(apiErrorMessage);
          return;
        }

        setError(apiErrorMessage);
        return;
      }

      const unresolvedDiseaseDetected = Boolean(json.data.unresolved_disease_detected);
      const retryMessage =
        String(json.data.message || "").trim() ||
        "Detected disease is not available in the database. Try again with another clear leaf image.";

      if (json.data.type === "not_found") {
        setMessage(String(json.data.message || "Not found in database"));
        return;
      }

      const identifiedType = String(json.data.type || "");
      const identifiedName = String(json.data.identified_name || "");
      const plantName = String(json.data.plant_name || (identifiedType === "plant" ? identifiedName : ""));
      const diseaseName = unresolvedDiseaseDetected
        ? ""
        : String(json.data.disease_name || (identifiedType === "disease" ? identifiedName : ""));
      const hasDisease = diseaseName.length > 0;

      if (scanMode === "disease") {
        if (hasDisease) {
          const plantQuery = plantName ? `?plant=${encodeURIComponent(plantName)}` : "";
          navigateWithFloraTransition(router, `/results/disease/${encodeURIComponent(diseaseName)}${plantQuery}`);
          return;
        }

        if (unresolvedDiseaseDetected) {
          setMessage(retryMessage);
          return;
        }

        setMessage("No disease detected from this image. Try a clearer infected leaf or switch to Smart mode.");
        return;
      }

      if (scanMode === "smart" && plantName && hasDisease) {
        setMessage("Both plant and disease were detected. Choose the result view.");
        setSmartChoice({
          plantName,
          diseaseName
        });
        return;
      }

      if (scanMode === "plant" && !plantName) {
        setMessage("Plant profile could not be resolved from this image. Try Smart mode.");
        return;
      }

      if (scanMode === "plant" && plantName) {
        navigateWithFloraTransition(router, `/results/plant/${encodeURIComponent(plantName)}`);
        return;
      }

      if (hasDisease) {
        const plantQuery = plantName ? `?plant=${encodeURIComponent(plantName)}` : "";
        navigateWithFloraTransition(router, `/results/disease/${encodeURIComponent(diseaseName)}${plantQuery}`);
        return;
      }

      const smartTarget = plantName || identifiedName;
      navigateWithFloraTransition(router, `/results/plant/${encodeURIComponent(smartTarget)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Identification request failed";
      setError(message + ". Check backend and model services.");
    } finally {
      setLoading(false);
    }
  };

  const onManualSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (manualSearchLoading) return;
    setManualSearchLoading(true);
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("manualName") || "").trim();
    if (!name) {
      setManualSearchLoading(false);
      return;
    }

    try {
      const plantResponse = await apiFetch(`/api/plant/${encodeURIComponent(name)}`);
      if (plantResponse.ok) {
        navigateWithFloraTransition(router, `/results/plant/${encodeURIComponent(name)}`);
        return;
      }

      const diseaseResponse = await apiFetch(`/api/disease/${encodeURIComponent(name)}`);
      if (diseaseResponse.ok) {
        navigateWithFloraTransition(router, `/results/disease/${encodeURIComponent(name)}`);
        return;
      }

      setMessage("Not found in database");
    } catch {
      setError("Search request failed. Please try again.");
    } finally {
      setManualSearchLoading(false);
    }
  };

  const resetUploadSelection = () => {
    setSmartChoice(null);
    setMessage("");
    setError("");
    setFileName("");
    setPreviewFromFile(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  return (
    <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 px-4 pb-10 pt-10 md:px-8 md:pb-12 md:pt-14 lg:px-10 xl:flex-1 xl:min-h-0 xl:px-12 xl:pb-6 xl:pt-11">
        <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-2 xl:h-full xl:min-h-0 xl:justify-start">
          <CenteredPageHero
            title="IDENTIFY"
            description="Upload one specimen image, route directly into plant or disease results, or jump into the catalog by name."
            titleClassName="text-[clamp(4rem,10vw,8.6rem)] leading-[0.74]"
            descriptionClassName="mt-1 max-w-[56rem]"
            className="mt-4 xl:mt-4"
          />

          <div className="grid min-h-0 gap-3 xl:mt-2 xl:h-[34rem] xl:min-h-0 xl:grid-cols-12">
            <GlassSurface className="xl:col-span-8 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:p-3">
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex min-h-0 flex-col xl:h-full"
              >
                <form className="flex min-h-0 flex-1 flex-col" onSubmit={onUpload}>
              <input
                ref={fileRef}
                id="image"
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setFileName(file?.name || "");
                  setPreviewFromFile(file);
                }}
              />
              <input type="hidden" name="output_mode" value={scanMode} />

              <div className="min-h-0 flex-1">
                <div className="relative h-full">
                <motion.button
                  type="button"
                  aria-label="Upload plant image"
                  whileHover={{ scale: 1.006 }}
                  whileTap={{ scale: 0.995 }}
                  disabled={Boolean(smartChoice)}
                  onClick={() => {
                    if (smartChoice) return;
                    fileRef.current?.click();
                  }}
                  onDragOver={(event: DragEvent<HTMLButtonElement>) => {
                    if (smartChoice) return;
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(event: DragEvent<HTMLButtonElement>) => {
                    if (smartChoice) return;
                    event.preventDefault();
                    setDragActive(false);

                    const file = event.dataTransfer.files?.[0];
                    if (!file || !fileRef.current) return;

                    const transfer = new DataTransfer();
                    transfer.items.add(file);
                    fileRef.current.files = transfer.files;
                    setFileName(file.name);
                    setPreviewFromFile(file);
                  }}
                  className={`group relative flex h-full min-h-[18rem] w-full items-center justify-center overflow-hidden rounded-[20px] border border-dashed px-5 py-5 text-center transition-[border-color,background-color,color] duration-500 md:min-h-[21rem] ${
                    dragActive
                      ? "border-zinc-900 bg-white"
                      : "border-zinc-300 bg-zinc-50/90 hover:border-zinc-900 hover:bg-white"
                  }`}
                >
                  {previewUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Selected plant preview"
                        className="absolute inset-0 h-full w-full object-contain bg-zinc-100/70 opacity-95"
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/40 to-white/70" />
                    </>
                  )}
                  <div className="absolute left-4 top-4 h-4 w-4 border-l border-t border-zinc-300 transition-colors duration-500 group-hover:border-zinc-900" />
                  <div className="absolute right-4 top-4 h-4 w-4 border-r border-t border-zinc-300 transition-colors duration-500 group-hover:border-zinc-900" />
                  <div className="absolute bottom-4 left-4 h-4 w-4 border-b border-l border-zinc-300 transition-colors duration-500 group-hover:border-zinc-900" />
                  <div className="absolute bottom-4 right-4 h-4 w-4 border-b border-r border-zinc-300 transition-colors duration-500 group-hover:border-zinc-900" />
                  <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-900/10 transition-[top,opacity] duration-1000 group-hover:top-3/4 group-hover:opacity-0" />

                  <div className="relative z-10 flex flex-col items-center">
                    <Camera size={25} strokeWidth={1} className="mb-3 text-zinc-400 transition-colors duration-300 group-hover:text-zinc-900" />
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 transition-colors group-hover:text-zinc-900">
                      Upload Source
                    </p>
                    <p className="mt-3 text-sm font-medium text-zinc-900 md:text-base">Drop image here or click to browse</p>
                    <p className="mt-1 text-[11px] text-zinc-500">PNG, JPG, WEBP up to 5MB</p>
                    {fileName && <p className="floating-chip mt-3 rounded-full px-3 py-1 text-xs">{fileName}</p>}
                    {previewUrl && <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">Preview loaded</p>}
                  </div>
                </motion.button>
                  {smartChoice ? (
                    <div role="status" aria-live="polite" className="absolute inset-0 z-20 grid place-items-center bg-white/80 p-4 text-center backdrop-blur-sm">
                      <div className="w-full max-w-3xl">
                        <div className="grid gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            onClick={() => navigateWithFloraTransition(router, `/results/disease/${encodeURIComponent(smartChoice.diseaseName)}?plant=${encodeURIComponent(smartChoice.plantName)}`)}
                            className="inline-flex items-center justify-center rounded-full border border-red-300 bg-red-50 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-red-700 transition-colors hover:bg-red-100"
                          >
                            Disease
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateWithFloraTransition(router, `/results/plant/${encodeURIComponent(smartChoice.plantName)}`)}
                            className="inline-flex items-center justify-center rounded-full border border-zinc-900 bg-zinc-900 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-black"
                          >
                            Plant
                          </button>
                          <button
                            type="button"
                            onClick={resetUploadSelection}
                            className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
                          >
                            Try Again
                          </button>
                        </div>
                        <p className="mt-3 text-sm font-medium text-zinc-700">
                          {message || "Both plant and disease were detected. Choose the result view."}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {!smartChoice && (error || message) && (
                    <div
                      role={error ? "alert" : "status"}
                      aria-live={error ? "assertive" : "polite"}
                      className="absolute left-4 right-4 top-4 z-20 rounded-2xl border border-red-200/80 bg-red-50/95 px-4 py-3 text-sm font-medium text-red-700 shadow-sm backdrop-blur"
                    >
                      {error || message}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2 grid w-full grid-cols-1 gap-3 pt-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-6">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Analyze For</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { mode: "smart", label: "Smart" },
                        { mode: "plant", label: "Plant" },
                        { mode: "disease", label: "Disease" }
                      ].map((item) => (
                        <button
                          key={item.mode}
                          type="button"
                          aria-pressed={scanMode === item.mode}
                          onClick={() => setScanMode(item.mode as ScanMode)}
                          className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
                            scanMode === item.mode
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900 hover:text-zinc-900"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-4">
                    {[
                      { label: "Database", value: "10k+" },
                      { label: "Accuracy", value: "99.8%" },
                      { label: "Coverage", value: "Global" }
                    ].map((item) => (
                      <article key={item.label}>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{item.label}</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900 md:text-base">{item.value}</p>
                      </article>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group inline-flex w-full items-center justify-center gap-2 self-start rounded-full bg-zinc-900 px-7 py-2.5 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-65 sm:w-auto sm:min-w-[210px] xl:self-end xl:justify-self-end"
                >
                  {loading ? <span className="scan-loader" /> : <ScanLine className="h-4 w-4" />}
                  {loading ? "Scanning..." : scanMode === "disease" ? "Run Disease Scan" : scanMode === "plant" ? "Run Plant Scan" : "Run Smart Scan"}
                  {!loading && <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
                </button>
              </div>
                </form>
              </motion.section>
            </GlassSurface>

            <GlassSurface className="xl:col-span-4 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:p-3">
              <motion.aside
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.08 }}
                className="flex h-full min-h-0 flex-col"
              >
              <article className="flex h-full min-h-0 flex-col rounded-[24px] border border-zinc-900/12 bg-white/82 p-5 shadow-[0_12px_30px_rgba(24,24,27,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Lookup Console</p>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => navigateWithFloraTransition(router, "/gallery")}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-zinc-900/20 bg-white px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-900 transition-colors hover:border-zinc-900 sm:px-3 sm:tracking-[0.14em]"
                    >
                      Plant Gallery
                      <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateWithFloraTransition(router, "/disease-gallery")}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100 sm:px-3 sm:tracking-[0.14em]"
                    >
                      Disease Gallery
                      <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </div>

                <form className="mt-4 space-y-3 border-t border-zinc-900/14 pt-4" onSubmit={onManualSearch}>
                  <label htmlFor="manualName" className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    Plant or Disease Name
                  </label>
                  <input
                    id="manualName"
                    name="manualName"
                    placeholder="Rose, Tomato, Powdery Mildew..."
                    required
                    disabled={manualSearchLoading}
                    aria-busy={manualSearchLoading}
                    className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900"
                  />
                  <button
                    type="submit"
                    disabled={manualSearchLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-zinc-900 px-6 py-2.5 font-mono text-xs uppercase tracking-[0.14em] text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Search className="h-4 w-4" />
                    {manualSearchLoading ? "Searching..." : "Search Database"}
                  </button>
                </form>

                <div className="mt-5 border-t border-zinc-900/14 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Quick Queries</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-900/14 pt-4">
                  {[
                    { name: "Tomato", type: "plant" },
                    { name: "Potato", type: "plant" },
                    { name: "Pepper", type: "plant" },
                    { name: "Bacterial Spot", type: "disease" },
                    { name: "Early Blight", type: "disease" },
                    { name: "Late Blight", type: "disease" }
                  ].map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => navigateWithFloraTransition(router, `/results/${item.type}/${encodeURIComponent(item.name)}`)}
                      className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-800 transition-colors hover:border-zinc-900 hover:text-zinc-900"
                    >
                      {item.name}
                    </button>
                  ))}
                  </div>
                </div>
              </article>
              </motion.aside>
            </GlassSurface>
          </div>
        </div>
      </section>
    </main>
  );
}
