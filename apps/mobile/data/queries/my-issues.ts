/**
 * "My Issues" list, server-filtered by scope. Mirrors the scopes web exposes
 * in `packages/views/my-issues/components/my-issues-page.tsx:48-65`:
 *   - all:      union of assigned + created + agents (3-request fan-out,
 *               deduped client-side by issue id — same as web)
 *   - assigned: issues where assignee_id = me
 *   - created:  issues where creator_id  = me
 *   - agents:   issues where the assignee is an *indirect* extension of me —
 *               an owned agent, OR a squad I'm a human member of, lead, or
 *               have an owned agent inside. Driven server-side by the
 *               `involves_user_id` predicate (see MUL-2397, 2026-05-19).
 *               Direct member assignment is intentionally EXCLUDED — that's
 *               the `assigned` scope's meaning.
 *
 * The "all" scope is composed from the three per-scope queries (see the
 * queryFn below), so loading it also warms the other scope caches.
 *
 * Cache key shape is `issueKeys.myList(wsId, scope, filter)` — same prefix
 * as web's `packages/core/issues/queries.ts` so a future WS handler can
 * invalidate `issueKeys.myAll(wsId)` and reach both clients.
 */
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";
import type { Issue, ListIssuesParams } from "@multica/core/types";
import {
  issueKeys,
  type MyIssuesFilter,
  type MyIssuesScope,
} from "./issue-keys";

export function buildMyIssuesFilter(
  scope: MyIssuesScope,
  userId: string,
): MyIssuesFilter {
  switch (scope) {
    case "all":
      return {};
    case "assigned":
      return { assignee_id: userId };
    case "created":
      return { creator_id: userId };
    case "agents":
      return { involves_user_id: userId };
  }
}

// Sub-scopes whose union is the "all" scope. Mirrors web's
// `fetchAllMyFirstPages` in `packages/core/issues/queries.ts`.
const ALL_SUB_SCOPES = ["assigned", "created", "agents"] as const;

function dedupeById(lists: Issue[][]): Issue[] {
  const seen = new Set<string>();
  const merged: Issue[] = [];
  for (const issue of lists.flat()) {
    if (!seen.has(issue.id)) {
      seen.add(issue.id);
      merged.push(issue);
    }
  }
  return merged;
}

export type MyIssuesSortBy = "created_at" | "updated_at" | "start_date" | "due_date";
export type MyIssuesSortDirection = "asc" | "desc";

// `updated_at` sorting is client-only — the server doesn't support it.
// Send `created_at` as a fallback so the server returns a stable order,
// then we re-sort on the client when `sortBy === "updated_at"`.
function toServerSortBy(sortBy?: MyIssuesSortBy): ListIssuesParams["sort_by"] {
  if (sortBy === "updated_at") return "created_at";
  return sortBy;
}

export const myIssueListOptions = (
  wsId: string | null,
  scope: MyIssuesScope,
  filter: MyIssuesFilter,
  userId?: string,
  sortBy?: MyIssuesSortBy,
  sortDirection?: MyIssuesSortDirection,
) =>
  queryOptions({
    queryKey: [...issueKeys.myList(wsId, scope, filter), sortBy, sortDirection] as const,
    queryFn: async ({ signal, client }) => {
      const serverSortBy = toServerSortBy(sortBy);
      const sortParams = serverSortBy
        ? { sort_by: serverSortBy, sort_direction: sortDirection ?? "desc" as const }
        : {};
      let issues: Issue[];
      if (scope === "all" && userId) {
        // Fetch "all" through the per-scope queries so the three requests
        // also populate the Assigned / Created / Agents caches — switching
        // scope pills afterwards renders instantly. `staleTime: 0` keeps
        // pull-to-refresh on "all" a real refetch of every sub-scope.
        const lists = await Promise.all(
          ALL_SUB_SCOPES.map((sub) =>
            client.fetchQuery({
              ...myIssueListOptions(
                wsId,
                sub,
                buildMyIssuesFilter(sub, userId),
                userId,
                sortBy,
                sortDirection,
              ),
              staleTime: 0,
            }),
          ),
        );
        issues = dedupeById(lists);
      } else {
        const res = await api.listIssues({ ...filter, ...sortParams }, { signal });
        issues = res.issues;
      }
      // Apply client-side sorting for `updated_at` (server doesn't support it).
      if (sortBy === "updated_at") {
        const dir = sortDirection ?? "desc";
        issues = issues.toSorted((a, b) => {
          const cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          return dir === "desc" ? -cmp : cmp;
        });
      }
      return issues;
    },
    enabled: !!wsId,
  });
