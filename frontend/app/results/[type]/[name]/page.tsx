"use client";

/* eslint-disable @next/next/no-img-element -- Result media uses direct catalog/backend URLs and keeps current rendering behavior intentionally unchanged. */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { CenteredPageHero } from "@/components/layout/showcase-shell";
import type { PlantResultJson } from "@/lib/types/api";
import { apiFetchJson, getApiErrorMessage, toAssetUrl } from "@/lib/api-client";
import { navigateWithFloraTransition } from "@/lib/navigation-transition";

type DiseaseData = {
  disease_id: number;
  disease_name: string;
  affected_species: string;
  image_url: string;
  media?: {
    gallery_images?: string[];
    video_src?: string | null;
  };
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

type PanelTone = "default" | "accent" | "danger";

type ResultPanel = {
  key: string;
  eyebrow: string;
  title: string;
  teaser: string;
  summary: string;
  tone: PanelTone;
  details: Array<{ label: string; value: string }>;
  cta?: { label: string; href: string };
  videoSrc?: string;
};

function safeText(value: string | number | null | undefined, fallback = "Not available") {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : fallback;
}

function conciseText(value: string | number | null | undefined, maxLength = 72) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;

  const clipped = normalized.slice(0, maxLength + 1);
  const boundary = clipped.lastIndexOf(" ");
  const safeBoundary = boundary > Math.floor(maxLength * 0.65) ? boundary : maxLength;
  return `${clipped.slice(0, safeBoundary).trim()}...`;
}

function severityToScore(level: string) {
  const value = level.toLowerCase();
  if (value.includes("critical")) return 95;
  if (value.includes("high")) return 84;
  if (value.includes("medium") || value.includes("moderate")) return 62;
  if (value.includes("low")) return 36;
  return 50;
}

function riskMode(value: number) {
  if (value >= 70) return "High watch";
  if (value >= 40) return "Moderate watch";
  return "Routine watch";
}

