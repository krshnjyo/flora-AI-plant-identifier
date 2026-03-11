/**
 * File: frontend/app/settings/page.tsx
 * Purpose: User/admin account management settings page.
 */

"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Camera, Save, ShieldCheck } from "lucide-react";
import { apiFetch, apiFetchJson, getApiErrorMessage, toAssetUrl } from "@/lib/api-client";
import { useHomeLocked } from "@/lib/use-home-locked";

type OutputMode = "smart" | "species" | "disease";

type SettingsPreferences = {
  defaultOutput: OutputMode;
  scanNotifications: boolean;
  emailNotifications: boolean;
  loginAlerts: boolean;
  twoFactorEnabled: boolean;
  allowModelFallback: boolean;
  auditRetentionDays: 30 | 90 | 365;
  incidentAlerts: boolean;
};

type ProfilePayload = {
  userId: number;
  fullName: string;
  email: string;
  role: "user" | "admin";
  accountStatus: "active" | "inactive" | "suspended";
  createdAt: string;
  bio: string;
  avatarUrl: string;
  preferences?: Partial<SettingsPreferences>;
};

const LOCAL_PREF_KEY = "flora-settings-v1";

const defaultPreferences: SettingsPreferences = {
  defaultOutput: "smart",
  scanNotifications: true,
  emailNotifications: true,
  loginAlerts: true,
  twoFactorEnabled: false,
  allowModelFallback: true,
  auditRetentionDays: 90,
  incidentAlerts: true
};

function normalizePreferences(source?: Partial<SettingsPreferences>): SettingsPreferences {
  const next = source || {};
  const auditRetention = next.auditRetentionDays;

  return {
    defaultOutput:
      next.defaultOutput === "species" || next.defaultOutput === "disease" || next.defaultOutput === "smart"
        ? next.defaultOutput
        : defaultPreferences.defaultOutput,
    scanNotifications: typeof next.scanNotifications === "boolean" ? next.scanNotifications : defaultPreferences.scanNotifications,
    emailNotifications: typeof next.emailNotifications === "boolean" ? next.emailNotifications : defaultPreferences.emailNotifications,
    loginAlerts: typeof next.loginAlerts === "boolean" ? next.loginAlerts : defaultPreferences.loginAlerts,
    twoFactorEnabled: typeof next.twoFactorEnabled === "boolean" ? next.twoFactorEnabled : defaultPreferences.twoFactorEnabled,
    allowModelFallback: typeof next.allowModelFallback === "boolean" ? next.allowModelFallback : defaultPreferences.allowModelFallback,
    auditRetentionDays: auditRetention === 30 || auditRetention === 365 ? auditRetention : 90,
    incidentAlerts: typeof next.incidentAlerts === "boolean" ? next.incidentAlerts : defaultPreferences.incidentAlerts
  };
}

