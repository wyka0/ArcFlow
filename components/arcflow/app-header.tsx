"use client";

import Link from "next/link";
import { WalletHeaderButton } from "@/components/wallet-header-button";
import { BrandMark } from "@/components/brand-mark";

export function AppHeader() {
  return (
    <header className="w-full px-4 pt-4 lg:px-6 lg:pt-6">
      <nav className="w-full border border-foreground/20 bg-background/80 backdrop-blur-sm px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark size={20} className="text-foreground" />
            <span className="text-xs font-bold tracking-[0.2em] uppercase">ArcFlow</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/app"
              className="text-xs font-mono tracking-[0.15em] uppercase text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/app/flows"
              className="text-xs font-mono tracking-[0.15em] uppercase text-foreground font-bold"
            >
              Flows
            </Link>
            <span className="text-xs font-mono tracking-[0.15em] uppercase text-muted-foreground">
              Activity
            </span>
          </div>
          <div className="flex items-center gap-3">
            <WalletHeaderButton />
          </div>
        </div>
      </nav>
    </header>
  );
}