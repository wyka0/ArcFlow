"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { useWallet } from "@/components/wallet-provider";
import {
  getInjectedProviderOptions,
  selectInjectedProvider,
} from "@/lib/wallet/client";

const PRIMARY =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
const DROPDOWN =
  "absolute right-0 top-full mt-2 z-20 flex min-w-[176px] flex-col overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-md";
const DROPDOWN_ITEM =
  "w-full rounded-md bg-transparent px-3 py-2 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-muted focus:bg-muted focus:outline-none";

/**
 * Phase 23.68 — explicit wallet picker for the multi-provider case.
 *
 * Shown when more than one injected wallet is detected and no choice has been
 * made. Labels are display hints only; the user's preference is NEVER inferred
 * from provider order or a MetaMask flag. Selecting an option records the choice
 * and then runs the app's existing connection flow (chain/account guards and
 * error handling are untouched).
 */
export function WalletProviderPicker() {
  const { connect, providerRef } = useWallet();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  // Recomputed each render so a changed provider list is reflected.
  const options = getInjectedProviderOptions();

  // Close on Escape (returning focus to the toggle) or an outside click.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  // Move focus into the list when it opens.
  useEffect(() => {
    if (!open) return;
    const first = listRef.current?.querySelector<HTMLButtonElement>("button[role='option']");
    first?.focus();
  }, [open]);

  const handleChoose = (index: number) => {
    setOpen(false);
    // Record the explicit choice, then re-resolve so the connection flow cannot
    // reuse a previously-bound provider (connect() prefers providerRef.current).
    selectInjectedProvider(index);
    providerRef.current = null;
    void connect();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={toggleRef}
        className={PRIMARY}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title="Multiple wallets detected — choose one"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="flex items-center gap-1.5">
          Choose a wallet
          <ChevronDown className="size-4" aria-hidden />
        </span>
      </button>

      {open && (
        <div className={DROPDOWN} role="listbox" id={listId} aria-label="Detected wallets" ref={listRef}>
          <span className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Multiple wallets detected
          </span>
          {options.length === 0 ? (
            <span className="px-3 py-2 text-xs text-muted-foreground">No wallets found.</span>
          ) : (
            options.map((option) => (
              <button
                key={option.index}
                className={DROPDOWN_ITEM}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleChoose(option.index)}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
