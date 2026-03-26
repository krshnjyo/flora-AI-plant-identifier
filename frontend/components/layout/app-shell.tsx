"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PageTransition } from "@/components/animations/page-transition";

export function AppShell({ children }: { children: React.ReactNode }) {
  usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] xl:h-screen xl:overflow-hidden">
      <Header />
      <main className="relative w-full min-h-0 flex-1 xl:overflow-hidden xl:[&>*]:h-full xl:[&>*]:min-h-0">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />
    </div>
  );
}
