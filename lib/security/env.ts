/**
 * Server runtime snapshot for security events.
 *
 * The runtime descriptor is emitted alongside every security event so
 * log aggregation can distinguish production from development traffic
 * without exposing environment values.
 */

export type ServerRuntime = "production" | "development" | "test";

/**
 * Cached at module load. The Node process can switch NODE_ENV in tests,
 * so callers may force a refresh.
 */
let cached: ServerRuntime | null = null;

function detect(): ServerRuntime {
  const env = process.env.NODE_ENV;
  if (env === "production") return "production";
  if (env === "test") return "test";
  return "development";
}

export function getServerRuntime(): ServerRuntime {
  if (cached) return cached;
  cached = detect();
  return cached;
}

/** Test seam. */
export function setServerRuntimeForTesting(runtime: ServerRuntime | null): void {
  cached = runtime;
}

/** Reset for tests. */
export function resetServerRuntimeCache(): void {
  cached = null;
}
