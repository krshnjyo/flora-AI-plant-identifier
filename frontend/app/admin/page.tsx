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

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { CenteredPageHero } from "@/components/layout/showcase-shell";
import { WorkspaceExpander } from "@/components/layout/workspace-expander";
import { type WorkspaceButtonTone } from "@/components/layout/workspace-button";
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

type PaginatedUsersResponse = {
  items: User[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

type AdminPanelKey = "plants" | "diseases" | "relations" | "sync" | "uploads" | "users";

const USERS_PAGE_SIZE = 12;

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersMeta, setUsersMeta] = useState({
    page: 1,
    limit: USERS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasMore: false
  });
  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [deletePlantId, setDeletePlantId] = useState("");
  const [status, setStatus] = useState("");
  const [selectedPanelKey, setSelectedPanelKey] = useState<AdminPanelKey | "">("");

  useHomeLocked();

  /**
   * Refresh all admin-facing datasets.
   *
   * Notes:
   * - Authorization is checked first so we do not fetch admin payloads for
   *   non-admin users.
   * - Downstream requests are intentionally isolated with `allSettled()` so a
   *   single transient failure does not flip the whole page into an
   *   unauthorized state after auth already succeeded.
   */
  const loadAll = useCallback(async (requestedUsersPage = usersPage) => {
    const me = await apiFetchJson<{ user: { role: "user" | "admin" } }>("/api/auth/me");
    if (!me.response.ok || !me.json?.success || me.json.data.user.role !== "admin") {
      setAuthorized(false);
      return;
    }

    setAuthorized(true);

    const [statsResponse, usersResponse, plantsResponse] = await Promise.allSettled([
      apiFetchJson<Stats>("/api/admin/stats"),
      apiFetchJson<PaginatedUsersResponse>(`/api/admin/users?page=${requestedUsersPage}&limit=${USERS_PAGE_SIZE}`),
      apiFetchJson<PlantRecord[]>("/api/plants")
    ]);

    if (statsResponse.status === "fulfilled" && statsResponse.value.response.ok && statsResponse.value.json?.success) {
      setStats(statsResponse.value.json.data);
    }

    if (usersResponse.status === "fulfilled" && usersResponse.value.response.ok && usersResponse.value.json?.success) {
      const nextUsers = usersResponse.value.json.data;
      if (requestedUsersPage > nextUsers.totalPages && nextUsers.totalPages > 0) {
        setUsersPage(nextUsers.totalPages);
      } else {
        setUsers(nextUsers.items);
        setUsersMeta({
          page: nextUsers.page,
          limit: nextUsers.limit,
          total: nextUsers.total,
          totalPages: nextUsers.totalPages,
          hasMore: nextUsers.hasMore
        });
      }
    }

    if (
      plantsResponse.status === "fulfilled" &&
      plantsResponse.value.response.ok &&
      plantsResponse.value.json?.success &&
      Array.isArray(plantsResponse.value.json.data)
    ) {
      setPlants(
        plantsResponse.value.json.data.map((plant: PlantRecord) => ({
          plant_id: plant.plant_id,
          common_name: plant.common_name,
          scientific_name: plant.scientific_name,
          species: plant.species
        }))
      );
    }
  }, [usersPage]);

  useEffect(() => {
    loadAll().catch(() => {
      setAuthorized(false);
    });
  }, [loadAll]);

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
  const panelButtons: Array<{
    key: AdminPanelKey;
    label: string;
    title: string;
    description: string;
    tone?: WorkspaceButtonTone;
  }> = [
    {
      key: "plants",
      label: "Catalog",
      title: "Plant Records",
      description: `${summary.plants} specimen entries in the active catalog.`
    },
    {
      key: "diseases",
      label: "Pathology",
      title: "Disease Records",
      description: `${summary.diseases} disease entries available for routing.`,
      tone: "danger"
    },
    {
      key: "relations",
      label: "Relations",
      title: "Plant + Disease Links",
      description: "Create or remove record pairings used by the result layer."
    },
    {
      key: "sync",
      label: "Sync",
      title: "Catalog Sync",
      description: "Push JSON catalog changes into the database state."
    },
    {
      key: "uploads",
      label: "Telemetry",
      title: "Recent Uploads",
      description: `${stats?.recentUploads.length || 0} recent scan events in the admin feed.`,
      tone: "accent"
    },
    {
      key: "users",
      label: "Access",
      title: "User Controls",
      description: `${usersMeta.total} user accounts with editable roles and status.`
    }
  ];

  const renderAdminPanel = () => {
    switch (selectedPanelKey || "plants") {
      case "plants":
        return (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
            <form className="grid gap-3 md:grid-cols-2" onSubmit={createPlant}>
              <Input name="commonName" placeholder="Common name" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Input name="scientificName" placeholder="Scientific name" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Input name="species" placeholder="Species" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Input
                name="confidenceScore"
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="Confidence score"
                required
                className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900"
              />
              <div className="md:col-span-2">
                <Label htmlFor="jsonFileUpload" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  JSON Data Source
                </Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input id="jsonFileUpload" name="jsonFileUpload" type="file" accept="application/json,.json" className="h-11 rounded-2xl bg-white/90" />
                  <Input
                    id="jsonFilePath"
                    name="jsonFile"
                    placeholder="Existing JSON path"
                    className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900"
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
                  className="h-11 rounded-2xl bg-white/90"
                />
              </div>
              <button
                type="submit"
                className="md:col-span-2 inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black"
              >
                Add Plant
              </button>
            </form>

            <div className="space-y-4">
              <form className="grid gap-3" onSubmit={deletePlant}>
                <Input
                  name="plantId"
                  type="number"
                  min={1}
                  placeholder="Plant ID to delete"
                  required
                  value={deletePlantId}
                  onChange={(event) => setDeletePlantId(event.target.value)}
                  className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900"
                />
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-red-600 px-5 font-mono text-xs uppercase tracking-[0.16em] text-red-600 transition-colors hover:bg-red-600 hover:text-white"
                >
                  Delete Plant
                </button>
              </form>
              <article className="rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Delete Preview</p>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                  {selectedPlantForDelete
                    ? `Selected: ${selectedPlantForDelete.common_name} (${selectedPlantForDelete.scientific_name})`
                    : deletePlantId
                      ? "No plant found for this ID."
                      : "Enter a plant ID to preview the record before deleting."}
                </p>
              </article>
            </div>
          </div>
        );
      case "diseases":
        return (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(18rem,0.92fr)]">
            <form className="grid gap-3 md:grid-cols-2" onSubmit={createDisease}>
              <Input name="diseaseName" placeholder="Disease name" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Input name="affectedSpecies" placeholder="Affected species" className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Input name="primaryPlantId" type="number" min={1} placeholder="Optional primary plant ID" className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900 md:col-span-2" />
              <div className="md:col-span-2">
                <Label htmlFor="diseaseJsonUpload" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Disease JSON Source
                </Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input id="diseaseJsonUpload" name="jsonFileUpload" type="file" accept="application/json,.json" className="h-11 rounded-2xl bg-white/90" />
                  <Input
                    id="diseaseJsonPath"
                    name="jsonFile"
                    placeholder="Existing disease JSON path"
                    className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900"
                  />
                </div>
              </div>
              <Textarea name="diseaseDescription" placeholder="Description" required className="min-h-[68px] rounded-[22px] border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Textarea name="symptoms" placeholder="Symptoms" required className="min-h-[68px] rounded-[22px] border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Textarea name="causes" placeholder="Causes" required className="min-h-[68px] rounded-[22px] border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Textarea name="preventionMethods" placeholder="Prevention methods" required className="min-h-[68px] rounded-[22px] border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Textarea name="treatmentMethods" placeholder="Treatment methods" required className="min-h-[68px] rounded-[22px] border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Input name="severityLevel" placeholder="Severity level" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <button
                type="submit"
                className="md:col-span-2 inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black"
              >
                Create Disease Entry
              </button>
            </form>

            <form className="grid gap-3" onSubmit={deleteDisease}>
              <Input name="diseaseId" type="number" min={1} placeholder="Disease ID to delete" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Input
                name="diseaseJsonFile"
                placeholder="Optional disease JSON path"
                className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900"
              />
              <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
                <input type="checkbox" name="deleteDiseaseJson" aria-label="Delete disease JSON file" className="h-4 w-4" />
                Also delete the JSON file path above
              </label>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full border border-red-600 px-5 font-mono text-xs uppercase tracking-[0.16em] text-red-600 transition-colors hover:bg-red-600 hover:text-white"
              >
                Delete Disease
              </button>
            </form>
          </div>
        );
      case "relations":
        return (
          <div className="grid gap-5 xl:grid-cols-2">
            <form className="grid gap-3" onSubmit={linkPlantDisease}>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Link Plant + Disease</p>
              <Input name="relationPlantId" type="number" min={1} placeholder="Plant ID" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Input name="relationDiseaseId" type="number" min={1} placeholder="Disease ID" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <select
                name="relationType"
                defaultValue="common"
                aria-label="Relation type"
                className="h-11 rounded-2xl border border-zinc-300 bg-white/90 px-3 text-xs font-mono uppercase tracking-[0.12em] text-zinc-700 focus:border-zinc-900 focus:outline-none"
              >
                <option value="common">Common</option>
                <option value="primary">Primary</option>
                <option value="possible">Possible</option>
              </select>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white"
              >
                Save Link
              </button>
            </form>

            <form className="grid gap-3" onSubmit={unlinkPlantDisease}>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Unlink Plant + Disease</p>
              <Input name="unlinkPlantId" type="number" min={1} placeholder="Plant ID" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <Input name="unlinkDiseaseId" type="number" min={1} placeholder="Disease ID" required className="h-11 rounded-2xl border-zinc-300 bg-white/90 focus:border-zinc-900" />
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full border border-red-600 px-5 font-mono text-xs uppercase tracking-[0.16em] text-red-600 transition-colors hover:bg-red-600 hover:text-white"
              >
                Remove Link
              </button>
            </form>
          </div>
        );
      case "sync":
        return (
          <div className="mx-auto flex h-full w-full max-w-[32rem] flex-col justify-center">
            <article className="rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Catalog Sync</p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                Push JSON catalog changes into the database and refresh admin counts, recent uploads, and record surfaces.
              </p>
              <button
                type="button"
                onClick={syncCatalog}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black"
              >
                Sync JSON To DB
              </button>
            </article>
          </div>
        );
      case "uploads":
        return stats && stats.recentUploads.length > 0 ? (
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
                    <TableCell className={upload.disease_name ? "text-red-600" : "text-zinc-500"}>{upload.disease_name || "Healthy"}</TableCell>
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
          <div className="rounded-[24px] border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-5 text-sm leading-relaxed text-zinc-500">
            No recent scans available.
          </div>
        );
      case "users":
        return (
          <div>
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
                          value={user.role}
                          aria-label={`Role for ${user.full_name}`}
                          className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-xs font-mono uppercase focus:border-zinc-900 focus:outline-none"
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
                          value={user.account_status}
                          aria-label={`Account status for ${user.full_name}`}
                          className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-xs font-mono uppercase focus:border-zinc-900 focus:outline-none"
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
            {usersMeta.totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setUsersPage((previous) => Math.max(previous - 1, 1))}
                  disabled={usersMeta.page <= 1}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-900/12 bg-white px-4 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Previous
                </button>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Page {usersMeta.page} of {usersMeta.totalPages}
                </p>
                <button
                  type="button"
                  onClick={() => setUsersPage((previous) => Math.min(previous + 1, usersMeta.totalPages))}
                  disabled={!usersMeta.hasMore}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-900/12 bg-white px-4 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        );
    }
  };

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
      <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground">
        <div className="grid min-h-[60vh] place-items-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Verifying Clearance...</p>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground">
        <div className="grid min-h-[60vh] place-items-center px-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">Access Denied</p>
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
            title="ADMIN"
            description="Manage catalog records, relations, telemetry, and user permissions from one control workspace."
            titleClassName="text-[clamp(4rem,10vw,8.6rem)] leading-[0.74]"
            descriptionClassName="mt-1 max-w-[56rem]"
            className="mt-4 xl:mt-4"
          />

          <WorkspaceExpander
            panelButtons={panelButtons}
            selectedPanelKey={selectedPanelKey}
            onSelectPanel={setSelectedPanelKey}
            onBackToGrid={() => setSelectedPanelKey("")}
            renderExpandedPanel={renderAdminPanel}
            sideRail={
              <motion.aside
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex h-full min-h-0 flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">System Snapshot</p>
                  <span className="inline-flex items-center rounded-full border border-zinc-900/12 bg-zinc-50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-700">
                    Admin Active
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  <article className="rounded-[22px] border border-zinc-900/10 bg-zinc-50/85 px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Specimens</p>
                    <p className="mt-2 text-[2rem] font-semibold leading-none text-zinc-950">{summary.plants}</p>
                  </article>
                  <article className="rounded-[22px] border border-zinc-900/10 bg-zinc-50/85 px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Pathologies</p>
                    <p className="mt-2 text-[2rem] font-semibold leading-none text-zinc-950">{summary.diseases}</p>
                  </article>
                  <article className="rounded-[22px] border border-zinc-900/10 bg-zinc-50/85 px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Scans</p>
                    <p className="mt-2 text-[2rem] font-semibold leading-none text-zinc-950">{summary.scans}</p>
                  </article>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                  <article className="flex min-h-[13rem] min-w-0 flex-1 flex-col rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Recent Uploads</p>
                    <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {stats?.recentUploads?.slice(0, 4).length ? (
                        stats.recentUploads.slice(0, 4).map((upload) => (
                          <div key={upload.scan_id} className="flex items-center gap-3 rounded-[18px] border border-zinc-900/10 bg-white px-3 py-2.5">
                            {upload.image_url ? (
                              <Image
                                src={toAssetUrl(upload.image_url)}
                                alt="Scan thumbnail"
                                width={42}
                                height={42}
                                className="h-10 w-10 rounded-xl object-cover"
                                sizes="42px"
                              />
                            ) : (
                              <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-[10px] font-mono uppercase text-zinc-400">
                                N/A
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-zinc-900">{upload.plant_name || "Unknown specimen"}</p>
                              <p className="truncate text-xs text-zinc-500">{upload.disease_name || "Healthy"}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-zinc-500">No recent uploads yet.</p>
                      )}
                    </div>
                  </article>

                  <article className="shrink-0 rounded-[24px] border border-zinc-900/10 bg-zinc-50/85 px-4 py-4 text-sm leading-relaxed text-zinc-600">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Mode</p>
                    <p className="mt-3">Administrator privileges are active. Catalog creation, deletion, sync, relations, upload review, and user access controls remain available.</p>
                  </article>
                </div>
              </motion.aside>
            }
          />
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
