/**
 * File: frontend/app/about/page.tsx
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
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { useHomeLocked } from "@/lib/use-home-locked";

type TeamMember = {
  id: string;
  name: string;
  role: string;
  registerNo: string;
  image: string;
  focus: string;
  contribution: string;
  stack: string[];
};

const teamMembers: TeamMember[] = [
  {
    id: "krishna",
    name: "Krishna Jyothish",
    role: "Team Lead · Frontend & UI",
    registerNo: "FIT23CDS038",
    image: "/team/krishna.png",
    focus: "52% 34%",
    contribution: "Design system, user flows, and interaction polish for the core user experience.",
    stack: ["Next.js", "UI Systems", "Interaction Design"]
  },
  {
    id: "rueben",
    name: "Rueben Joseph Rex",
    role: "Backend & Integration",
    registerNo: "FIT23CDS051",
    image: "/team/rueben.png",
    focus: "50% 28%",
    contribution: "API architecture, database linkage, and production-safe integration workflows.",
    stack: ["Node API", "MySQL", "Data Pipelines"]
  },
  {
    id: "sam",
    name: "Sam Abraham Paul",
    role: "Model Workflow & Validation",
    registerNo: "FIT23CDS054",
    image: "/team/sam.png",
    focus: "50% 24%",
    contribution: "Model routing, response quality checks, and validation tuning for disease/plant output.",
    stack: ["Model Ops", "Quality Checks", "Inference Logic"]
  }
];

const essentials = [
  {
    title: "What Flora does",
    body: "Identifies plant type and likely disease from one photo, then opens structured result pages."
  },
  {
    title: "How to use",
    body: "Go to Identify, upload a clear image, choose Smart/Plant/Disease mode, and open the routed result."
  },
  {
    title: "Important limit",
    body: "Model confidence is guidance only. Confirm high-impact diagnosis/treatment with local experts."
  }
];

const TEAM_ALL_IMAGE = "/team/team-all.jpeg?v=20260220";

export default function AboutPage() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const displayMember = hoveredIndex !== null ? teamMembers[hoveredIndex] : null;
  const panelOpen = hoveredIndex !== null;

  useHomeLocked();

  return (
    <main className="relative isolate h-full min-h-0 overflow-x-hidden overflow-y-auto xl:overflow-hidden bg-transparent text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 h-auto xl:h-full min-h-0 px-4 pb-6 pt-12 md:px-8 md:pb-7 md:pt-12 lg:px-10 xl:px-12">
        <div className="mx-auto grid h-auto xl:h-full min-h-0 w-full max-w-[1700px] items-stretch gap-6 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)]">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38 }}
            className="flex min-h-0 flex-col justify-center p-2"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500 md:text-[11px]">User Guide</p>
            <h1 className="mt-2 text-[clamp(3.8rem,18vw,6.6rem)] leading-[0.82] font-display font-bold tracking-[-0.085em] md:text-[clamp(4.6rem,12vw,8.2rem)] xl:text-[clamp(5.2rem,12vw,10.8rem)]">ABOUT</h1>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-zinc-600 md:text-lg xl:text-xl">Only what you need before using Flora.</p>

            <div className="mt-4 grid gap-2 border-t border-zinc-900/14 pt-3">
              {essentials.map((item) => (
                <article key={item.title} className="border-b border-zinc-900/12 pb-2.5 pt-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 md:text-[11px]">{item.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-700 md:text-[15px] xl:text-base">{item.body}</p>
                </article>
              ))}
            </div>

            <div className="mt-4 border-t border-zinc-900/14 pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 md:text-[11px]">Quick Access</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Link
                  href="/identify"
                  className="group inline-flex items-center gap-1 rounded-full border border-zinc-900 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white md:px-4.5 md:py-2.5 md:text-[12px] xl:px-5 xl:py-2.5 xl:text-[13px]"
                >
                  Identify
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/gallery"
                  className="group inline-flex items-center gap-1 rounded-full border border-zinc-900/20 bg-white px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900 md:px-4.5 md:py-2.5 md:text-[12px] xl:px-5 xl:py-2.5 xl:text-[13px]"
                >
                  Plant Gallery
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/disease-gallery"
                  className="group inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 md:px-4.5 md:py-2.5 md:text-[12px] xl:px-5 xl:py-2.5 xl:text-[13px]"
                >
                  Disease Gallery
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.05 }}
            className="flex min-h-0 flex-col p-2"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Team</p>
              <p className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400 sm:block">Interactive Member View</p>
            </div>

            <div className="mt-3 border-t border-zinc-900/14 pt-3 xl:hidden">
              <div className="space-y-3">
                <article className="relative h-[19.5rem] overflow-hidden rounded-2xl ring-1 ring-zinc-900/12 sm:h-[24rem]">
                  <Image
                    src={TEAM_ALL_IMAGE}
                    alt="Flora team group photo"
                    fill
                    sizes="100vw"
                    className="object-cover"
                    style={{ objectPosition: "50% 56%" }}
                    priority
                  />
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/30 to-transparent px-4 pb-4 pt-10">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/80">Flora Team</p>
                    <p className="mt-1 text-[1.6rem] font-display font-bold leading-[0.94] tracking-[-0.03em] text-white">
                      Built by CS + Design Students
                    </p>
                  </div>
                </article>

                <div className="grid grid-cols-3 gap-2.5">
                  {teamMembers.map((member, index) => {
                    const isSelected = hoveredIndex === index;
                    return (
                      <button
                        key={`mobile-${member.id}`}
                        type="button"
                        onClick={() => setHoveredIndex(index)}
                        className={`group relative aspect-[3/4] overflow-hidden rounded-xl text-left transition-all ${
                          isSelected ? "ring-2 ring-zinc-900/25" : "ring-1 ring-zinc-900/12"
                        }`}
                      >
                        <Image
                          src={member.image}
                          alt={member.name}
                          fill
                          sizes="(max-width: 640px) 32vw, 180px"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          style={{ objectPosition: member.focus }}
                        />
                        <div className="absolute inset-0 bg-black/28" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6">
                          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/90">{member.name.split(" ")[0]}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {displayMember ? (
                  <article className="rounded-2xl border border-zinc-900/12 bg-white/90 p-4 shadow-[0_12px_30px_rgba(24,24,27,0.08)]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{displayMember.registerNo}</p>
                      {displayMember.id === "krishna" ? (
                        <span className="rounded-full border border-zinc-300 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                          Team Lead
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-2xl font-display font-bold leading-[0.96] tracking-[-0.02em] text-zinc-900">{displayMember.name}</p>
                    <p className="mt-1 text-sm text-zinc-700">{displayMember.role.replace(/^Team Lead\s*·\s*/i, "")}</p>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-700">{displayMember.contribution}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {displayMember.stack.map((item) => (
                        <span key={`mobile-stack-${item}`} className="rounded-full border border-zinc-300 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-700">
                          {item}
                        </span>
                      ))}
                    </div>
                  </article>
                ) : (
                  <article className="rounded-2xl border border-zinc-900/12 bg-white/85 p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Team Detail</p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-700">Tap a member photo to preview contribution and stack focus.</p>
                  </article>
                )}
              </div>
            </div>

            <div className="mt-3 hidden min-h-0 flex-1 gap-3 border-t border-zinc-900/14 pt-3 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem]">
              <motion.article
                key={displayMember?.id ?? "team-all"}
                initial={{ opacity: 0.88, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="relative h-[23rem] overflow-hidden rounded-2xl ring-1 ring-zinc-900/12 outline-none [--panel-width:52%] sm:h-[26rem] md:h-[clamp(22rem,58vh,36rem)] md:[--panel-width:48%] lg:h-[clamp(24rem,60vh,40rem)] lg:[--panel-width:44%] xl:h-[clamp(24rem,64vh,43rem)] xl:[--panel-width:40%]"
              >
                {!panelOpen ? (
                  <>
                    <Image
                      src={TEAM_ALL_IMAGE}
                      alt="Flora team group photo"
                      fill
                      sizes="(max-width: 1280px) 100vw, 70vw"
                      className="object-cover"
                      style={{ objectPosition: "50% 56%" }}
                      priority
                    />
                    <div className="absolute inset-0 bg-black/22" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/72 via-black/28 to-transparent px-4 pb-4 pt-10">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/80">Flora Team</p>
                      <p className="mt-1 text-[1.7rem] font-display font-bold leading-[0.94] tracking-[-0.03em] text-white">Built by CS + Design Students</p>
                    </div>
                  </>
                ) : (
                  <>
                    <motion.div
                      className="absolute inset-y-0 left-0 z-10 overflow-hidden"
                      animate={{
                        width: panelOpen ? "calc(100% - var(--panel-width))" : "100%",
                        x: "0%"
                      }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {displayMember?.id === "krishna" ? (
                        <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full border border-white/35 bg-black/25 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm">
                          Team Lead
                        </div>
                      ) : null}

                      <Image
                        src={displayMember?.image || TEAM_ALL_IMAGE}
                        alt={displayMember?.name || "Team member"}
                        fill
                        sizes="(max-width: 1280px) 100vw, 58vw"
                        className="object-cover"
                        style={{ objectPosition: displayMember?.focus || "50% 50%" }}
                        priority
                      />
                      <div className="absolute inset-0 bg-black/30" />
                    </motion.div>

                    <motion.div
                      className="absolute right-0 top-0 bottom-0 z-20 overflow-hidden bg-white"
                      animate={{
                        width: panelOpen ? "var(--panel-width)" : "0%",
                        opacity: panelOpen ? 1 : 0
                      }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div className="flex h-full flex-col gap-3 p-4 md:gap-4 md:p-5">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{displayMember?.registerNo}</p>
                          <p className="mt-1 text-[1.35rem] font-display font-bold leading-[0.98] tracking-[-0.02em] text-zinc-900 md:text-2xl">{displayMember?.name}</p>
                          <p className="mt-1 text-sm text-zinc-700">{displayMember?.role.replace(/^Team Lead\s*·\s*/i, "")}</p>
                        </div>
                        <div>
                          <p className="text-[0.92rem] leading-relaxed text-zinc-700 md:text-sm">
                            {displayMember?.contribution}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {displayMember?.stack.map((item) => (
                              <span
                                key={item}
                                className="rounded-full border border-zinc-300 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-700"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/84 via-black/48 to-transparent px-3 pb-3 pt-8">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">{displayMember?.registerNo}</p>
                      <p className="mt-1 text-[2rem] font-display font-bold leading-[0.92] tracking-[-0.03em] text-white">{displayMember?.name}</p>
                      <p className="mt-1 text-sm text-white/90">{displayMember?.role.replace(/^Team Lead\s*·\s*/i, "")}</p>
                    </div>
                  </>
                )}
              </motion.article>

              <div className="grid min-h-0 h-auto grid-cols-3 gap-2.5 md:h-[clamp(22rem,58vh,36rem)] md:grid-cols-1 md:grid-rows-3 lg:h-[clamp(24rem,60vh,40rem)] xl:h-[clamp(24rem,64vh,43rem)]">
                {teamMembers.map((member, index) => {
                  const isPreview = index === hoveredIndex;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setHoveredIndex(index)}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onFocus={() => setHoveredIndex(index)}
                      onBlur={() => setHoveredIndex(null)}
                      className={`group relative h-full overflow-hidden rounded-xl text-left transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                        isPreview ? "ring-2 ring-zinc-900/20" : "ring-1 ring-zinc-900/12"
                      }`}
                    >
                      <Image
                        src={member.image}
                        alt={member.name}
                        fill
                        sizes="280px"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        style={{ objectPosition: member.focus }}
                      />
                      <div className="absolute inset-0 bg-black/28" />
                      <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-6 bg-gradient-to-t from-black/75 to-transparent">
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/80">{member.name.split(" ")[0]}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.section>
        </div>
      </section>
    </main>
  );
}
