import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";

export const autopilotListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: ["autopilots", wsId] as const,
    queryFn: () => api.listAutopilots(),
    enabled: !!wsId,
  });
