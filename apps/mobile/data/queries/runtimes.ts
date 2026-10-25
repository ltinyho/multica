import { queryOptions } from "@tanstack/react-query";
import type { RuntimeModelsResult } from "@multica/core/types";
import { api } from "@/data/api";

// Runtime list — workspace-scoped. Feeds the availability dimension of the
// presence dot via @multica/core/agents/derive-presence (status + last_seen_at).
// Invalidated by daemon:register / sweeper-driven status changes; see
// data/realtime/use-presence-realtime.ts.
export const runtimeListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: ["runtimes", wsId] as const,
    queryFn: ({ signal }) => api.listRuntimes({ signal }),
    enabled: !!wsId,
  });

export const runtimeModelsKeys = {
  all: () => ["runtimes", "models"] as const,
  forRuntime: (runtimeId: string) =>
    [...runtimeModelsKeys.all(), runtimeId] as const,
};

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("model discovery cancelled"));
      },
      { once: true },
    );
  });
}

async function resolveRuntimeModels(
  runtimeId: string,
  signal?: AbortSignal,
): Promise<RuntimeModelsResult> {
  const initial = await api.initiateListModels(runtimeId, { signal });
  if (!initial.id) throw new Error(initial.error || "model discovery failed");

  const start = Date.now();
  let current = initial;
  while (current.status === "pending" || current.status === "running") {
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error("model discovery timed out");
    }
    await sleep(POLL_INTERVAL_MS, signal);
    current = await api.getListModelsResult(runtimeId, initial.id, { signal });
  }

  if (current.status === "failed" || current.status === "timeout") {
    throw new Error(current.error || "model discovery failed");
  }
  return { models: current.models ?? [], supported: current.supported };
}

export const runtimeModelsOptions = (runtimeId: string | null | undefined) =>
  queryOptions({
    queryKey: runtimeId
      ? runtimeModelsKeys.forRuntime(runtimeId)
      : runtimeModelsKeys.all(),
    queryFn: ({ signal }) => resolveRuntimeModels(runtimeId as string, signal),
    enabled: !!runtimeId,
    staleTime: 60_000,
    retry: false,
  });
