import { BrandMark } from "@/components/brand-mark";
import { WalletHeaderButton } from "@/components/wallet-header-button";

export function SiteHeader() {
  return (
    <header className="w-full px-4 pt-4 lg:px-6 lg:pt-6">
      <nav className="flex flex-wrap items-center justify-between gap-3 border border-foreground/20 bg-background/80 px-4 py-3 backdrop-blur-sm lg:px-6">
        <div className="flex items-center gap-3">
          <BrandMark size={20} className="text-foreground" />
          <span className="text-xs font-bold tracking-[0.2em] uppercase">AgentPay</span>
        </div>
        <div className="flex items-center gap-3">
          <WalletHeaderButton />
        </div>
      </nav>
    </header>
  );
}
