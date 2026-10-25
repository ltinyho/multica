import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Agent, AgentTask, UpdateAgentRequest } from "@multica/core/types";
import { api } from "@/data/api";
import { useWorkspaceStore } from "@/data/workspace-store";

export function useUpdateAgent(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["updateAgent", agentId] as const,
    mutationFn: (patch: UpdateAgentRequest) => api.updateAgent(agentId, patch),
    onMutate: async (patch) => {
      const detailKey = ["agent", agentId] as const;
      const listKey = ["agents", wsId] as const;

      await Promise.all([
        qc.cancelQueries({ queryKey: detailKey }),
        qc.cancelQueries({ queryKey: listKey }),
      ]);

      const prevDetail = qc.getQueryData<Agent>(detailKey);
      const prevList = qc.getQueryData<Agent[]>(listKey);

      if (prevDetail) {
        qc.setQueryData<Agent>(detailKey, { ...prevDetail, ...patch });
      }
      qc.setQueryData<Agent[]>(listKey, (old) =>
        old
          ? old.map((agent) =>
              agent.id === agentId ? { ...agent, ...patch } : agent,
            )
          : old,
      );

      return { detailKey, listKey, prevDetail, prevList };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.prevDetail !== undefined) {
        qc.setQueryData(ctx.detailKey, ctx.prevDetail);
      }
      if (ctx.prevList !== undefined) {
        qc.setQueryData(ctx.listKey, ctx.prevList);
      }
    },
    onSuccess: (server) => {
      qc.setQueryData<Agent>(["agent", agentId], server);
      qc.setQueryData<Agent[]>(["agents", wsId], (old) =>
        old
          ? old.map((agent) => (agent.id === agentId ? server : agent))
          : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      qc.invalidateQueries({ queryKey: ["agents", wsId] });
    },
  });
}

export function useCancelAgentTasks(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["cancelAgentTasks", agentId] as const,
    mutationFn: () => api.cancelAgentTasks(agentId),
    onMutate: async () => {
      const snapshotKey = ["agent-task-snapshot", wsId] as const;
      const detailKey = ["agent", agentId] as const;
      const listKey = ["agents", wsId] as const;

      await Promise.all([
        qc.cancelQueries({ queryKey: snapshotKey }),
        qc.cancelQueries({ queryKey: detailKey }),
        qc.cancelQueries({ queryKey: listKey }),
      ]);

      const prevSnapshot = qc.getQueryData<AgentTask[]>(snapshotKey);
      const prevDetail = qc.getQueryData<Agent>(detailKey);
      const prevList = qc.getQueryData<Agent[]>(listKey);

      qc.setQueryData<AgentTask[]>(snapshotKey, (old) =>
        old ? old.filter((task) => task.agent_id !== agentId) : old,
      );
      if (prevDetail?.status === "working") {
        qc.setQueryData<Agent>(detailKey, { ...prevDetail, status: "idle" });
      }
      qc.setQueryData<Agent[]>(listKey, (old) =>
        old
          ? old.map((agent) =>
              agent.id === agentId && agent.status === "working"
                ? { ...agent, status: "idle" }
                : agent,
            )
          : old,
      );

      return { snapshotKey, detailKey, listKey, prevSnapshot, prevDetail, prevList };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.prevSnapshot !== undefined) {
        qc.setQueryData(ctx.snapshotKey, ctx.prevSnapshot);
      }
      if (ctx.prevDetail !== undefined) {
        qc.setQueryData(ctx.detailKey, ctx.prevDetail);
      }
      if (ctx.prevList !== undefined) {
        qc.setQueryData(ctx.listKey, ctx.prevList);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["agent-task-snapshot", wsId] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      qc.invalidateQueries({ queryKey: ["agents", wsId] });
    },
  });
}
