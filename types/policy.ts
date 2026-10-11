import type { Currency } from "./money";
import type { ServiceCategory } from "./service";

export interface SpendingPolicy {
  id: string;
  agentId: string;
  maxPerTransaction: number;
  dailyLimit: number;
  currency: Currency;
  allowedCategories: readonly ServiceCategory[];
}
