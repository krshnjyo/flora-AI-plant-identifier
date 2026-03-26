/**
 * File: frontend/components/layout/header.tsx
 * Purpose: Renders the global navigation/header with auth-aware actions.
 *
 * Responsibilities:
 * - Displays primary route links and active/hover states
 * - Loads auth state and toggles account actions
 * - Prefetches key routes/data to improve perceived navigation speed
 *
 * Design Notes:
 * - Uses responsive sizing rules to prevent overlap on narrow viewports
 * - Keeps account menu state local to avoid global UI coupling
 */

"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, LogOut, Settings, Shield, User, History } from "lucide-react";

import { apiFetch, apiFetchJson, notifyAuthChanged, toAssetUrl } from "@/lib/api-client";
import { navigateWithFloraTransition } from "@/lib/navigation-transition";
import { preloadDiseases } from "@/lib/diseases-cache";
import { preloadPlants } from "@/lib/plants-cache";
import { cn } from "@/lib/utils";

type AuthUser = { userId: number; email: string; role: "user" | "admin" };
type HeaderProfile = { fullName: string; avatarUrl: string };

const links = [
  { href: "/", label: "Home" },
  { href: "/identify", label: "Identify" },
  { href: "/about", label: "About" }
];

export function Header() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<HeaderProfile | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [hoveredPath, setHoveredPath] = useState(pathname);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const desktopActionsRef = useRef<HTMLDivElement | null>(null);
  const loadRequestRef = useRef(0);
  const [desktopActionsWidth, setDesktopActionsWidth] = useState(0);

  const loadUser = useCallback(() => {
    const requestId = ++loadRequestRef.current;

    apiFetchJson<{ user: AuthUser }>("/api/auth/me")
      .then(async ({ response, json }) => {
        if (requestId !== loadRequestRef.current) {
          return;
        }

        if (!response.ok || !json?.success) {
          setUser(null);
          setProfile(null);
          return;
        }

        setUser(json.data.user);

        try {
          const { response: profileResponse, json: profileJson } = await apiFetchJson<HeaderProfile>("/api/account/profile");
          if (requestId !== loadRequestRef.current) {
            return;
          }
          setProfile(profileResponse.ok && profileJson?.success ? profileJson.data : null);
        } catch {
          if (requestId === loadRequestRef.current) {
            setProfile(null);
          }
        }
      })
      .catch(() => {
        if (requestId !== loadRequestRef.current) {
          return;
        }
        setUser(null);
        setProfile(null);
      });
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    ["/", "/identify", "/about", "/gallery", "/disease-gallery", "/history", "/settings", "/login", "/register"].forEach((route) => {
      router.prefetch(route);
    });
    void preloadPlants();
    void preloadDiseases();
  }, [router]);

  useEffect(() => {
    const onAuthChanged = () => {
      loadUser();
    };

    window.addEventListener("flora-auth-change", onAuthChanged);
    return () => {
      window.removeEventListener("flora-auth-change", onAuthChanged);
    };
  }, [loadUser]);

  useEffect(() => {
    setAccountExpanded(false);
  }, [pathname]);

  useEffect(() => {
    setHoveredPath(pathname);
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!accountRef.current) return;
      if (!accountRef.current.contains(event.target as Node)) {
        setAccountExpanded(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountExpanded(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const logout = async () => {
    setAccountExpanded(false);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even on network failures, clear local auth state and route to login.
    } finally {
      notifyAuthChanged();
      router.push("/login");
    }
  };

  const navigateFromAccountMenu = (href: string) => {
    setAccountExpanded(false);
    navigateWithFloraTransition(router, href);
  };

  useEffect(() => {
    const measureDesktopActions = () => {
      setDesktopActionsWidth(desktopActionsRef.current?.scrollWidth || 0);
    };

    measureDesktopActions();
    window.addEventListener("resize", measureDesktopActions);
    return () => {
      window.removeEventListener("resize", measureDesktopActions);
    };
  }, [user?.role, pathname, profile?.fullName]);

  const accountActionClass =
    "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-black/5 hover:text-black";
  const resultBackAction = pathname.startsWith("/results/plant/")
    ? { href: "/gallery", label: "Back To Plant Gallery" }
    : pathname.startsWith("/results/disease/")
      ? { href: "/disease-gallery", label: "Back To Disease Gallery" }
      : null;

  if (pathname === "/gallery" || pathname === "/disease-gallery") {
    return null;
  }

  const accountLabel =
    profile?.fullName?.trim() ||
    (user?.email ? user.email.split("@")[0] : "Account");
  const avatarSrc = toAssetUrl(profile?.avatarUrl || "");

  return (
    <header className="sticky top-2 z-50 mx-auto w-full max-w-[1100px] px-2 sm:top-3 sm:px-4 md:top-6 md:px-5 lg:top-8 xl:w-fit xl:max-w-none">
      <div className="mx-auto flex w-full items-center justify-center xl:w-auto">
        <div className="relative w-full xl:w-auto">
          <AnimatePresence initial={false}>
            {resultBackAction ? (
              <motion.button
                key="result-back-action"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: prefersReducedMotion ? 0.16 : 0.28,
                  ease: [0.22, 1, 0.36, 1]
                }}
                type="button"
                onClick={() => navigateWithFloraTransition(router, resultBackAction.href)}
                aria-label={resultBackAction.label}
                className="absolute left-0 top-1/2 z-10 hidden h-12 w-12 -translate-x-[calc(100%+0.75rem)] -translate-y-1/2 items-center justify-center rounded-[1.55rem] border border-black/10 bg-white/80 text-neutral-600 shadow-lg shadow-black/5 backdrop-blur-xl backdrop-saturate-150 transition-colors hover:border-black/20 hover:text-black xl:inline-flex"
              >
                <ArrowLeft size={17} />
              </motion.button>
            ) : null}
          </AnimatePresence>

          <motion.div
          initial={{ y: prefersReducedMotion ? 0 : -32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={
            prefersReducedMotion
              ? { duration: 0.15 }
              : { type: "spring", stiffness: 280, damping: 28, mass: 0.9 }
          }
          className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-[1.45rem] border border-black/5 bg-white/70 px-1.5 py-1.5 shadow-lg shadow-black/5 backdrop-blur-xl backdrop-saturate-150 sm:gap-2 sm:rounded-full sm:px-2 sm:py-2 md:flex-nowrap md:justify-between md:gap-2 xl:w-auto xl:justify-center"
          >
          <nav className="order-1 flex min-w-0 flex-1 items-center justify-center gap-0.5 md:order-none md:flex-none" aria-label="Primary navigation">
            {links.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative inline-flex h-9 items-center rounded-full px-2.5 text-xs font-medium transition-colors hover:text-black sm:px-3 sm:text-sm",
                    isActive ? "text-black" : "text-neutral-500"
                  )}
                  onMouseEnter={() => setHoveredPath(item.href)}
                  onMouseLeave={() => setHoveredPath(pathname)}
                >
                  <span className="relative z-10">{item.label}</span>
                  {item.href === hoveredPath && (
                    <motion.div
                      layoutId="navbar-hover"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      className="absolute inset-0 z-0 rounded-full bg-black/5"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mx-1.5 hidden h-7 w-px bg-black/10 md:block" />

          <div className="order-2 flex shrink-0 items-center justify-center gap-1 pr-0.5 sm:gap-2 sm:pr-1 md:order-none">
            {!user ? (
              <>
                {resultBackAction && (
                  <button
                    type="button"
                    onClick={() => navigateWithFloraTransition(router, resultBackAction.href)}
                    aria-label={resultBackAction.label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/80 text-neutral-600 shadow-sm shadow-black/5 transition-colors hover:border-black/20 hover:text-black xl:hidden"
                  >
                    <ArrowLeft size={14} />
                  </button>
                )}
                <Link
                  href="/login"
                  className="rounded-full px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-black/5 hover:text-black sm:px-3 sm:py-2 sm:text-sm"
                >
                  Log In
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-black px-2.5 py-1.5 text-xs font-medium text-white transition-transform hover:scale-105 active:scale-95 sm:px-3 sm:py-2 sm:text-sm"
                >
                  Sign Up
                </Link>
              </>
            ) : (
              <div ref={accountRef} className="relative flex h-9 items-center">
                {resultBackAction && (
                  <button
                    type="button"
                    onClick={() => navigateWithFloraTransition(router, resultBackAction.href)}
                    aria-label={resultBackAction.label}
                    className="mr-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/80 text-neutral-600 shadow-sm shadow-black/5 transition-colors hover:border-black/20 hover:text-black xl:hidden"
                  >
                    <ArrowLeft size={14} />
                  </button>
                )}
                {/* Desktop: one continuous account strip that expands to the right. */}
                <div className="hidden h-9 items-center xl:flex">
                  <button
                    type="button"
                    onClick={() => setAccountExpanded((prev) => !prev)}
                    aria-label="Toggle account menu"
                    aria-expanded={accountExpanded}
                    aria-haspopup="menu"
                    className={cn(
                      "relative z-[2] inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-100 pl-1 pr-3 transition-colors hover:bg-neutral-200",
                      accountExpanded && "bg-neutral-200"
                    )}
                  >
                    <div className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
                      {avatarSrc ? (
                        <Image src={avatarSrc} alt={accountLabel} fill sizes="28px" className="object-cover" />
                      ) : (
                        <User size={14} className="text-black" />
                      )}
                    </div>
                    <span className="hidden max-w-[8rem] truncate text-xs font-medium text-neutral-600 sm:inline">{accountLabel}</span>
                  </button>

                  <motion.div
                    initial={false}
                    animate={{
                      width: accountExpanded ? desktopActionsWidth : 0,
                      opacity: accountExpanded ? 1 : 0,
                      marginLeft: accountExpanded ? 4 : 0
                    }}
                    transition={{
                      duration: prefersReducedMotion ? 0.12 : 0.24,
                      ease: [0.22, 1, 0.36, 1]
                    }}
                    className={cn("pointer-events-none flex items-center overflow-hidden", accountExpanded && "pointer-events-auto")}
                    style={{ willChange: "width, opacity, margin-left" }}
                  >
                    <div ref={desktopActionsRef} className="flex items-center gap-1">
                      <Link
                        href="/history"
                        onClick={(event) => {
                          event.preventDefault();
                          navigateFromAccountMenu("/history");
                        }}
                        className={accountActionClass}
                      >
                        <History size={12} />
                        <span>History</span>
                      </Link>
                      <Link
                        href="/settings"
                        onClick={(event) => {
                          event.preventDefault();
                          navigateFromAccountMenu("/settings");
                        }}
                        className={accountActionClass}
                      >
                        <Settings size={12} />
                        <span>Settings</span>
                      </Link>
                      {user.role === "admin" && (
                        <Link
                          href="/admin"
                          onClick={(event) => {
                            event.preventDefault();
                            navigateFromAccountMenu("/admin");
                          }}
                          className={accountActionClass}
                        >
                          <Shield size={12} />
                          <span>Admin</span>
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={logout}
                        aria-label="Log out"
                        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                      >
                        <LogOut size={12} />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </motion.div>
                </div>

                {/* Tablet/mobile account button. */}
                <button
                  type="button"
                  onClick={() => setAccountExpanded((prev) => !prev)}
                  aria-label="Toggle account menu"
                  aria-expanded={accountExpanded}
                  aria-haspopup="menu"
                  className={cn(
                    "relative z-[2] inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-100 pl-1 pr-3 transition-colors hover:bg-neutral-200 xl:hidden",
                    accountExpanded && "bg-neutral-200"
                  )}
                >
                  <div className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
                    {avatarSrc ? (
                      <Image src={avatarSrc} alt={accountLabel} fill sizes="28px" className="object-cover" />
                    ) : (
                      <User size={14} className="text-black" />
                    )}
                  </div>
                  <span className="hidden max-w-[8rem] truncate text-xs font-medium text-neutral-600 sm:inline">{accountLabel}</span>
                </button>

                {/* Tablet/mobile: account actions open as a dropdown under the button. */}
                <motion.div
                  initial={false}
                  animate={{
                    opacity: accountExpanded ? 1 : 0,
                    y: accountExpanded ? 0 : -8,
                    scale: accountExpanded ? 1 : 0.985
                  }}
                  transition={{
                    duration: prefersReducedMotion ? 0.12 : 0.2,
                    ease: [0.22, 1, 0.36, 1]
                  }}
                  className={cn(
                    "pointer-events-none absolute right-0 top-[calc(100%+0.45rem)] z-40 min-w-[12rem] rounded-2xl border border-black/10 bg-white/95 p-1 shadow-xl shadow-black/10 xl:hidden",
                    accountExpanded && "pointer-events-auto"
                  )}
                  style={{ willChange: "transform, opacity" }}
                >
                  <div className="flex flex-col gap-1 rounded-xl bg-white/95 p-1">
                    <Link
                      href="/history"
                      onClick={(event) => {
                        event.preventDefault();
                        navigateFromAccountMenu("/history");
                      }}
                      className={accountActionClass}
                    >
                      <History size={12} />
                      <span>History</span>
                    </Link>
                    <Link
                      href="/settings"
                      onClick={(event) => {
                        event.preventDefault();
                        navigateFromAccountMenu("/settings");
                      }}
                      className={accountActionClass}
                    >
                      <Settings size={12} />
                      <span>Settings</span>
                    </Link>
                    {user.role === "admin" && (
                      <Link
                        href="/admin"
                        onClick={(event) => {
                          event.preventDefault();
                          navigateFromAccountMenu("/admin");
                        }}
                        className={accountActionClass}
                      >
                        <Shield size={12} />
                        <span>Admin</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={logout}
                      aria-label="Log out"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                    >
                      <LogOut size={12} />
                      <span>Log Out</span>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </div>
          </motion.div>
        </div>
      </div>
    </header>
  );
}
