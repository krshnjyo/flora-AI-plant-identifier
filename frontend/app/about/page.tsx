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
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { CenteredPageHero, GlassSurface } from "@/components/layout/showcase-shell";
import { useHomeLocked } from "@/lib/use-home-locked";

type TeamMember = {
  id: string;
  name: string;
  role: string;
  registerNo: string;
  image: string;
  focus: string;
  summary: string;
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
    summary: "Leads the interface system and overall user-flow direction.",
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
    summary: "Owns backend integration, API structure, and data linkage.",
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
    summary: "Handles model workflow, validation, and response quality.",
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
    title: "Accuracy & limit",
    body: "Interface accuracy reflects benchmark validation on the catalog, while each result page shows its own image confidence. Confirm high-impact diagnosis or treatment with local experts."
  }
];

export default function AboutPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMember = teamMembers[activeIndex];

  useHomeLocked();

  return (
    <main className="relative isolate w-full overflow-x-hidden bg-transparent text-foreground xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-surface/70 blur-3xl" />
        <div className="absolute right-[-12rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full bg-surface-soft/40 blur-3xl" />
      </div>

      <section className="relative z-10 min-h-0 px-4 pb-10 pt-12 md:px-8 md:pb-12 md:pt-12 lg:px-10 xl:flex-1 xl:min-h-0 xl:px-12 xl:pb-6 xl:pt-11">
        <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-4 xl:h-full xl:min-h-0 xl:justify-start">
          <CenteredPageHero
            title="ABOUT"
            description="Product scope, operating model, and the team behind the Flora interface."
            titleClassName="text-[clamp(4rem,10vw,8.6rem)] leading-[0.74]"
            descriptionClassName="mt-1 max-w-[56rem]"
            className="mt-4 xl:mt-4"
          />

          <div className="grid min-h-0 gap-6 xl:mt-1 xl:h-[35rem] xl:min-h-0 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] xl:items-stretch">
            <GlassSurface className="h-full min-h-0 min-w-0 p-6 md:p-8 xl:p-10">
              <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex h-full min-h-0 flex-col"
            >
              <article className="flex h-full min-h-0 w-full flex-col pt-1">
                <section>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">About Flora</p>
                  <p className="mt-3 max-w-[44rem] text-[14px] leading-relaxed text-zinc-900 xl:text-[14px]">
                    A focused plant recognition surface with direct disease routing.
                  </p>
                </section>

                <div className="mt-6 grid flex-1 min-h-0 grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-x-10">
                  <div className="flex min-h-0 flex-col gap-6">
                    {essentials.slice(0, 2).map((item) => (
                      <section key={item.title} className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{item.title}</p>
                        <p className="mt-2 max-w-[30rem] text-[14px] leading-relaxed text-zinc-900 xl:text-[14px]">{item.body}</p>
                      </section>
                    ))}
                  </div>

                  <div className="flex min-h-0 flex-col gap-6">
                    <section className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{essentials[2].title}</p>
                      <p className="mt-2 max-w-[28rem] text-[14px] leading-relaxed text-zinc-900 xl:text-[14px]">{essentials[2].body}</p>
                    </section>

                    <section className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Contact</p>
                      <p className="mt-2 text-[14px] leading-relaxed text-zinc-900 xl:text-[14px]">+91 7025104024</p>
                    </section>

                    <section className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Address</p>
                      <p className="mt-2 text-[14px] leading-relaxed text-zinc-900 xl:text-[14px]">FISAT, Angamaly, Kerala</p>
                    </section>
                  </div>
                </div>

                <section className="mt-5 pt-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Jump In</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Link
                      href="/identify"
                      className="inline-flex h-10 items-center gap-2.5 rounded-full bg-zinc-900 px-5 font-mono text-[11px] uppercase tracking-[0.18em] text-white shadow-[0_12px_24px_rgba(24,24,27,0.12)] transition-colors hover:bg-black"
                    >
                      Identify
                      <ArrowUpRight size={14} />
                    </Link>
                    <Link
                      href="/gallery"
                      className="inline-flex h-10 items-center gap-2.5 rounded-full bg-zinc-900 px-5 font-mono text-[11px] uppercase tracking-[0.18em] text-white shadow-[0_12px_24px_rgba(24,24,27,0.12)] transition-colors hover:bg-black"
                    >
                      Plant Gallery
                      <ArrowUpRight size={14} />
                    </Link>
                    <Link
                      href="/disease-gallery"
                      className="inline-flex h-10 items-center gap-2.5 rounded-full bg-zinc-900 px-5 font-mono text-[11px] uppercase tracking-[0.18em] text-white shadow-[0_12px_24px_rgba(24,24,27,0.12)] transition-colors hover:bg-black"
                    >
                      Disease Gallery
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </section>
              </article>
              </motion.section>
            </GlassSurface>

            <motion.aside
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="flex h-full min-h-0 min-w-0 flex-col"
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="grid min-h-0 flex-1 grid-cols-3 gap-4">
                  {teamMembers.map((member, index) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                      className={`group relative h-full min-w-0 overflow-hidden rounded-[30px] text-left transition-transform duration-300 ${
                        activeIndex === index ? "shadow-[0_18px_40px_rgba(24,24,27,0.12)]" : "opacity-[0.88] hover:-translate-y-1 hover:opacity-100"
                      }`}
                    >
                      <div className="relative h-full w-full overflow-hidden">
                        <Image
                          src={member.image}
                          alt={member.name}
                          fill
                          sizes="340px"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                          style={{ objectPosition: member.focus }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/58 via-black/8 to-transparent" />
                        {member.id === "krishna" ? (
                          <div className="absolute bottom-4 right-4 inline-flex items-center rounded-full bg-black/50 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white">
                            Team Lead
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid min-w-0 grid-cols-3 gap-4">
                  {teamMembers.map((member, index) => (
                    <button
                      key={`${member.id}-summary`}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                      className="min-w-0 text-left"
                    >
                      <p className={`text-[12px] leading-relaxed ${activeIndex === index ? "text-zinc-950" : "text-zinc-500"}`}>
                        {member.summary}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex-shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[1.45rem] font-display font-bold leading-[0.98] tracking-[-0.02em] text-zinc-950">
                    {activeMember.name}
                  </p>
                  <span className="inline-flex items-center rounded-full bg-black/50 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white">
                    {activeMember.registerNo}
                  </span>
                </div>
                <p className="mt-2 text-[13px] text-zinc-700">{activeMember.role.replace(/^Team Lead\s*·\s*/i, "")}</p>
              </div>
            </motion.aside>
          </div>
        </div>
      </section>
    </main>
  );
}