function readStoredDefaultOutput(): OutputMode | null {
  try {
    const raw = localStorage.getItem(LOCAL_PREF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { defaultOutput?: OutputMode };
    if (parsed.defaultOutput === "smart" || parsed.defaultOutput === "species" || parsed.defaultOutput === "disease") {
      return parsed.defaultOutput;
    }
  } catch {
    // Ignore invalid local setting values.
  }

  return null;
}

function ToggleControl({ checked, onClick, disabled }: { checked: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={checked}
      className={`relative h-7 w-12 rounded-full border transition-colors ${
        checked ? "border-zinc-900 bg-zinc-900" : "border-zinc-300 bg-white"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full transition-all ${checked ? "left-6 bg-white" : "left-1 bg-zinc-900"}`} />
    </button>
  );
}

function PreferenceRow({
  label,
  description,
  control
}: {
  label: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-zinc-900/12 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <p className="text-sm font-semibold text-zinc-900">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export default function SettingsPage() {
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [status, setStatus] = useState("");
  const [avatarFileName, setAvatarFileName] = useState("");

  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [preferences, setPreferences] = useState<SettingsPreferences>(defaultPreferences);

  useHomeLocked();

  useEffect(() => {
    localStorage.setItem(LOCAL_PREF_KEY, JSON.stringify({ defaultOutput: preferences.defaultOutput }));
  }, [preferences.defaultOutput]);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setStatus("");

      try {
        const localDefault = readStoredDefaultOutput();
        const { response, json } = await apiFetchJson<ProfilePayload>("/api/account/profile");

        if (!response.ok || !json?.success) {
          setStatus(getApiErrorMessage(json, "Failed to load account settings"));
          return;
        }

        const nextProfile = json.data;
        setProfile(nextProfile);
        setFullName(nextProfile.fullName);
        setEmail(nextProfile.email);
        setBio(nextProfile.bio || "");
        setPreferences(
          normalizePreferences({
            defaultOutput: localDefault || undefined,
            ...(nextProfile.preferences || {})
          })
        );
      } catch {
        setStatus("Failed to load account settings");
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, []);

  const avatarSrc = useMemo(() => toAssetUrl(profile?.avatarUrl || ""), [profile?.avatarUrl]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;

    setSavingProfile(true);
    setStatus("");
    try {
      const payload = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        bio: bio.trim()
      };

      const { response, json } = await apiFetchJson<ProfilePayload>("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok || !json?.success) {
        setStatus(getApiErrorMessage(json, "Profile update failed"));
        return;
      }

      setProfile(json.data);
      setFullName(json.data.fullName);
      setEmail(json.data.email);
      setBio(json.data.bio || "");
      setStatus("Profile updated");
    } catch {
      setStatus("Profile update failed");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingPassword(true);
    setStatus("");

    try {
      if (newPassword !== confirmPassword) {
        setStatus("New password and confirm password do not match");
        return;
      }

      const { response, json } = await apiFetchJson<{ message: string }>("/api/account/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      if (!response.ok || !json?.success) {
        setStatus(getApiErrorMessage(json, "Password update failed"));
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus("Password updated");
    } catch {
      setStatus("Password update failed");
    } finally {
      setSavingPassword(false);
    }
  };

  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingPreferences(true);
    setStatus("");

    try {
      const { response, json } = await apiFetchJson<ProfilePayload>("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences })
      });

      if (!response.ok || !json?.success) {
        setStatus(getApiErrorMessage(json, "Preferences update failed"));
        return;
      }

      setProfile(json.data);
      setPreferences(normalizePreferences(json.data.preferences));
      setStatus("Preferences updated");
    } catch {
      setStatus("Preferences update failed");
    } finally {
      setSavingPreferences(false);
    }
  };

  const uploadAvatar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = avatarInputRef.current?.files?.[0];
    if (!file) {
      setStatus("Select an image first");
      return;
    }

    setUploadingAvatar(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.set("image", file);

      const response = await apiFetch("/api/account/avatar", {
        method: "POST",
        body: formData
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        setStatus(getApiErrorMessage(json, "Avatar upload failed"));
        return;
      }

      setProfile((previous) => (previous ? { ...previous, avatarUrl: String(json.data.avatarUrl || "") } : previous));
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
      setAvatarFileName("");
      setStatus("Profile picture updated");
    } catch {
      setStatus("Avatar upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setUploadingAvatar(true);
    setStatus("");
    try {
      const { response, json } = await apiFetchJson<{ avatarUrl: string }>("/api/account/avatar", {
        method: "DELETE"
      });
      if (!response.ok || !json?.success) {
        setStatus(getApiErrorMessage(json, "Avatar remove failed"));
        return;
      }

      setProfile((previous) => (previous ? { ...previous, avatarUrl: "" } : previous));
      setStatus("Profile picture removed");
    } catch {
      setStatus("Avatar remove failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading) {
    return (
      <main className="relative isolate h-full min-h-0 overflow-x-hidden overflow-y-auto bg-transparent text-foreground">
        <div className="grid h-full place-items-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Loading Account Settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate h-full min-h-0 overflow-x-hidden overflow-y-auto bg-transparent text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 h-auto xl:h-full px-4 pb-10 pt-14 md:px-8 md:pb-12 md:pt-20 lg:px-10 xl:px-12">
        <div className="mx-auto grid h-auto xl:h-full w-full max-w-[1700px] min-h-0 gap-5 xl:grid-cols-12">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38 }}
            className="flex min-h-0 flex-col overflow-hidden p-2 xl:col-span-4 xl:p-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">Account Center</p>
            <h1 className="mt-2 text-[clamp(3.4rem,7.2vw,6.6rem)] leading-[0.84] font-display font-bold tracking-[-0.08em]">SETTINGS</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 md:text-base">
              Manage profile details, security, and app behavior for both user and admin accounts.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-900/14 pt-4 sm:grid-cols-3">
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Role</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900 uppercase">{profile?.role || "user"}</p>
              </article>
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Status</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900 capitalize">{profile?.accountStatus || "active"}</p>
              </article>
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Joined</p>
                <p className="mt-1 text-xl font-semibold text-zinc-900">{new Date(profile?.createdAt || Date.now()).getFullYear()}</p>
              </article>
            </div>

            <div className="mt-6 flex items-center gap-4 border-t border-zinc-900/14 pt-4">
              <div className="relative h-20 w-20 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
                {avatarSrc ? (
                  <Image src={avatarSrc} alt="Profile avatar" fill sizes="80px" className="object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-zinc-400">
                    <Camera className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">{profile?.fullName || "User"}</p>
                <p className="truncate text-xs text-zinc-500">{profile?.email || ""}</p>
                <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-zinc-900/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                  <ShieldCheck className="h-3 w-3" />
                  {profile?.accountStatus || "active"}
                </p>
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
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Settings Surface</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">Profile, Security, Preferences</p>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-6 pb-6">
                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Profile Picture</p>
                    <form className="mt-3 border-t border-zinc-900/14 pt-3" onSubmit={uploadAvatar}>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                        <label
                          htmlFor="settings-avatar-input"
                          className="flex h-12 cursor-pointer items-center gap-3 rounded-2xl border border-zinc-300 bg-white/90 px-3"
                        >
                          <span className="inline-flex h-8 shrink-0 items-center rounded-lg bg-zinc-100 px-3 text-sm font-medium text-zinc-800">
                            Choose File
                          </span>
                          <span className="truncate text-sm text-zinc-700">{avatarFileName || "No file selected"}</span>
                        </label>
                        <input
                          id="settings-avatar-input"
                          ref={avatarInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/jpg"
                          onChange={(event) => setAvatarFileName(event.target.files?.[0]?.name || "")}
                          className="sr-only"
                        />
                      <button
                        type="submit"
                        disabled={uploadingAvatar}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black disabled:opacity-60"
                      >
                        {uploadingAvatar ? "Uploading..." : "Upload"}
                      </button>
                      <button
                        type="button"
                        onClick={removeAvatar}
                        disabled={uploadingAvatar || !profile?.avatarUrl}
                        className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-8 font-mono text-xs uppercase tracking-[0.16em] text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
                      >
                        Remove
                      </button>
                      </div>
                    </form>
                  </article>

                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Profile Details</p>
                    <form className="mt-3 grid gap-3 border-t border-zinc-900/14 pt-3" onSubmit={saveProfile}>
                      <input
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="Full name"
                        required
                        className="h-10 rounded-md border border-zinc-300 bg-white/90 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-900"
                      />
                      <input
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Email"
                        type="email"
                        required
                        className="h-10 rounded-md border border-zinc-300 bg-white/90 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-900"
                      />
                      <textarea
                        value={bio}
                        onChange={(event) => setBio(event.target.value)}
                        placeholder="Bio"
                        rows={4}
                        className="rounded-md border border-zinc-300 bg-white/90 px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-900"
                      />
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-white transition-colors hover:bg-black disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savingProfile ? "Saving..." : "Save Profile"}
                      </button>
                    </form>
                  </article>

                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Password</p>
                    <form className="mt-3 grid gap-3 border-t border-zinc-900/14 pt-3" onSubmit={savePassword}>
                      <input
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        placeholder="Current password"
                        type="password"
                        minLength={8}
                        required
                        className="h-10 rounded-md border border-zinc-300 bg-white/90 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-900"
                      />
                      <input
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="New password"
                        type="password"
                        minLength={8}
                        required
                        className="h-10 rounded-md border border-zinc-300 bg-white/90 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-900"
                      />
                      <input
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Confirm new password"
                        type="password"
                        minLength={8}
                        required
                        className="h-10 rounded-md border border-zinc-300 bg-white/90 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-900"
                      />
                      <button
                        type="submit"
                        disabled={savingPassword}
                        className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-60"
                      >
                        {savingPassword ? "Updating..." : "Update Password"}
                      </button>
                    </form>
                  </article>

                  <article className="flex flex-col border-t border-zinc-900/14 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Preferences</p>
                    <form className="mt-3 border-t border-zinc-900/14 pt-3" onSubmit={savePreferences}>
                      <PreferenceRow
                        label="Default result view"
                        description="Choose the default identify mode when opening scan screen."
                        control={
                          <select
                            value={preferences.defaultOutput}
                            onChange={(event) =>
                              setPreferences((previous) => ({ ...previous, defaultOutput: event.target.value as OutputMode }))
                            }
                            className="h-8 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 outline-none transition-colors focus:border-zinc-900"
                          >
                            <option value="smart">Smart</option>
                            <option value="species">Species-first</option>
                            <option value="disease">Disease-first</option>
                          </select>
                        }
                      />

                      <PreferenceRow
                        label="Scan notifications"
                        description="Receive in-app alerts for scan completion and result states."
                        control={
                          <ToggleControl
                            checked={preferences.scanNotifications}
                            onClick={() =>
                              setPreferences((previous) => ({ ...previous, scanNotifications: !previous.scanNotifications }))
                            }
                          />
                        }
                      />

                      <PreferenceRow
                        label="Email notifications"
                        description="Allow summary messages for account and identification updates."
                        control={
                          <ToggleControl
                            checked={preferences.emailNotifications}
                            onClick={() =>
                              setPreferences((previous) => ({ ...previous, emailNotifications: !previous.emailNotifications }))
                            }
                          />
                        }
                      />

                      <PreferenceRow
                        label="Login alerts"
                        description="Get alerts when your account is accessed from a new session."
                        control={
                          <ToggleControl
                            checked={preferences.loginAlerts}
                            onClick={() => setPreferences((previous) => ({ ...previous, loginAlerts: !previous.loginAlerts }))}
                          />
                        }
                      />

                      <PreferenceRow
                        label="Two-factor authentication"
                        description="Enable extra verification requirement for sign-in."
                        control={
                          <ToggleControl
                            checked={preferences.twoFactorEnabled}
                            onClick={() =>
                              setPreferences((previous) => ({ ...previous, twoFactorEnabled: !previous.twoFactorEnabled }))
                            }
                          />
                        }
                      />

                      <PreferenceRow
                        label="Allow model fallback"
                        description="Permit fallback mode when preferred recognition path is unavailable."
                        control={
                          <ToggleControl
                            checked={preferences.allowModelFallback}
                            onClick={() =>
                              setPreferences((previous) => ({ ...previous, allowModelFallback: !previous.allowModelFallback }))
                            }
                          />
                        }
                      />

                      <PreferenceRow
                        label="Audit log retention"
                        description="Set how long account and activity audit events are retained."
                        control={
                          <select
                            value={String(preferences.auditRetentionDays)}
                            onChange={(event) =>
                              setPreferences((previous) => ({
                                ...previous,
                                auditRetentionDays: event.target.value === "30" ? 30 : event.target.value === "365" ? 365 : 90
                              }))
                            }
                            className="h-8 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 outline-none transition-colors focus:border-zinc-900"
                          >
                            <option value="30">30 days</option>
                            <option value="90">90 days</option>
                            <option value="365">365 days</option>
                          </select>
                        }
                      />

                      <PreferenceRow
                        label="Incident alerts"
                        description="Enable alerts for system incidents that affect scan reliability."
                        control={
                          <ToggleControl
                            checked={preferences.incidentAlerts}
                            onClick={() =>
                              setPreferences((previous) => ({ ...previous, incidentAlerts: !previous.incidentAlerts }))
                            }
                          />
                        }
                      />

                      <div className="pt-3">
                        <button
                          type="submit"
                          disabled={savingPreferences}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-900 px-5 font-mono text-xs uppercase tracking-[0.16em] text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-60"
                        >
                          {savingPreferences ? "Saving..." : "Save Preferences"}
                        </button>
                      </div>
                    </form>
                  </article>
                </div>
              </div>
            </div>
          </motion.section>
        </div>

        {status && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
            aria-live="polite"
            className="fixed bottom-24 right-5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-mono uppercase tracking-[0.14em] text-white"
          >
            {status}
          </motion.div>
        )}
      </section>
    </main>
  );
}
