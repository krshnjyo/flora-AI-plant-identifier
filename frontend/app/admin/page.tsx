/**
 * File: frontend/app/admin/page.tsx
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

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, apiFetchJson, getApiErrorMessage, toAssetUrl } from "@/lib/api-client";
import { useHomeLocked } from "@/lib/use-home-locked";

type Stats = {
  totalPlants: number;
  totalDiseases: number;
  totalScans: number;
  recentUploads: {
    scan_id: number;
    plant_name: string | null;
    disease_name: string | null;
    image_url: string | null;
    created_at: string;
  }[];
};

type User = {
  user_id: number;
  full_name: string;
  email: string;
  role: "user" | "admin";
  account_status: "active" | "inactive" | "suspended";
};

type PlantRecord = {
  plant_id: number;
  common_name: string;
  scientific_name: string;
  species: string;
};

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [deletePlantId, setDeletePlantId] = useState("");
  const [status, setStatus] = useState("");

  useHomeLocked();

  const loadAll = async () => {
    const me = await apiFetchJson<{ user: { role: "user" | "admin" } }>("/api/auth/me");
    if (!me.response.ok || !me.json?.success || me.json.data.user.role !== "admin") {
      setAuthorized(false);
      return;
    }

    setAuthorized(true);

    const [statsResponse, usersResponse, plantsResponse] = await Promise.all([
      apiFetchJson<Stats>("/api/admin/stats"),
      apiFetchJson<User[]>("/api/admin/users"),
      apiFetchJson<PlantRecord[]>("/api/plants")
    ]);

    if (statsResponse.response.ok && statsResponse.json?.success) {
      setStats(statsResponse.json.data);
    }

    if (usersResponse.response.ok && usersResponse.json?.success) {
      setUsers(usersResponse.json.data);
    }

    if (plantsResponse.response.ok && plantsResponse.json?.success && Array.isArray(plantsResponse.json.data)) {
      setPlants(
        plantsResponse.json.data.map((plant: PlantRecord) => ({
          plant_id: plant.plant_id,
          common_name: plant.common_name,
          scientific_name: plant.scientific_name,
          species: plant.species
        }))
      );
    }
  };

  useEffect(() => {
    loadAll().catch(() => {
      setAuthorized(false);
    });
  }, []);

  const summary = useMemo(
    () => ({
      plants: stats?.totalPlants ?? 0,
      diseases: stats?.totalDiseases ?? 0,
      scans: stats?.totalScans ?? 0
    }),
    [stats]
  );

  const selectedPlantForDelete = useMemo(() => {
    const id = Number(deletePlantId || 0);
    if (!id) return null;
    return plants.find((plant) => plant.plant_id === id) || null;
  }, [deletePlantId, plants]);

  const createPlant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");

    const formData = new FormData(event.currentTarget);
    const response = await apiFetch("/api/admin/plant", {
      method: "POST",
      body: formData
    });

    const data = await response.json().catch(() => null);
    setStatus(data?.success ? "Plant created" : data?.error?.message || "Plant creation failed");

    if (data?.success) {
      event.currentTarget.reset();
      await loadAll();
    }
  };

  const createDisease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");

    const formData = new FormData(event.currentTarget);
    const response = await apiFetch("/api/admin/disease", {
      method: "POST",
      body: formData
    });
    const data = await response.json().catch(() => null);

    setStatus(data?.success ? "Disease created" : data?.error?.message || "Disease creation failed");

    if (data?.success) {
      event.currentTarget.reset();
      await loadAll();
    }
  };

  const deletePlant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");

    const plantId = Number(deletePlantId || 0);
    if (!plantId) {
      setStatus("Plant ID is required");
      return;
    }

    const response = await apiFetch("/api/admin/plant", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plantId })
    });

    const data = await response.json().catch(() => null);
    setStatus(data?.success ? "Plant deleted" : data?.error?.message || "Plant delete failed");

    if (data?.success) {
      setDeletePlantId("");
      await loadAll();
    }
  };

  const deleteDisease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");

    const formData = new FormData(event.currentTarget);
    const diseaseId = Number(formData.get("diseaseId") || 0);
    if (!diseaseId) {
      setStatus("Disease ID is required");
      return;
    }

    const payload = {
      diseaseId,
      jsonFile: String(formData.get("diseaseJsonFile") || "").trim(),
      deleteJsonFile: String(formData.get("deleteDiseaseJson") || "") === "on"
    };

    const { response, json } = await apiFetchJson<{ message: string }>("/api/admin/disease", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setStatus(response.ok && json?.success ? "Disease deleted" : getApiErrorMessage(json, "Disease delete failed"));

    if (response.ok && json?.success) {
      event.currentTarget.reset();
      await loadAll();
    }
  };

  const syncCatalog = async () => {
    setStatus("Syncing JSON catalog to database...");
    const { response, json } = await apiFetchJson<{ message: string; output?: string }>("/api/admin/sync-catalog", {
      method: "POST"
    });

    if (response.ok && json?.success) {
      const output = json.data.output ? `\n${json.data.output}` : "";
      setStatus(`Catalog sync completed.${output}`);
      await loadAll();
      return;
    }

    setStatus(getApiErrorMessage(json, "Catalog sync failed"));
  };

  const linkPlantDisease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      plantId: Number(formData.get("relationPlantId") || 0),
      diseaseId: Number(formData.get("relationDiseaseId") || 0),
      relationType: String(formData.get("relationType") || "common")
    };

    if (!payload.plantId || !payload.diseaseId) {
      setStatus("Plant ID and Disease ID are required for linking");
      return;
    }

    const { response, json } = await apiFetchJson<{ message: string }>("/api/admin/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setStatus(response.ok && json?.success ? "Plant-disease link saved" : getApiErrorMessage(json, "Link save failed"));
  };

  const unlinkPlantDisease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      plantId: Number(formData.get("unlinkPlantId") || 0),
      diseaseId: Number(formData.get("unlinkDiseaseId") || 0)
    };

    if (!payload.plantId || !payload.diseaseId) {
      setStatus("Plant ID and Disease ID are required for unlink");
      return;
    }

    const { response, json } = await apiFetchJson<{ message: string }>("/api/admin/relations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setStatus(response.ok && json?.success ? "Plant-disease link removed" : getApiErrorMessage(json, "Link delete failed"));
  };

  const updateUser = async (userId: number, patch: { role?: "user" | "admin"; accountStatus?: "active" | "inactive" | "suspended" }) => {
    const { response, json } = await apiFetchJson<{ message: string }>("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        role: patch.role,
        accountStatus: patch.accountStatus
      })
    });

    setStatus(response.ok && json?.success ? "User updated" : getApiErrorMessage(json, "User update failed"));

    if (response.ok && json?.success) {
      await loadAll();
    }
  };

  if (authorized === null) {
    return (
      <main className="relative isolate h-full min-h-0 overflow-x-hidden overflow-y-auto xl:overflow-hidden bg-transparent text-foreground">
        <div className="grid h-full place-items-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Verifying Clearance...</p>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="relative isolate h-full min-h-0 overflow-x-hidden overflow-y-auto xl:overflow-hidden bg-transparent text-foreground">
        <div className="grid h-full place-items-center px-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">Access Denied</p>
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
            transition={{ duration: 0.4 }}
            className="flex min-h-0 flex-col overflow-hidden p-2 xl:col-span-4 xl:p-3"
          >
            <header>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">System Control Surface</p>
              <h1 className="mt-2 text-[clamp(3.4rem,7.2vw,6.6rem)] leading-[0.84] font-display font-bold tracking-[-0.08em]">ADMIN</h1>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 md:text-base">
                Manage species records, disease profiles, scan telemetry, and user permissions.
              </p>
            </header>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-900/14 pt-4 sm:grid-cols-3">
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Specimens</p>
                <p className="mt-1 text-3xl font-semibold text-zinc-900">{summary.plants}</p>
              </article>
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Pathologies</p>
                <p className="mt-1 text-3xl font-semibold text-zinc-900">{summary.diseases}</p>
              </article>
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Scans</p>
                <p className="mt-1 text-3xl font-semibold text-zinc-900">{summary.scans}</p>
              </article>
            </div>

            <div className="mt-5 border-t border-zinc-900/14 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Mode</p>
              <p className="mt-2 text-sm text-zinc-600">Administrator privileges active. Scroll inside the detail surface to review all modules.</p>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06 }}
            className="min-h-0 rounded-[28px] border border-zinc-900/12 bg-white/90 p-5 shadow-[0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur-xl xl:col-span-8 xl:p-6"
          >
            <div className="flex h-auto min-h-0 flex-col xl:h-full">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Admin Modules</p>
                <p className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400 sm:block">Structured Detail Cards</p>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-6 pb-2">
                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Register Specimen</p>
                    <form className="mt-3 grid gap-3 border-t border-zinc-900/14 pt-3 md:grid-cols-2" onSubmit={createPlant}>
                      <Input name="commonName" placeholder="Common name" required className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900" />
                      <Input name="scientificName" placeholder="Scientific name" required className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900" />
                      <Input name="species" placeholder="Species" required className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900" />
                      <Input
                        name="confidenceScore"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        placeholder="Confidence score"
                        required
                        className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900"
                      />

                      <div className="md:col-span-2">
                        <Label htmlFor="jsonFileUpload" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                          JSON Data Source
                        </Label>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input id="jsonFileUpload" name="jsonFileUpload" type="file" accept="application/json,.json" className="h-10 bg-white/90" />
                          <Input
                            id="jsonFilePath"
                            name="jsonFile"
                            placeholder="or enter existing JSON path"
                            className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900"
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <Label htmlFor="plantImageUpload" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                          Plant Image (Optional)
                        </Label>
                        <Input
                          id="plantImageUpload"
                          name="plantImageUpload"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/jpg"
                          className="h-10 bg-white/90"
                        />
                        <p className="mt-2 text-xs text-zinc-500">Upload JSON + image together to auto-save image and patch JSON image_url.</p>
                      </div>

                      <button
                        type="submit"
                        className="md:col-span-2 inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black"
                      >
                        Add Plant (JSON + Image)
                      </button>
                    </form>

                    <form className="mt-4 grid gap-3 border-t border-zinc-900/14 pt-3 md:grid-cols-[1fr_auto]" onSubmit={deletePlant}>
                      <Input
                        name="plantId"
                        type="number"
                        min={1}
                        placeholder="Plant ID to delete"
                        required
                        value={deletePlantId}
                        onChange={(event) => setDeletePlantId(event.target.value)}
                        className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center justify-center rounded-full border border-red-600 px-5 font-mono text-xs uppercase tracking-[0.16em] text-red-600 transition-colors hover:bg-red-600 hover:text-white"
                      >
                        Delete Plant
                      </button>
                      <p className="md:col-span-2 text-xs text-zinc-600">
                        {selectedPlantForDelete
                          ? `Selected: ${selectedPlantForDelete.common_name} (${selectedPlantForDelete.scientific_name})`
                          : deletePlantId
                            ? "No plant found for this ID."
                            : "Enter a Plant ID to preview the plant name before delete."}
                      </p>
                    </form>
                  </article>

                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Register Pathology</p>
                    <form className="mt-3 grid gap-3 border-t border-zinc-900/14 pt-3 md:grid-cols-2" onSubmit={createDisease}>
                      <Input name="diseaseName" placeholder="Disease name" required className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900" />
                      <Input name="affectedSpecies" placeholder="Affected species" className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900" />
                      <Input name="primaryPlantId" type="number" min={1} placeholder="Optional primary plant ID" className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900 md:col-span-2" />
                      <div className="md:col-span-2">
                        <Label htmlFor="diseaseJsonUpload" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                          Disease JSON Source
                        </Label>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input id="diseaseJsonUpload" name="jsonFileUpload" type="file" accept="application/json,.json" className="h-10 bg-white/90" />
                          <Input
                            id="diseaseJsonPath"
                            name="jsonFile"
                            placeholder="or enter existing disease JSON path"
                            className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900"
                          />
                        </div>
                      </div>
                      <Textarea name="diseaseDescription" placeholder="Description" required className="min-h-[58px] border-zinc-300 bg-white/90 focus:border-zinc-900" />
                      <Textarea name="symptoms" placeholder="Symptoms" required className="min-h-[58px] border-zinc-300 bg-white/90 focus:border-zinc-900" />
                      <Textarea name="causes" placeholder="Causes" required className="min-h-[58px] border-zinc-300 bg-white/90 focus:border-zinc-900" />
                      <Textarea
                        name="preventionMethods"
                        placeholder="Prevention methods"
                        required
                        className="min-h-[58px] border-zinc-300 bg-white/90 focus:border-zinc-900"
                      />
                      <Textarea
                        name="treatmentMethods"
                        placeholder="Treatment methods"
                        required
                        className="min-h-[58px] border-zinc-300 bg-white/90 focus:border-zinc-900"
                      />
                      <Input name="severityLevel" placeholder="Severity level (High/Med/Low)" required className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900" />

                      <button
                        type="submit"
                        className="md:col-span-2 inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black"
                      >
                        Create Disease Entry
                      </button>
                    </form>

                    <form className="mt-4 grid gap-3 border-t border-zinc-900/14 pt-3 md:grid-cols-[1fr_auto]" onSubmit={deleteDisease}>
                      <Input
                        name="diseaseId"
                        type="number"
                        min={1}
                        placeholder="Disease ID to delete"
                        required
                        className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900"
                      />
                      <Input
                        name="diseaseJsonFile"
                        placeholder="Optional disease JSON path for file delete"
                        className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900 md:col-span-2"
                      />
                      <label className="md:col-span-2 inline-flex items-center gap-2 text-xs text-zinc-600">
                        <input type="checkbox" name="deleteDiseaseJson" aria-label="Delete disease JSON file" className="h-4 w-4" />
                        Also delete the JSON file path above
                      </label>
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center justify-center rounded-full border border-red-600 px-5 font-mono text-xs uppercase tracking-[0.16em] text-red-600 transition-colors hover:bg-red-600 hover:text-white"
                      >
                        Delete Disease
                      </button>
                    </form>
                  </article>

                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Catalog Sync & Relations</p>
                      <button
                        type="button"
                        onClick={syncCatalog}
                        className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition-colors hover:bg-black"
                      >
                        Sync JSON To DB
                      </button>
                    </div>

                    <div className="mt-3 grid gap-4 border-t border-zinc-900/14 pt-3 md:grid-cols-2">
                      <form className="grid gap-3" onSubmit={linkPlantDisease}>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Link Plant + Disease</p>
                        <Input
                          name="relationPlantId"
                          type="number"
                          min={1}
                          placeholder="Plant ID"
                          required
                          className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900"
                        />
                        <Input
                          name="relationDiseaseId"
                          type="number"
                          min={1}
                          placeholder="Disease ID"
                          required
                          className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900"
                        />
                        <select
                          name="relationType"
                          defaultValue="common"
                          aria-label="Relation type"
                          className="h-10 rounded-md border border-zinc-300 bg-white/90 px-3 text-xs font-mono uppercase tracking-[0.12em] text-zinc-700 focus:border-zinc-900 focus:outline-none"
                        >
                          <option value="common">Common</option>
                          <option value="primary">Primary</option>
                          <option value="possible">Possible</option>
                        </select>
                        <button
                          type="submit"
                          className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white"
                        >
                          Save Link
                        </button>
                      </form>

                      <form className="grid gap-3" onSubmit={unlinkPlantDisease}>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Unlink Plant + Disease</p>
                        <Input
                          name="unlinkPlantId"
                          type="number"
                          min={1}
                          placeholder="Plant ID"
                          required
                          className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900"
                        />
                        <Input
                          name="unlinkDiseaseId"
                          type="number"
                          min={1}
                          placeholder="Disease ID"
                          required
                          className="h-10 border-zinc-300 bg-white/90 focus:border-zinc-900"
                        />
                        <button
                          type="submit"
                          className="inline-flex h-10 items-center justify-center rounded-full border border-red-600 px-5 font-mono text-xs uppercase tracking-[0.16em] text-red-600 transition-colors hover:bg-red-600 hover:text-white"
                        >
                          Remove Link
                        </button>
                      </form>
                    </div>
                  </article>

                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Recent Scans</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Latest 20</p>
                    </div>
                    <div className="mt-3 border-t border-zinc-900/14 pt-3">
                      {stats && stats.recentUploads.length > 0 ? (
                        <div className="w-full overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-zinc-900/10">
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Plant</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Pathology</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Visual</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Timestamp</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {stats.recentUploads.map((upload) => (
                                <TableRow key={upload.scan_id} className="border-zinc-900/10">
                                  <TableCell className="font-medium text-zinc-800">{upload.plant_name || "-"}</TableCell>
                                  <TableCell className={upload.disease_name ? "text-red-600" : "text-zinc-500"}>
                                    {upload.disease_name || "Healthy"}
                                  </TableCell>
                                  <TableCell>
                                    {upload.image_url ? (
                                      <Image
                                        src={toAssetUrl(upload.image_url)}
                                        alt="Scan thumbnail"
                                        width={44}
                                        height={44}
                                        className="h-11 w-11 rounded-md border border-zinc-200 object-cover"
                                        sizes="44px"
                                      />
                                    ) : (
                                      "-"
                                    )}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-zinc-500">{new Date(upload.created_at).toLocaleString()}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500">No recent scans available.</p>
                      )}
                    </div>
                  </article>

                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">User Database</p>
                    <div className="mt-3 border-t border-zinc-900/14 pt-3">
                      <div className="w-full overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-zinc-900/10">
                              <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Name</TableHead>
                              <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Email</TableHead>
                              <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Role</TableHead>
                              <TableHead className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {users.map((user) => (
                              <TableRow key={user.user_id} className="border-zinc-900/10">
                                <TableCell className="font-medium text-zinc-800">{user.full_name}</TableCell>
                                <TableCell className="text-zinc-500">{user.email}</TableCell>
                                <TableCell>
                                  <select
                                    defaultValue={user.role}
                                    aria-label={`Role for ${user.full_name}`}
                                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-mono uppercase focus:border-zinc-900 focus:outline-none"
                                    onChange={(event) => {
                                      updateUser(user.user_id, { role: event.target.value as "user" | "admin" });
                                    }}
                                  >
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                </TableCell>
                                <TableCell>
                                  <select
                                    defaultValue={user.account_status}
                                    aria-label={`Account status for ${user.full_name}`}
                                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-mono uppercase focus:border-zinc-900 focus:outline-none"
                                    onChange={(event) => {
                                      updateUser(user.user_id, {
                                        accountStatus: event.target.value as "active" | "inactive" | "suspended"
                                      });
                                    }}
                                  >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="suspended">Suspended</option>
                                  </select>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </motion.aside>
        </div>

        {status && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
            aria-live="polite"
            className="fixed bottom-5 right-5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-mono uppercase tracking-[0.14em] text-white"
          >
            {status}
          </motion.div>
        )}
      </section>
    </main>
  );
}
