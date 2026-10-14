"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { WalletHeaderButton } from "@/components/wallet-header-button";
import { Button } from "@/components/ui/button";
import { useState } from "react";

/*
 * Dashboard shell adopted from the reference kit: a sticky h-14 header with
 * breadcrumb + wallet control, a w-56 desktop sidebar, and a mobile nav sheet.
 */

const NAV_ITEMS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/flows", label: "Flows" },
  { href: "/app/flows/new", label: "Create Flow" },
] as const;

function pageLabel(pathname: string): string {
  const match = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  return match?.label ?? "Dashboard";
}

export function ArcFlowNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: { href: string; label: string };
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Breadcrumb with home link */}
        <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
          <Link
            href="/"
            className="flex items-center gap-2 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <BrandMark size={18} className="text-accent" />
            ArcFlow
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="font-medium text-foreground">{pageLabel(pathname)}</span>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <WalletHeaderButton />
      </div>
    </header>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <ArcFlowNavLink key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}

/**
 * Full dashboard shell: header + desktop sidebar + mobile nav + main content.
 * Client component because it owns the mobile-menu open state.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <AppHeader onMenuClick={() => setMobileOpen(true)} />
      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 flex-col border-r border-border md:flex">
          <AppSidebar />
        </aside>
        <main className="min-h-[calc(100vh-3.5rem)] flex-1">{children}</main>
      </div>
    </div>
  );
}

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 top-0 h-full w-64 border-r border-border bg-background p-4">
        <div className="mb-6 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <BrandMark size={18} className="text-accent" />
            ArcFlow
          </span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Mobile">
          {NAV_ITEMS.map((item) => (
            <ArcFlowNavLink key={item.href} item={item} pathname={pathname} onNavigate={onClose} />
          ))}
          <span
            className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/50"
            aria-disabled="true"
          >
            Activity
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground/60">
              Soon
            </span>
          </span>
        </nav>
      </div>
    </div>
  );
}