function scoreLabel(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function joinText(parts: Array<string | null | undefined>, separator = " · ", fallback = "Not available") {
  const values = parts.map((part) => String(part ?? "").trim()).filter(Boolean);
  return values.length ? values.join(separator) : fallback;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildPlantPanels(plant: PlantResultJson, disease: DiseaseData | null, averageRisk: number): ResultPanel[] {
  const wateringDays = plant.watering_schedule.chart_data
    .filter((entry) => entry.water)
    .map((entry) => entry.day)
    .join(", ");

  const growthLabels = plant.growth_metrics.chart_data.labels;
  const growthValues = plant.growth_metrics.chart_data.values;
  const latestGrowthIndex = Math.max(0, growthValues.length - 1);
  const latestGrowthPoint =
    growthLabels.length > 0 && growthValues.length > 0
      ? `${growthLabels[latestGrowthIndex]} · ${growthValues[latestGrowthIndex]} cm`
      : "No growth chart data";

  const riskBreakdown = plant.disease_risk_levels.labels
    .slice(0, 3)
    .map((label, index) => `${label} ${scoreLabel(plant.disease_risk_levels.values[index] ?? 0)}`)
    .join(" • ");

  const commonDiseases = plant.common_diseases.length ? plant.common_diseases.join(", ") : "No common disease list in catalog";
  const videoSrc = plant.media?.video_src || "/placeholder.mp4";

  const panels: ResultPanel[] = [
    {
      key: "species",
      eyebrow: "Plant Identity",
      title: plant.species,
      teaser: safeText(plant.plant_description),
      summary: `${plant.common_name} is cataloged as ${plant.scientific_name} and recorded under the ${plant.family} family.`,
      tone: "default",
      details: [
        { label: "Species", value: plant.species },
        { label: "Scientific", value: plant.scientific_name },
        { label: "Common Name", value: plant.common_name },
        { label: "Confidence", value: scoreLabel(plant.confidence_score) }
      ]
    },
    {
      key: "family",
      eyebrow: "Botanical Family",
      title: plant.family,
      teaser: `${plant.common_name} belongs to the ${plant.family} family.`,
      summary: `${plant.family} is the broader botanical family for ${plant.common_name}, while the catalog species entry is ${plant.species}.`,
      tone: "default",
      details: [
        { label: "Family", value: plant.family },
        { label: "Species", value: plant.species },
        { label: "Scientific", value: plant.scientific_name },
        { label: "Common Name", value: plant.common_name }
      ]
    },
    {
      key: "watering",
      eyebrow: "Water Rhythm",
      title: "Water Schedule",
      teaser: safeText(plant.watering_schedule.frequency),
      summary: joinText(
        [safeText(plant.growth_conditions.water_requirements), safeText(wateringDays, "No day markers supplied")],
        " "
      ),
      tone: "accent",
      details: [
        { label: "Schedule", value: safeText(plant.watering_schedule.frequency) },
        { label: "Water Need", value: scoreLabel(plant.care_indicators.water_need_level) },
        { label: "Water Requirement", value: safeText(plant.growth_conditions.water_requirements) },
        { label: "Water Days", value: safeText(wateringDays, "No day markers supplied") }
      ]
    },
    {
      key: "climate",
      eyebrow: "Climate Frame",
      title: "Climate Balance",
      teaser: `${safeText(plant.growth_conditions.sunlight_requirements)} · ${safeText(plant.growth_conditions.temperature_conditions)}`,
      summary: joinText(
        [safeText(plant.growth_conditions.sunlight_requirements), safeText(plant.growth_conditions.temperature_conditions)],
        " "
      ),
      tone: "accent",
      details: [
        { label: "Sunlight", value: safeText(plant.growth_conditions.sunlight_requirements) },
        { label: "Temperature", value: safeText(plant.growth_conditions.temperature_conditions) },
        { label: "Sunlight Need", value: scoreLabel(plant.care_indicators.sunlight_need_level) },
        { label: "Soil Base", value: safeText(plant.growth_conditions.soil_requirements) }
      ]
    },
    {
      key: "growth",
      eyebrow: "Growth Metrics",
      title: "Growth Form",
      teaser: `${plant.growth_metrics.average_height_cm} cm average height · ${safeText(plant.growth_metrics.growth_rate)}`,
      summary: `${plant.common_name} typically reaches about ${plant.growth_metrics.average_height_cm} cm and is listed with a ${safeText(plant.growth_metrics.growth_rate)} growth rate.`,
      tone: "default",
      details: [
        { label: "Average Height", value: `${plant.growth_metrics.average_height_cm} cm` },
        { label: "Growth Rate", value: safeText(plant.growth_metrics.growth_rate) },
        { label: "Latest Chart Point", value: latestGrowthPoint },
        { label: "Chart Labels", value: safeText(growthLabels.join(", "), "No growth chart labels") }
      ]
    },
    {
      key: "care",
      eyebrow: "Care Signals",
      title: "Maintenance Profile",
      teaser: joinText(
        [
          `Maintenance ${scoreLabel(plant.care_indicators.maintenance_level)}`,
          `Water ${scoreLabel(plant.care_indicators.water_need_level)}`,
          `Sunlight ${scoreLabel(plant.care_indicators.sunlight_need_level)}`
        ]
      ),
      summary: `${plant.common_name} has a ${scoreLabel(plant.care_indicators.maintenance_level)} maintenance score, with water need at ${scoreLabel(
        plant.care_indicators.water_need_level
      )} and sunlight need at ${scoreLabel(plant.care_indicators.sunlight_need_level)}.`,
      tone: "accent",
      details: [
        { label: "Maintenance", value: scoreLabel(plant.care_indicators.maintenance_level) },
        { label: "Water Need", value: scoreLabel(plant.care_indicators.water_need_level) },
        { label: "Sunlight Need", value: scoreLabel(plant.care_indicators.sunlight_need_level) },
        { label: "Primary Routine", value: safeText(plant.watering_schedule.frequency) }
      ]
    },
    {
      key: "watchlist",
      eyebrow: "Risk Surface",
      title: "Disease Watchlist",
      teaser: commonDiseases,
      summary: `Common catalog disease risks for ${plant.common_name} include ${commonDiseases}. Average risk is ${scoreLabel(averageRisk)}.`,
      tone: "danger",
      details: [
        { label: "Average Risk", value: scoreLabel(averageRisk) },
        { label: "Risk Mode", value: riskMode(averageRisk) },
        { label: "Risk Breakdown", value: safeText(riskBreakdown, "No numeric disease risk bands") },
        { label: "Common Diseases", value: commonDiseases }
      ],
      cta: disease
        ? {
            label: "Open Disease Profile",
            href: `/results/disease/${encodeURIComponent(disease.disease_name)}`
          }
        : undefined
    },
    {
      key: "toxicity",
      eyebrow: "Handling Notes",
      title: "Handling & Toxicity",
      teaser: safeText(plant.toxicity_information),
      summary: safeText(plant.toxicity_information),
      tone: "default",
      details: [
        { label: "Toxicity", value: safeText(plant.toxicity_information) },
        { label: "Soil", value: safeText(plant.growth_conditions.soil_requirements) },
        { label: "Water", value: safeText(plant.growth_conditions.water_requirements) },
        { label: "Sunlight", value: safeText(plant.growth_conditions.sunlight_requirements) }
      ]
    },
    {
      key: "calendar",
      eyebrow: "Schedule Matrix",
      title: "Water Calendar",
      teaser: safeText(wateringDays, "No schedule marks available"),
      summary: `${safeText(wateringDays, "No schedule marks available")}. ${safeText(plant.watering_schedule.frequency)}`,
      tone: "accent",
      details: [
        { label: "Water Days", value: safeText(wateringDays, "No day markers supplied") },
        { label: "Frequency", value: safeText(plant.watering_schedule.frequency) },
        { label: "Chart Entries", value: String(plant.watering_schedule.chart_data.length) },
        { label: "Routine", value: riskMode(plant.care_indicators.maintenance_level) }
      ]
    },
    {
      key: "growth-chart",
      eyebrow: "Growth Curve",
      title: "Growth Chart Read",
      teaser: latestGrowthPoint,
      summary: `${latestGrowthPoint}. Growth rate is listed as ${safeText(plant.growth_metrics.growth_rate)}.`,
      tone: "default",
      details: [
        { label: "Latest Point", value: latestGrowthPoint },
        { label: "Chart Labels", value: safeText(growthLabels.join(", "), "No chart labels") },
        { label: "Chart Values", value: safeText(growthValues.join(", "), "No chart values") },
        { label: "Growth Rate", value: safeText(plant.growth_metrics.growth_rate) }
      ]
    }
  ];

  return panels.map((panel) => ({
    ...panel,
    videoSrc
  }));
}

function buildDiseasePanels(disease: DiseaseData, relatedPlantName: string): ResultPanel[] {
  const severityScore = severityToScore(disease.severity_level);
  const videoSrc = disease.media?.video_src || "/placeholder.mp4";

  const panels: ResultPanel[] = [
    {
      key: "overview",
      eyebrow: "Disease Overview",
      title: "Disease Identity",
      teaser: `${safeText(disease.disease_category)} · ${safeText(disease.pathogen_type)}`,
      summary: safeText(disease.disease_description),
      tone: "danger",
      details: [
        { label: "Disease", value: disease.disease_name },
        { label: "Category", value: safeText(disease.disease_category) },
        { label: "Pathogen", value: safeText(disease.pathogen_type) },
        { label: "Affected Species", value: safeText(disease.affected_species) }
      ],
      cta: relatedPlantName
        ? {
            label: "Open Plant Profile",
            href: `/results/plant/${encodeURIComponent(relatedPlantName)}`
          }
        : undefined
    },
    {
      key: "severity",
      eyebrow: "Severity Surface",
      title: "Severity Index",
      teaser: joinText([safeText(disease.severity_level), scoreLabel(severityScore)]),
      summary: `Severity is listed as ${safeText(disease.severity_level)}. The most affected plant parts are ${safeText(
        disease.affected_parts
      )}.`,
      tone: "danger",
      details: [
        { label: "Severity", value: safeText(disease.severity_level) },
        { label: "Severity Score", value: scoreLabel(severityScore) },
        { label: "Affected Parts", value: safeText(disease.affected_parts) },
        { label: "Host Species", value: safeText(disease.affected_species) }
      ]
    },
    {
      key: "symptoms",
      eyebrow: "Visual Symptoms",
      title: "Symptom Frame",
      teaser: safeText(disease.symptoms),
      summary: safeText(disease.diagnosis_notes),
      tone: "danger",
      details: [
        { label: "Symptoms", value: safeText(disease.symptoms) },
        { label: "Affected Parts", value: safeText(disease.affected_parts) },
        { label: "Diagnosis Notes", value: safeText(disease.diagnosis_notes) },
        { label: "Host", value: safeText(disease.affected_species) }
      ]
    },
    {
      key: "causes",
      eyebrow: "Cause Signal",
      title: "Cause Read",
      teaser: safeText(disease.causes),
      summary: safeText(disease.causes),
      tone: "default",
      details: [
        { label: "Causes", value: safeText(disease.causes) },
        { label: "Conditions", value: safeText(disease.favorable_conditions) },
        { label: "Category", value: safeText(disease.disease_category) },
        { label: "Pathogen", value: safeText(disease.pathogen_type) }
      ]
    },
    {
      key: "conditions",
      eyebrow: "Pressure Conditions",
      title: "Favorable Conditions",
      teaser: safeText(disease.favorable_conditions),
      summary: safeText(disease.favorable_conditions),
      tone: "accent",
      details: [
        { label: "Conditions", value: safeText(disease.favorable_conditions) },
        { label: "Affected Parts", value: safeText(disease.affected_parts) },
        { label: "Diagnosis Notes", value: safeText(disease.diagnosis_notes) },
        { label: "Recovery Window", value: safeText(disease.recovery_time) }
      ]
    },
    {
      key: "prevention",
      eyebrow: "Prevention Plan",
      title: "Prevention Path",
      teaser: safeText(disease.prevention_methods),
      summary: safeText(disease.prevention_methods),
      tone: "accent",
      details: [
        { label: "Prevention", value: safeText(disease.prevention_methods) },
        { label: "Monitoring", value: safeText(disease.monitoring_tips) },
        { label: "Conditions", value: safeText(disease.favorable_conditions) },
        { label: "Host Species", value: safeText(disease.affected_species) }
      ]
    },
    {
      key: "treatment",
      eyebrow: "Treatment Plan",
      title: "Treatment Route",
      teaser: safeText(disease.treatment_methods),
      summary: safeText(disease.treatment_methods),
      tone: "danger",
      details: [
        { label: "Treatment", value: safeText(disease.treatment_methods) },
        { label: "Organic", value: safeText(disease.treatment_organic) },
        { label: "Chemical", value: safeText(disease.treatment_chemical) },
        { label: "Recovery", value: safeText(disease.recovery_time) }
      ]
    },
    {
      key: "monitoring",
      eyebrow: "Recovery Watch",
      title: "Monitoring Notes",
      teaser: safeText(disease.monitoring_tips),
      summary: safeText(disease.monitoring_tips),
      tone: "default",
      details: [
        { label: "Monitoring", value: safeText(disease.monitoring_tips) },
        { label: "Recovery", value: safeText(disease.recovery_time) },
        { label: "Diagnosis Notes", value: safeText(disease.diagnosis_notes) },
        { label: "Severity", value: safeText(disease.severity_level) }
      ]
    },
    {
      key: "organic",
      eyebrow: "Organic Response",
      title: "Organic Path",
      teaser: safeText(disease.treatment_organic),
      summary: safeText(disease.treatment_organic),
      tone: "accent",
      details: [
        { label: "Organic Treatment", value: safeText(disease.treatment_organic) },
        { label: "Prevention", value: safeText(disease.prevention_methods) },
        { label: "Conditions", value: safeText(disease.favorable_conditions) },
        { label: "Host", value: safeText(disease.affected_species) }
      ]
    },
    {
      key: "chemical",
      eyebrow: "Chemical Response",
      title: "Chemical Path",
      teaser: safeText(disease.treatment_chemical),
      summary: safeText(disease.treatment_chemical),
      tone: "danger",
      details: [
        { label: "Chemical Treatment", value: safeText(disease.treatment_chemical) },
        { label: "Treatment", value: safeText(disease.treatment_methods) },
        { label: "Recovery", value: safeText(disease.recovery_time) },
        { label: "Severity Score", value: scoreLabel(severityScore) }
      ]
    }
  ];

  return panels.map((panel) => ({
    ...panel,
    videoSrc
  }));
}

function buildPhotoSlides(sources: string[], title: string) {
  const resolvedSources = uniqueStrings(sources);

  return resolvedSources.map((src, index) => ({
    key: `photo-${index + 1}`,
    label: `Frame 0${index + 1}`,
    src,
    alt: `${title} reference frame ${index + 1}`
  }));
}

export default function ResultPage() {
  const router = useRouter();
  const params = useParams<{ type: string | string[]; name: string | string[] }>();
  const searchParams = useSearchParams();

  const routeType = typeof params.type === "string" ? params.type : params.type?.[0] ?? "";
  const routeName = typeof params.name === "string" ? params.name : params.name?.[0] ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plant, setPlant] = useState<PlantResultJson | null>(null);
  const [disease, setDisease] = useState<DiseaseData | null>(null);
  const [selectedPanelKey, setSelectedPanelKey] = useState("");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [useFallbackImage, setUseFallbackImage] = useState(false);

  const isDiseasePage = routeType === "disease";
  const diseaseFromQuery = searchParams.get("disease");
  const plantFromQuery = searchParams.get("plant");
  const relatedPlantName = plantFromQuery || disease?.primary_plant_name || disease?.related_plants?.[0] || "";

  useEffect(() => {
    const type = routeType;
    const name = decodeURIComponent(routeName);

    const fetchData = async () => {
      setLoading(true);
      setError("");
      setPlant(null);
      setDisease(null);
      setSelectedPanelKey("");
      setSelectedPhotoIndex(0);
      setUseFallbackImage(false);

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
          const diseaseResponse = await apiFetchJson<DiseaseData>(`/api/disease/${encodeURIComponent(diseaseFromQuery)}`);
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
  }, [diseaseFromQuery, routeName, routeType]);

  const averageRisk = useMemo(() => {
    if (!plant || !plant.disease_risk_levels.values.length) return 0;
    const total = plant.disease_risk_levels.values.reduce((sum, value) => sum + value, 0);
    return Math.round(total / plant.disease_risk_levels.values.length);
  }, [plant]);

  const infoPanels = useMemo(() => {
    if (plant) {
      return buildPlantPanels(plant, disease, averageRisk);
    }
    if (disease) {
      return buildDiseasePanels(disease, relatedPlantName);
    }
    return [];
  }, [averageRisk, disease, plant, relatedPlantName]);

  useEffect(() => {
    if (!selectedPanelKey) {
      return;
    }

    const hasSelected = infoPanels.some((panel) => panel.key === selectedPanelKey);
    if (!hasSelected) {
      setSelectedPanelKey("");
    }
  }, [infoPanels, selectedPanelKey]);

  const selectedPanel = infoPanels.find((panel) => panel.key === selectedPanelKey) || null;

  const title = plant?.common_name || disease?.disease_name || decodeURIComponent(routeName);
  const supportLine = plant ? plant.scientific_name : `Affected Species · ${safeText(disease?.affected_species)}`;
  const supportBadge = plant ? String(Math.max(0, Math.min(100, Math.round(plant.confidence_score)))) : "";
  const fallbackImage = isDiseasePage ? "/home/plant-2.jpg" : "/home/plant-1.jpg";
  const photoSources = useMemo(() => {
    if (useFallbackImage) {
      return [fallbackImage];
    }

    const primaryCandidate = plant?.image_url ? toAssetUrl(plant.image_url) : disease?.image_url ? toAssetUrl(disease.image_url) : "";
    const galleryImages = plant?.media?.gallery_images?.length
      ? plant.media.gallery_images.map((src) => toAssetUrl(src))
      : disease?.media?.gallery_images?.length
        ? disease.media.gallery_images.map((src) => toAssetUrl(src))
        : [];

    const merged = uniqueStrings([primaryCandidate, ...galleryImages]);
    return merged.length ? merged : [fallbackImage];
  }, [disease?.image_url, disease?.media?.gallery_images, fallbackImage, plant?.image_url, plant?.media?.gallery_images, useFallbackImage]);

  const photoSlides = useMemo(() => buildPhotoSlides(photoSources, title), [photoSources, title]);

  useEffect(() => {
    if (selectedPhotoIndex >= photoSlides.length) {
      setSelectedPhotoIndex(0);
    }
  }, [photoSlides.length, selectedPhotoIndex]);

  if (loading) {
    return (
      <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground">
        <div className="grid min-h-[60vh] place-items-center">
          <div className="scan-loader" />
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
    <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground xl:flex xl:h-full xl:flex-col xl:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 px-4 pb-2 pt-3 md:px-8 md:pb-3 md:pt-4 lg:px-10 xl:flex-1 xl:min-h-0 xl:px-12 xl:pb-1 xl:pt-4">
        <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-4 xl:h-full xl:min-h-0 xl:justify-center">
          <CenteredPageHero
            title={title.toUpperCase()}
            description={<span className="leading-none">{supportLine}</span>}
            badge={
              supportBadge ? (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[1rem] border border-zinc-900/10 bg-white/96 font-mono text-[10px] tracking-[0.12em] text-zinc-900 shadow-[0_6px_14px_rgba(24,24,27,0.04)]">
                  {supportBadge}
                </span>
              ) : undefined
            }
            titleClassName={`text-[clamp(4rem,10vw,8.6rem)] leading-[0.74] ${isDiseasePage ? "text-red-600" : "text-zinc-950"}`}
            descriptionClassName="mt-1"
            className="mt-4 xl:mt-4"
          />

          <div className={`grid min-h-0 gap-5 xl:h-[30rem] xl:min-h-0 xl:items-stretch 2xl:h-[32rem] ${selectedPanel ? "xl:grid-cols-12" : "xl:grid-cols-12"}`}>
            <section className={`min-h-0 ${selectedPanel ? "xl:col-span-12" : "xl:col-span-7"} xl:flex xl:h-full xl:min-h-0 xl:flex-col`}>
              {selectedPanel ? (
                <section className="animate-result-panel-expand flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-zinc-900/12 bg-white/92 p-3 shadow-[0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur-xl md:p-4 xl:p-3.5">
                  <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,0.82fr)_minmax(540px,1.18fr)]">
                    <div className="animate-result-panel-content flex min-h-0 flex-col xl:overflow-hidden">
                      <div className="flex shrink-0 items-start justify-start gap-4">
                        <button
                          type="button"
                          onClick={() => setSelectedPanelKey("")}
                          aria-label="Back to grid"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-900/12 bg-white text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
                        >
                          <ChevronLeft size={14} />
                        </button>
                      </div>

                      <div className="mt-3 flex min-h-0 flex-1 items-start overflow-y-auto pr-2">
                        <div className="flex w-full max-w-[31rem] flex-col items-start">
                          <h2 className="text-[clamp(1.7rem,2.4vw,2.35rem)] leading-[0.9] font-display font-semibold tracking-[-0.07em] text-zinc-950">
                            {selectedPanel.title}
                          </h2>
                          <p className="mt-3 text-sm leading-relaxed text-zinc-600 xl:text-[0.9rem]">{selectedPanel.summary}</p>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {selectedPanel.details.map((detail) => (
                              <article key={`${selectedPanel.key}-${detail.label}`} className="rounded-[22px] border border-zinc-900/10 bg-white px-4 py-3">
                                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{detail.label}</p>
                                <p className="mt-2 text-sm leading-relaxed text-zinc-800 xl:text-[0.84rem]">{detail.value}</p>
                              </article>
                            ))}
                          </div>

                          {selectedPanel.cta ? (
                            <button
                              type="button"
                              onClick={() => navigateWithFloraTransition(router, selectedPanel.cta!.href)}
                              className="group mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-zinc-900 bg-zinc-900 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black"
                            >
                              {selectedPanel.cta.label}
                              <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="animate-result-panel-content-delay flex min-h-[18rem] min-w-0 flex-col rounded-[28px] border border-zinc-900/12 bg-zinc-950 p-4 text-white shadow-[0_12px_24px_rgba(24,24,27,0.12)] xl:min-h-0 xl:p-4">
                      <div className="min-h-0 flex-1 overflow-hidden rounded-[22px] border border-white/10 bg-black">
                        <video
                          src={selectedPanel.videoSrc || "/placeholder.mp4"}
                          controls
                          playsInline
                          muted
                          loop
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="min-h-0 rounded-[30px] border border-zinc-900/12 bg-white/92 p-3 shadow-[0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur-xl md:p-4 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:p-2">
                  <div className="grid h-full min-h-0 auto-rows-fr gap-2.5 sm:grid-cols-2 xl:grid-cols-2 xl:grid-rows-5">
                    {infoPanels.map((panel) => {
                      const tone = panel.tone || "default";
                      const toneClasses =
                        tone === "danger"
                          ? "border-rose-200/80 bg-white text-zinc-900 hover:border-rose-300 hover:bg-rose-50/30"
                          : tone === "accent"
                            ? "border-emerald-200/80 bg-white text-zinc-900 hover:border-emerald-300 hover:bg-emerald-50/25"
                            : "border-zinc-900/12 bg-white text-zinc-900 hover:border-zinc-900/25 hover:bg-zinc-50/70";
                      return (
                        <button
                          key={panel.key}
                          type="button"
                          onClick={() => setSelectedPanelKey(panel.key)}
                          className={`flex h-full min-h-[8.4rem] flex-col rounded-[28px] border px-5 py-4 text-left shadow-[0_8px_20px_rgba(24,24,27,0.04)] transition-[transform,border-color,background-color,box-shadow] duration-150 active:scale-[0.985] xl:min-h-0 xl:px-3 xl:py-2.5 ${toneClasses}`}
                        >
                          <div className="flex items-start justify-end gap-4">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-900/10 bg-zinc-50 text-zinc-500">
                              <ArrowUpRight size={12} />
                            </span>
                          </div>

                          <div className="relative -top-2 flex min-h-0 w-full flex-1 flex-col items-start justify-center gap-1.5 pr-2 text-left">
                            <h2 className="text-[1.3rem] leading-[0.92] font-display font-semibold tracking-[-0.05em] md:text-[1.42rem] xl:text-[1.06rem]">
                              {panel.title}
                            </h2>
                            <p className="w-full text-[0.94rem] leading-[1.35] text-zinc-600 xl:text-[0.72rem] xl:leading-[1.22]">
                              {conciseText(panel.teaser, 78)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </section>

            {!selectedPanel ? (
              <aside className="min-h-0 xl:col-span-5 xl:flex xl:h-full xl:min-h-0 xl:flex-col">
                <article className="relative h-full min-h-[24rem] overflow-hidden rounded-[30px] border border-zinc-900/12 bg-zinc-950 text-white shadow-[0_18px_45px_rgba(24,24,27,0.12)] sm:min-h-[28rem] xl:min-h-0">
                  <img
                    src={photoSlides[selectedPhotoIndex].src}
                    alt={photoSlides[selectedPhotoIndex].alt}
                    loading="lazy"
                    onError={() => setUseFallbackImage(true)}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/22 to-black/20" />

                  <button
                    type="button"
                    onClick={() => setSelectedPhotoIndex((current) => (current - 1 + photoSlides.length) % photoSlides.length)}
                    className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center text-white/88 transition-[color,transform] hover:scale-110 hover:text-white"
                    aria-label="Show previous photo"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPhotoIndex((current) => (current + 1) % photoSlides.length)}
                    className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center text-white/88 transition-[color,transform] hover:scale-110 hover:text-white"
                    aria-label="Show next photo"
                  >
                    <ChevronRight size={20} />
                  </button>

                  <div className="relative flex h-full flex-col justify-end p-5 pb-8 md:p-6 md:pb-10 xl:p-2.5 xl:pb-5">
                    <div className="flex w-full flex-col items-center space-y-2.5">
                      <div className="flex items-center gap-2">
                        {photoSlides.map((slide, index) => (
                          <button
                            key={slide.key}
                            type="button"
                            onClick={() => setSelectedPhotoIndex(index)}
                            className={`h-1.5 rounded-full ${
                              index === selectedPhotoIndex ? "w-10 bg-white" : "w-4 bg-white/35 hover:bg-white/55"
                            }`}
                            aria-label={`Show ${slide.label}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              </aside>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
