/**
 * File: frontend/app/results/[type]/[name]/page.tsx
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

import Image from "next/image";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { PlantResultJson } from "@/lib/types/api";
import { apiFetchJson, getApiErrorMessage, toAssetUrl } from "@/lib/api-client";
import { navigateWithFloraTransition } from "@/lib/navigation-transition";
import { useHomeLocked } from "@/lib/use-home-locked";

type DiseaseData = {
  disease_id: number;
  disease_name: string;
  affected_species: string;
  image_url: string;
  disease_category: string;
  pathogen_type: string;
  affected_parts: string;
  favorable_conditions: string;
  diagnosis_notes: string;
  disease_description: string;
  symptoms: string;
  causes: string;
  prevention_methods: string;
  treatment_methods: string;
  treatment_organic: string;
  treatment_chemical: string;
  recovery_time: string;
  monitoring_tips: string;
  severity_level: string;
  primary_plant_name?: string | null;
  related_plants?: string[];
};

function MetricRing({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const ringStyle = {
    background: `conic-gradient(#18181b ${clamped * 3.6}deg, #d4d4d8 ${clamped * 3.6}deg 360deg)`
  } as CSSProperties;

  return (
    <article className="flex items-center gap-3">
      <div className="relative h-20 w-20 shrink-0 rounded-full p-[4px]" style={ringStyle}>
        <div className="grid h-full w-full place-items-center rounded-full bg-[#f4f5f4]">
          <p className="font-mono text-[11px] text-zinc-700">{clamped}%</p>
        </div>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      </div>
    </article>
  );
}

function severityToScore(level: string) {
  const v = level.toLowerCase();
  if (v.includes("critical")) return 95;
  if (v.includes("high")) return 82;
  if (v.includes("medium") || v.includes("moderate")) return 62;
  if (v.includes("low")) return 36;
  return 50;
}

export default function ResultPage({ params }: { params: { type: string; name: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plant, setPlant] = useState<PlantResultJson | null>(null);
  const [disease, setDisease] = useState<DiseaseData | null>(null);
  const [imageLoadError, setImageLoadError] = useState({
    plant: false,
    disease: false
  });

  useHomeLocked();

  const isDiseasePage = params.type === "disease";
  const diseaseFromQuery = searchParams.get("disease");
  const plantFromQuery = searchParams.get("plant");
  const relatedPlantName = plantFromQuery || disease?.primary_plant_name || disease?.related_plants?.[0] || "";
  const backHref = plant ? "/gallery" : "/disease-gallery";
  const backLabel = plant ? "Back To Plant Gallery" : "Back To Disease Gallery";

  useEffect(() => {
    const type = params.type;
    const name = decodeURIComponent(params.name);

    const fetchData = async () => {
      setLoading(true);
      setError("");
      setPlant(null);
      setDisease(null);

      try {
        const endpoint = type === "disease" ? `/api/disease/${encodeURIComponent(name)}` : `/api/plant/${encodeURIComponent(name)}`;
        const { response, json } = await apiFetchJson<PlantResultJson | DiseaseData>(endpoint);

        if (!response.ok || !json?.success) {
          setError(getApiErrorMessage(json, "Failed to load result"));
          return;
        }

        if (type === "disease") {
          setDisease(json.data as DiseaseData);
        } else {
          setPlant(json.data as PlantResultJson);
        }

        if (type === "plant" && diseaseFromQuery) {
          const diseaseResponse = await apiFetchJson<DiseaseData>(
            `/api/disease/${encodeURIComponent(diseaseFromQuery)}`
          );
          if (diseaseResponse.response.ok && diseaseResponse.json?.success) {
            setDisease(diseaseResponse.json.data);
          }
        }
      } catch {
        setError("Result request failed. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [diseaseFromQuery, params.name, params.type]);

  useEffect(() => {
    // Reset image fallback state whenever route/data changes.
    setImageLoadError({ plant: false, disease: false });
  }, [params.name, params.type, plant?.image_url, disease?.image_url]);

  const imageUrl = toAssetUrl(plant?.image_url);
  const diseaseImageUrl = toAssetUrl(disease?.image_url);

  const title = plant?.common_name || disease?.disease_name || decodeURIComponent(params.name);

  const diseaseScore = disease ? severityToScore(disease.severity_level) : 0;
  const averageRisk = useMemo(() => {
    if (!plant || !plant.disease_risk_levels.values.length) return 0;
    const total = plant.disease_risk_levels.values.reduce((sum, value) => sum + value, 0);
    return Math.round(total / plant.disease_risk_levels.values.length);
  }, [plant]);

  const plantModules = useMemo(() => {
    if (!plant) return [];
    const hasRiskBands = plant.disease_risk_levels.labels.length > 0 && plant.disease_risk_levels.values.length > 0;
    const monitoringPriority = averageRisk >= 70 ? "High watch" : averageRisk >= 40 ? "Moderate watch" : "Routine watch";

    return [
      {
        key: "overview",
        node: (
          <article className="flex h-full w-full flex-col border-t border-zinc-900/14 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Profile & Confidence</p>
            <p className="mt-3 max-w-5xl text-base leading-relaxed text-zinc-800">{plant.plant_description}</p>

            <div className="mt-4 grid gap-3 border-t border-zinc-900/14 pt-4 sm:grid-cols-3">
              <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Confidence</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">{plant.confidence_score ?? 0}%</p>
              </div>
              <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Avg Risk</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">{averageRisk}%</p>
              </div>
              <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Watering</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">{plant.watering_schedule.frequency}</p>
              </div>
            </div>

            <div className="mt-4 border-t border-zinc-900/14 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Model Confidence</p>
              <div className="mt-2 h-2 w-full bg-zinc-200">
                <div className="h-2 bg-zinc-900" style={{ width: `${Math.max(0, Math.min(100, plant.confidence_score || 0))}%` }} />
              </div>
              <p className="mt-1 font-mono text-xs text-zinc-500">{plant.confidence_score ?? 0}%</p>
            </div>

            <div className="mt-4 grid gap-4 border-t border-zinc-900/14 pt-4 md:grid-cols-3">
              <MetricRing label="Water Need" value={plant.care_indicators.water_need_level} />
              <MetricRing label="Sunlight Need" value={plant.care_indicators.sunlight_need_level} />
              <MetricRing label="Maintenance" value={plant.care_indicators.maintenance_level} />
            </div>
          </article>
        )
      },
      {
        key: "growth",
        node: (
          <article className="flex h-full w-full flex-col border-t border-zinc-900/14 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Growth Conditions</p>
            <div className="mt-3 space-y-3 border-t border-zinc-900/14 pt-3">
              {[
                ["Soil", plant.growth_conditions.soil_requirements],
                ["Water", plant.growth_conditions.water_requirements],
                ["Sunlight", plant.growth_conditions.sunlight_requirements],
                ["Temperature", plant.growth_conditions.temperature_conditions]
              ].map(([label, value]) => (
                <div key={label} className="border-b border-zinc-900/10 pb-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
                  <p className="mt-1 text-sm text-zinc-700">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-zinc-900/14 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Watering Schedule</p>
              <p className="mt-1 text-sm text-zinc-700">{plant.watering_schedule.frequency}</p>
            </div>
          </article>
        )
      },
      {
        key: "risk",
        node: (
          <article className="flex h-full w-full flex-col border-t border-zinc-900/14 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Risk Distribution</p>
            <div className="mt-3 space-y-3 border-t border-zinc-900/14 pt-3">
              {hasRiskBands ? (
                plant.disease_risk_levels.labels.map((label, index) => {
                  const value = Math.max(0, Math.min(100, plant.disease_risk_levels.values[index] ?? 0));
                  return (
                    <div key={label}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
                        <p className="font-mono text-[10px] text-zinc-500">{value}%</p>
                      </div>
                      <div className="h-2 w-full bg-zinc-200">
                        <div className="h-2 bg-zinc-900" style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Risk Bands</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-800">No numeric breakdown from source.</p>
                    <p className="mt-1 text-xs text-zinc-600">Use listed common diseases and care indicators for screening.</p>
                  </div>
                  <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Monitoring Priority</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-800">{monitoringPriority}</p>
                    <p className="mt-1 text-xs text-zinc-600">Adjust frequency based on humidity, watering, and leaf condition changes.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-zinc-900/14 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Common Diseases</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {plant.common_diseases.length ? (
                  plant.common_diseases.map((d) => (
                    <span key={d} className="floating-chip rounded-full px-3 py-1 text-xs">
                      {d}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-500">No common disease data.</span>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-3 border-t border-zinc-900/14 pt-4 sm:grid-cols-2">
              <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Average Risk Index</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">{averageRisk}%</p>
              </div>
              <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Risk Mode</p>
                <p className="mt-1 text-sm font-semibold text-zinc-800">{monitoringPriority}</p>
              </div>
            </div>
          </article>
        )
      },
      {
        key: "metrics",
        node: (
          <article className="flex h-full w-full flex-col border-t border-zinc-900/14 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Growth Metrics</p>
            <div className="mt-3 grid gap-4 border-t border-zinc-900/14 pt-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Average Height</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">{plant.growth_metrics.average_height_cm} cm</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Growth Rate</p>
                <p className="mt-1 text-xl font-semibold text-zinc-900">{plant.growth_metrics.growth_rate}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Toxicity</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-700">{plant.toxicity_information}</p>
              </div>
            </div>
          </article>
        )
      }
    ];
  }, [averageRisk, plant]);

  const diseaseModules = useMemo(() => {
    if (!disease) return [];

    return [
      {
        key: "diagnosis",
        node: (
          <article className="flex h-full w-full flex-col border-t border-zinc-900/14 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Diagnosis</p>
            <p className="mt-3 max-w-5xl text-base leading-relaxed text-zinc-800">{disease.disease_description}</p>

            <div className="mt-4 grid gap-3 border-t border-zinc-900/14 pt-4 sm:grid-cols-2">
              <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Severity Index</p>
                <p className="mt-1 text-2xl font-semibold text-red-600">{diseaseScore}%</p>
              </div>
              <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Affected Species</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">{disease.affected_species}</p>
              </div>
              <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Category</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">{disease.disease_category}</p>
              </div>
              <div className="border border-zinc-900/10 bg-white/75 px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Pathogen</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">{disease.pathogen_type}</p>
              </div>
            </div>

            <div className="mt-4 border-t border-zinc-900/14 pt-4">
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Severity</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-red-600">{disease.severity_level}</p>
              </div>
              <div className="h-2 w-full bg-zinc-200">
                <div className="h-2 bg-red-600" style={{ width: `${diseaseScore}%` }} />
              </div>
            </div>
          </article>
        )
      },
      {
        key: "symptoms",
        node: (
          <article className="flex h-full w-full flex-col border-t border-zinc-900/14 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Symptoms</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">{disease.symptoms}</p>

            <div className="mt-4 border-t border-zinc-900/14 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Causes</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.causes}</p>
            </div>

            <div className="mt-4 grid gap-4 border-t border-zinc-900/14 pt-4 md:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Affected Parts</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.affected_parts}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Favorable Conditions</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.favorable_conditions}</p>
              </div>
            </div>

            <div className="mt-4 border-t border-zinc-900/14 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Diagnosis Notes</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.diagnosis_notes}</p>
            </div>
          </article>
        )
      },
      {
        key: "actions",
        node: (
          <article className="flex h-full w-full flex-col border-t border-zinc-900/14 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Prevention & Treatment</p>
            <div className="mt-3 grid gap-4 border-t border-zinc-900/14 pt-3 md:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Prevention</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.prevention_methods}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Treatment</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.treatment_methods}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 border-t border-zinc-900/14 pt-4 md:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Organic Plan</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.treatment_organic}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Chemical Plan</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.treatment_chemical}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 border-t border-zinc-900/14 pt-4 md:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Recovery Window</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.recovery_time}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Monitoring</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700">{disease.monitoring_tips}</p>
              </div>
            </div>
          </article>
        )
      }
    ];
  }, [disease, diseaseScore]);

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
          <div className="w-full max-w-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        </div>
      </main>
    );
  }

  const modules = plant ? [...plantModules, ...(disease ? diseaseModules : [])] : diseaseModules;

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
            <button
              type="button"
              onClick={() => navigateWithFloraTransition(router, backHref)}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-900/15 bg-white/65 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-900 hover:text-zinc-900"
            >
              <ArrowLeft size={14} />
              {backLabel}
            </button>

            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{plant ? "Plant Result" : "Disease Result"}</p>
            <h1
              className={`mt-2 text-[clamp(2.9rem,7vw,6rem)] leading-[0.86] font-display font-bold tracking-[-0.08em] ${
                isDiseasePage ? "text-destructive" : "text-foreground"
              }`}
            >
              {title}
            </h1>

            <p className="mt-1 truncate text-base text-zinc-600 md:text-lg">{plant ? plant.scientific_name : `Affected Species: ${disease?.affected_species || "-"}`}</p>
            {!plant && relatedPlantName && (
              <div className="mt-3 border-t border-zinc-900/14 pt-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Detected On</p>
                <button
                  type="button"
                  onClick={() => navigateWithFloraTransition(router, `/results/plant/${encodeURIComponent(relatedPlantName)}`)}
                  className="group mt-1 inline-flex items-center gap-1 rounded-full border border-zinc-900/15 bg-white/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
                >
                  {relatedPlantName}
                  <ArrowUpRight size={12} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
              </div>
            )}

            {plant ? (
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-900/14 pt-4 sm:grid-cols-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Confidence</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">{plant.confidence_score ?? 0}%</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Species</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">{plant.species}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Family</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">{plant.family}</p>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-900/14 pt-4 sm:grid-cols-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Severity</p>
                  <p className="mt-1 text-xl font-semibold text-red-600">{disease?.severity_level || "-"}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Risk Score</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">{diseaseScore}%</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Category</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">Disease</p>
                </div>
              </div>
            )}

            {plant && disease && (
              <div className="mt-4 border-t border-zinc-900/14 pt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Detected Disease</p>
                <p className="mt-1 text-xl font-semibold text-red-600">{disease.disease_name}</p>
                <p className="mt-1 text-sm text-zinc-700">Severity: {disease.severity_level}</p>
                <button
                  type="button"
                  onClick={() => navigateWithFloraTransition(router, `/results/disease/${encodeURIComponent(disease.disease_name)}`)}
                  className="group mt-2 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-red-700 transition-colors hover:border-red-300 hover:bg-red-100"
                >
                  Open Full Disease Profile
                  <ArrowUpRight size={12} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
              </div>
            )}

            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="relative w-full min-h-[18rem] flex-1 overflow-hidden border border-zinc-900/12 bg-zinc-950">
                {plant ? (
                  imageUrl && !imageLoadError.plant ? (
                    <Image
                      src={imageUrl}
                      alt={`${title} reference`}
                      fill
                      sizes="(max-width: 1024px) 92vw, 34vw"
                      className="object-cover"
                      priority
                      onError={() => setImageLoadError((prev) => ({ ...prev, plant: true }))}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-zinc-400">No reference image</div>
                  )
                ) : (
                  diseaseImageUrl && !imageLoadError.disease ? (
                    <Image
                      src={diseaseImageUrl}
                      alt={`${title} reference`}
                      fill
                      sizes="(max-width: 1024px) 92vw, 34vw"
                      className="object-cover"
                      priority
                      onError={() => setImageLoadError((prev) => ({ ...prev, disease: true }))}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-zinc-400">No disease image</div>
                  )
                )}
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigateWithFloraTransition(router, "/identify")}
              className="group mt-4 inline-flex w-fit items-center gap-2 border border-zinc-900 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-zinc-900 transition-all hover:bg-zinc-900 hover:text-white"
            >
              New Scan
              <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
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
                <p className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400 sm:block">Structured Detail Cards</p>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-6 pb-2">
                  {modules.map((module) => (
                    <div key={module.key} className="h-full">
                      {module.node}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>
        </div>
      </section>
    </main>
  );
}
