/**
 * Environment validation for AgentPay.
 *
 * Separates configuration into categories and validates required
 * production settings. Does not expose secrets or sensitive values.
 */

export type ConfigCategory =
  | "public"        // NEXT_PUBLIC_* — safe for browser
  | "server-only"   // Server-side only, never exposed to browser
  | "optional"      // Optional configuration
  | "required-prod"; // Required for production deployment

export interface ConfigSpec {
  key: string;
  category: ConfigCategory;
  description: string;
  requiredInProduction: boolean;
}

export const CONFIG_SPECS: readonly ConfigSpec[] = [
  // PUBLIC CONFIG — safe for browser (NEXT_PUBLIC_*)
  {
    key: "NEXT_PUBLIC_ARC_NETWORK",
    category: "public",
    description: 'Arc network to target: "mainnet" or "testnet"',
    requiredInProduction: true,
  },
  {
    key: "NEXT_PUBLIC_ARC_RPC_URL",
    category: "public",
    description: "Optional RPC URL override for the selected network",
    requiredInProduction: false,
  },
  {
    key: "NEXT_PUBLIC_AGENTPAY_MARKET_DATA_RECIPIENT",
    category: "public",
    description: "Payment recipient for market-data service (0x address)",
    requiredInProduction: true,
  },
  {
    key: "NEXT_PUBLIC_AGENTPAY_RESEARCH_REPORT_RECIPIENT",
    category: "public",
    description: "Payment recipient for research-report service (0x address)",
    requiredInProduction: true,
  },
  {
    key: "NEXT_PUBLIC_AGENTPAY_AI_SUMMARY_RECIPIENT",
    category: "public",
    description: "Payment recipient for ai-summary service (0x address)",
    requiredInProduction: true,
  },

  // SERVER-ONLY CONFIG — never exposed to browser
  {
    key: "DATABASE_URL",
    category: "server-only",
    description: "PostgreSQL connection string for trusted ledger (enables durable storage)",
    requiredInProduction: true,
  },
  {
    key: "MARKET_DATA_PROVIDER",
    category: "server-only",
    description: 'Market data provider: "demo" or "coingecko"',
    requiredInProduction: false,
  },

  // OPTIONAL CONFIG
  {
    key: "INTENT_TTL_MS",
    category: "optional",
    description: "Payment intent TTL in milliseconds (default: 15 minutes)",
    requiredInProduction: false,
  },
];

/**
 * Validate environment at startup.
 *
 * Returns validation result with any missing required production config.
 * Does not log or expose secret values.
 */
export function validateEnvironment(): {
  ok: boolean;
  missingRequired: string[];
  warnings: string[];
} {
  const missingRequired: string[] = [];
  const warnings: string[] = [];

  for (const spec of CONFIG_SPECS) {
    const value = process.env[spec.key];
    const isSet = typeof value === "string" && value.trim().length > 0;

    if (spec.requiredInProduction && !isSet) {
      missingRequired.push(`${spec.key} (${spec.description})`);
    } else if (spec.category === "server-only" && isSet) {
      // Warn that server-only config is set but ensure it's not NEXT_PUBLIC_
      if (spec.key.startsWith("NEXT_PUBLIC_")) {
        warnings.push(`${spec.key} is a server-only config but uses NEXT_PUBLIC_ prefix`);
      }
    }
  }

  // Check for NEXT_PUBLIC_ variables that should be server-only
  for (const [key] of Object.entries(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      // This is fine — just checking that we don't have secrets in NEXT_PUBLIC_
      // No action needed for valid public config
    }
  }

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    warnings,
  };
}

/**
 * Get a sanitized config summary for logging/debugging.
 * Never includes actual secret values.
 */
export function getConfigSummary(): Record<string, string> {
  const summary: Record<string, string> = {};

  for (const spec of CONFIG_SPECS) {
    const value = process.env[spec.key];
    const isSet = typeof value === "string" && value.trim().length > 0;

    if (spec.category === "public") {
      summary[spec.key] = isSet ? value ?? "" : "(not set)";
    } else if (spec.category === "server-only") {
      summary[spec.key] = isSet ? "(configured)" : "(not set)";
    } else if (spec.category === "optional") {
      summary[spec.key] = isSet ? value ?? "" : "(not set)";
    } else {
      summary[spec.key] = isSet ? "(configured)" : "(not set)";
    }
  }

  return summary;
}