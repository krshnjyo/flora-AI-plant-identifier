/**
 * File: frontend/app/register/page.tsx
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

export default function RegisterPage() {
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
      fullName: String(form.get("fullName") || ""),
      email: String(form.get("email") || ""),
      password: String(form.get("password") || "")
    };

    try {
      const { response, json } = await apiFetchJson<{ user: { userId: number } }>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok || !json?.success) {
        setError(getApiErrorMessage(json, "Registration failed"));
        return;
      }

      notifyAuthChanged();
      router.push("/identify");
    } catch {
      setError("Registration request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 flex min-h-[calc(100vh-10rem)] items-center px-4 pb-6 pt-10 md:min-h-[calc(100vh-11rem)] md:px-8 md:pb-8 md:pt-14 lg:px-10 xl:flex-1 xl:min-h-0 xl:px-12 xl:py-6">
        <div className="mx-auto grid w-full max-w-[1700px] items-center gap-5 xl:-translate-y-4 xl:grid-cols-12">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col p-2 xl:col-span-7 xl:p-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">Registration</p>
            <h1 className="mt-2 text-[clamp(3.8rem,16vw,10rem)] leading-[0.84] font-display font-bold tracking-[-0.09em]">SIGN UP</h1>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 md:text-lg">
              Create your workspace for image upload, species lookup, diagnosis routing, and scan history.
            </p>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-900/14 pt-3">
              {["Image Upload", "Manual Search", "Result History", "Settings"].map((tag) => (
                <span key={tag} className="floating-chip rounded-full px-3 py-1 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="w-full rounded-[28px] border border-zinc-900/12 bg-white/70 p-5 shadow-[0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur-xl xl:col-span-5 xl:max-w-[40rem] xl:justify-self-end xl:p-6"
          >
            <h2 className="text-2xl font-display font-bold tracking-[-0.03em] text-zinc-900">Create Account</h2>
            <p className="mt-1 text-sm text-zinc-500">Register once and start identifying immediately.</p>

            <form className="mt-4 space-y-4 border-t border-zinc-900/14 pt-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="fullName" className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  className="h-12 border-zinc-300 bg-white/90 transition-colors focus:border-zinc-900"
                  placeholder="Jane Doe"
                />
              </div>

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
                    Creating account...
                  </span>
                ) : (
                  "Sign Up"
                )}
              </button>

            </form>

            <Link
              href="/login"
              className="group mt-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-500 transition-colors hover:text-zinc-900"
            >
              Already have an account
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.aside>
        </div>
      </section>
    </main>
  );
}
