import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Squad, UpdateSquadRequest } from "@multica/core/types";
import { api } from "@/data/api";
import { useWorkspaceStore } from "@/data/workspace-store";

export function useUpdateSquad(squadId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["updateSquad", squadId] as const,
    mutationFn: (patch: UpdateSquadRequest) => api.updateSquad(squadId, patch),
    onMutate: async (patch) => {
      const detailKey = ["squad", squadId] as const;
      const listKey = ["squads", wsId] as const;

      await Promise.all([
        qc.cancelQueries({ queryKey: detailKey }),
        qc.cancelQueries({ queryKey: listKey }),
      ]);

      const prevDetail = qc.getQueryData<Squad>(detailKey);
      const prevList = qc.getQueryData<Squad[]>(listKey);

      if (prevDetail) {
        qc.setQueryData<Squad>(detailKey, { ...prevDetail, ...patch });
      }
      qc.setQueryData<Squad[]>(listKey, (old) =>
        old
          ? old.map((squad) =>
              squad.id === squadId ? { ...squad, ...patch } : squad,
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
      qc.setQueryData<Squad>(["squad", squadId], server);
      qc.setQueryData<Squad[]>(["squads", wsId], (old) =>
        old
          ? old.map((squad) => (squad.id === squadId ? server : squad))
          : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["squad", squadId] });
      qc.invalidateQueries({ queryKey: ["squads", wsId] });
    },
  });
}
