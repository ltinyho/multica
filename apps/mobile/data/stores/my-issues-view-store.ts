/**
 * Mobile-only zustand store for the My Issues view (scope + status/priority
 * filters). Mirrors the field shape of web's
 * `packages/core/issues/stores/my-issues-view-store.ts` so the same filter
 * input produces the same visible issue set on both clients (the "same N
 * rule" in apps/mobile/CLAUDE.md). Mobile cannot import core's runtime, so
 * this is re-implemented locally.
 *
 * Empty filter array = "show all" (matches web's predicate semantics in
 * packages/views/issues/utils/filter.ts).
 *
 * Scope selection is persisted to SecureStore so the user's last choice
 * survives app restarts (matches the workspace-slug persistence pattern
 * in workspace-store.ts). Status/priority filters stay in-memory — they
 * are transient per-session concerns.
 */
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { IssuePriority, IssueStatus } from "@multica/core/types";
import type { MyIssuesScope } from "@/data/queries/issue-keys";
import type { MyIssuesSortBy, MyIssuesSortDirection } from "@/data/queries/my-issues";

const SCOPE_KEY = "multica_my_issues_scope";
const SORT_BY_KEY = "multica_my_issues_sort_by";
const SORT_DIR_KEY = "multica_my_issues_sort_dir";

interface MyIssuesViewState {
  scope: MyIssuesScope;
  sortBy: MyIssuesSortBy;
  sortDirection: MyIssuesSortDirection;
  statusFilters: IssueStatus[];
  priorityFilters: IssuePriority[];
  setScope: (scope: MyIssuesScope) => void;
  setSortBy: (sortBy: MyIssuesSortBy) => void;
  setSortDirection: (dir: MyIssuesSortDirection) => void;
  toggleStatusFilter: (status: IssueStatus) => void;
  togglePriorityFilter: (priority: IssuePriority) => void;
  clearFilters: () => void;
  /** Restore persisted scope and sort from SecureStore on cold start. */
  restorePersisted: () => Promise<void>;
}

export const useMyIssuesViewStore = create<MyIssuesViewState>((set) => ({
  scope: "assigned",
  sortBy: "created_at",
  sortDirection: "desc",
  statusFilters: [],
  priorityFilters: [],
  setScope: (scope) => {
    set({ scope });
    SecureStore.setItemAsync(SCOPE_KEY, scope);
  },
  setSortBy: (sortBy) => {
    set({ sortBy });
    SecureStore.setItemAsync(SORT_BY_KEY, sortBy);
  },
  setSortDirection: (sortDirection) => {
    set({ sortDirection });
    SecureStore.setItemAsync(SORT_DIR_KEY, sortDirection);
  },
  toggleStatusFilter: (status) =>
    set((state) => ({
      statusFilters: state.statusFilters.includes(status)
        ? state.statusFilters.filter((s) => s !== status)
        : [...state.statusFilters, status],
    })),
  togglePriorityFilter: (priority) =>
    set((state) => ({
      priorityFilters: state.priorityFilters.includes(priority)
        ? state.priorityFilters.filter((p) => p !== priority)
        : [...state.priorityFilters, priority],
    })),
  clearFilters: () => set({ statusFilters: [], priorityFilters: [] }),
  restorePersisted: async () => {
    const [savedScope, savedSortBy, savedSortDir] = await Promise.all([
      SecureStore.getItemAsync(SCOPE_KEY),
      SecureStore.getItemAsync(SORT_BY_KEY),
      SecureStore.getItemAsync(SORT_DIR_KEY),
    ]);
    const patch: Partial<Pick<MyIssuesViewState, "scope" | "sortBy" | "sortDirection">> = {};
    if (savedScope === "all" || savedScope === "assigned" || savedScope === "created" || savedScope === "agents") {
      patch.scope = savedScope;
    }
    if (savedSortBy === "created_at" || savedSortBy === "updated_at" || savedSortBy === "start_date" || savedSortBy === "due_date") {
      patch.sortBy = savedSortBy;
    }
    if (savedSortDir === "asc" || savedSortDir === "desc") {
      patch.sortDirection = savedSortDir;
    }
    if (Object.keys(patch).length > 0) set(patch);
  },
}));
