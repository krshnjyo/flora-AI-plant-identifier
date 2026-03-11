/**
 * File: frontend/app/layout.tsx
 * Purpose: Defines the global app shell and shared metadata.
 *
 * Responsibilities:
 * - Applies global CSS and mounts shared layout elements
 * - Configures metadata, icons, and root-level structure
 *
 * Design Notes:
 * - Keeps page transition and shared chrome in one central place
 */

import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PageTransition } from "@/components/animations/page-transition";

export const metadata: Metadata = {
  title: "FLORA",
  applicationName: "FLORA",
  description: "AI-powered Plant Identification & Disease Detection",
  metadataBase: new URL("http://localhost:3000"),
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: "FLORA",
    description: "AI-powered Plant Identification & Disease Detection",
    type: "website"
  },
  // Use a versioned favicon URL so browsers fetch the new icon instead of reusing stale cached artwork.
  icons: {
    icon: [
      { url: "/favicon-white-f.svg?v=20260214-2", type: "image/svg+xml" },
      { url: "/favicon.svg?v=20260214-2", type: "image/svg+xml" },
      { url: "/flora-favicon.svg?v=20260214-2", type: "image/svg+xml" }
    ],
    shortcut: ["/favicon-white-f.svg?v=20260214-2"],
    apple: ["/favicon-white-f.svg?v=20260214-2"]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="relative w-full min-h-0 flex-1">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
      </body>
    </html>
  );
}
