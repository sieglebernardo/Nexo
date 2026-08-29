import type { HealthResponse } from "@nexo/contracts";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/health`, signal ? { signal } : undefined);

  if (!response.ok) {
    throw new Error(`API health request failed with status ${response.status}`);
  }

  return response.json() as Promise<HealthResponse>;
}
