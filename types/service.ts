import type { Currency } from "./money";

export type ServiceCategory = "research" | "data" | "ai";

export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  price: number;
  currency: Currency;
  active: boolean;
  description: string;
}
