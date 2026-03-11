/**
 * File: frontend/app/login/page.tsx
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

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchJson, getApiErrorMessage, notifyAuthChanged } from "@/lib/api-client";
import { useHomeLocked } from "@/lib/use-home-locked";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useHomeLocked();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || "")
    };

    try {
      const { response, json } = await apiFetchJson<{ user: { role: "user" | "admin" } }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok || !json?.success) {
        setError(getApiErrorMessage(json, "Login failed"));
        return;
      }

      notifyAuthChanged();
      router.push(json.data.user.role === "admin" ? "/admin" : "/identify");
    } catch {
      setError("Login request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative isolate h-full min-h-0 overflow-x-hidden overflow-y-auto xl:overflow-hidden bg-transparent text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 flex h-full items-center px-4 pb-6 pt-10 md:px-8 md:pb-8 md:pt-14 lg:px-10 xl:px-12">
        <div className="mx-auto grid w-full max-w-[1700px] items-center gap-5 xl:-translate-y-4 xl:grid-cols-12">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col p-2 xl:col-span-7 xl:p-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">Access Portal</p>
            <h1 className="mt-2 text-[clamp(3.8rem,16vw,10rem)] leading-[0.84] font-display font-bold tracking-[-0.09em]">LOGIN</h1>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 md:text-lg">
              Sign in to continue plant identification workflows, results tracking, and account-level controls.
            </p>

            <div className="mt-5 grid max-w-2xl grid-cols-2 gap-3 border-t border-zinc-900/14 pt-3 sm:grid-cols-3">
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Accuracy</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">99.8%</p>
              </article>
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Database</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">10k+</p>
              </article>
              <article>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Coverage</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">Global</p>
              </article>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="w-full rounded-[28px] border border-zinc-900/12 bg-white/70 p-5 shadow-[0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur-xl xl:col-span-5 xl:max-w-[40rem] xl:justify-self-end xl:p-6"
          >
            <h2 className="text-2xl font-display font-bold tracking-[-0.03em] text-zinc-900">Enter Credentials</h2>
            <p className="mt-1 text-sm text-zinc-500">Secure sign-in to access your Flora workspace.</p>

            <form className="mt-4 space-y-4 border-t border-zinc-900/14 pt-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email" className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="h-12 border-zinc-300 bg-white/90 transition-colors focus:border-zinc-900"
                  placeholder="name@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  className="h-12 border-zinc-300 bg-white/90 transition-colors focus:border-zinc-900"
                />
              </div>

              {error && (
                <p role="alert" aria-live="assertive" className="border border-red-100 bg-red-50 px-4 py-3 font-mono text-xs text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="h-12 w-full rounded-full bg-zinc-900 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
                disabled={loading}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="scan-loader" />
                    Authenticating...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <Link
              href="/register"
              className="group mt-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-500 transition-colors hover:text-zinc-900"
            >
              Create an account
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.aside>
        </div>
      </section>
    </main>
  );
}
