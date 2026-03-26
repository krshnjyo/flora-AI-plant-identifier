"use client";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="h-full min-h-0 w-full">{children}</div>;
}
