/**
 * "My Issues" tab. Three scopes — assigned / created / agents — mirroring
 * web's `packages/views/my-issues/components/my-issues-page.tsx:48-65`. The
 * `agents` scope label is "Agents and Squads" because the backend predicate
 * (`involves_user_id`, MUL-2397) surfaces both the user's owned agents and
 * squads they're involved in (member / leader / has an owned agent inside).
 *
 * Issues are grouped by status using SectionList in `BOARD_STATUSES` order;
 * empty status sections are filtered out so the screen doesn't fill with
 * "(0)" headers. Section grouping uses `BOARD_STATUSES` (cancelled excluded)
 * to match web — same source `packages/views/my-issues/components/my-issues-page.tsx:117-125`.
 *
 * Status + Priority filters mirror web's MyIssuesHeader filter sub-menus.
 * Filter state lives in `useMyIssuesViewStore` and is cleared on workspace
 * change via the shared `useClearFiltersOnWorkspaceChange` hook.
 */
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, SectionList, View } from "react-native";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Issue, IssuePriority, IssueStatus } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/ui/header";
import { HeaderActions } from "@/components/ui/app-header-actions";
import { StatusIcon } from "@/components/ui/status-icon";
import { IssueRow } from "@/components/issue/issue-row";
import { IssuesLoading } from "@/components/issue/issues-loading";
import {
  buildMyIssuesFilter,
  myIssueListOptions,
  type MyIssuesSortBy,
  type MyIssuesSortDirection,
} from "@/data/queries/my-issues";
import type { MyIssuesScope } from "@/data/queries/issue-keys";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useMyIssuesViewStore } from "@/data/stores/my-issues-view-store";
import { useClearFiltersOnWorkspaceChange } from "@/lib/use-clear-filters-on-workspace-change";
import {
  BOARD_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
} from "@/lib/issue-status";
import { filterIssues } from "@/lib/filter-issues";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

// Mobile pill row has tight width on SE3 (375pt). Three pills + Filter icon
// must fit in 343pt usable space, so the agents scope renders "Agents" — the
// full "Agents and Squads" label (~135pt) blows past safe limits and breaks
// under Dynamic Type. Semantics unchanged: same backend predicate
// (`involves_user_id`, MUL-2397) covers owned agents + related squads; the
// empty state copy still says "agents or squads".
const SCOPES: { value: MyIssuesScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "assigned", label: "Assigned" },
  { value: "created", label: "Created" },
  { value: "agents", label: "Agents" },
];

type IssueSection = { status: IssueStatus; data: Issue[] };

export default function MyIssues() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);

  const scope = useMyIssuesViewStore((s) => s.scope);
  const setScope = useMyIssuesViewStore((s) => s.setScope);
  const sortBy = useMyIssuesViewStore((s) => s.sortBy);
  const sortDirection = useMyIssuesViewStore((s) => s.sortDirection);
  const statusFilters = useMyIssuesViewStore((s) => s.statusFilters);
  const priorityFilters = useMyIssuesViewStore((s) => s.priorityFilters);
  const restorePersisted = useMyIssuesViewStore((s) => s.restorePersisted);

  // Restore persisted scope and sort on mount so the last selection survives restarts.
  useEffect(() => {
    restorePersisted();
  }, [restorePersisted]);

  const openFilter = () => {
    if (!wsSlug) return;
    router.push({
      pathname: "/[workspace]/issues-filter",
      params: { workspace: wsSlug, scope: "my" },
    });
  };

  useClearFiltersOnWorkspaceChange(
    useMyIssuesViewStore.getState().clearFilters,
    wsId,
  );

  const filter = useMemo(
    () => (userId ? buildMyIssuesFilter(scope, userId) : { assignee_id: "" }),
    [scope, userId],
  );

  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isRefetching, isPlaceholderData } =
    useQuery({
      ...myIssueListOptions(wsId, scope, filter, userId ?? undefined, sortBy, sortDirection),
      enabled: !!wsId && !!userId,
      // Keep the previous scope's rows on screen while a not-yet-cached
      // scope loads (dimmed below) instead of flashing the full skeleton.
      placeholderData: keepPreviousData,
    });
  const loaded = data !== undefined && !isPlaceholderData;

  // Once the visible scope has landed, warm the sibling scopes so tapping
  // another pill reads straight from cache. "all" goes first: its queryFn
  // fetches assigned/created/agents through their own cache entries, so
  // the single-scope prefetches below dedupe against those requests.
  useEffect(() => {
    if (!loaded || !wsId || !userId) return;
    const order: MyIssuesScope[] = ["all", "assigned", "created", "agents"];
    for (const s of order) {
      if (s === scope) continue;
      void qc.prefetchQuery(
        myIssueListOptions(
          wsId,
          s,
          buildMyIssuesFilter(s, userId),
          userId,
          sortBy,
          sortDirection,
        ),
      );
    }
  }, [loaded, qc, wsId, userId, scope, sortBy, sortDirection]);

  // Apply client-side status + priority filter. Mirrors the predicate at
  // packages/views/issues/utils/filter.ts:30-34 via filterIssues().
  const filtered = useMemo(
    () => filterIssues(data ?? [], statusFilters, priorityFilters),
    [data, statusFilters, priorityFilters],
  );

  // When statusFilters is non-empty, intersect visible status order with it
  // so hidden statuses don't render an empty section header. Uses
  // BOARD_STATUSES (cancelled excluded) to match web.
  const sections = useMemo<IssueSection[]>(() => {
    if (filtered.length === 0) return [];
    const byStatus = new Map<IssueStatus, Issue[]>();
    for (const issue of filtered) {
      const list = byStatus.get(issue.status);
      if (list) list.push(issue);
      else byStatus.set(issue.status, [issue]);
    }
    const visibleStatuses = statusFilters.length > 0
      ? BOARD_STATUSES.filter((s) => statusFilters.includes(s))
      : BOARD_STATUSES;
    return visibleStatuses
      .map((status) => ({ status, data: byStatus.get(status) ?? [] }))
      .filter((s) => s.data.length > 0);
  }, [filtered, statusFilters]);

  const hasActiveFilters =
    statusFilters.length > 0 || priorityFilters.length > 0;

  const showEmptyState =
    !isLoading && !error && filtered.length === 0;

  return (
    <View className="flex-1 bg-background">
      <Header title="My Issues" right={<HeaderActions />} />
      <ScopeToolbar
        scopes={SCOPES}
        scope={scope}
        onChange={(v) => setScope(v)}
        onOpenFilter={openFilter}
        hasActiveFilters={hasActiveFilters}
        sortBy={sortBy}
        sortDirection={sortDirection}
      />
      {hasActiveFilters ? (
        <ActiveFilterChips
          statusFilters={statusFilters}
          priorityFilters={priorityFilters}
          onClearStatus={(s) =>
            useMyIssuesViewStore.getState().toggleStatusFilter(s)
          }
          onClearPriority={(p) =>
            useMyIssuesViewStore.getState().togglePriorityFilter(p)
          }
        />
      ) : null}
      {isLoading ? (
        <IssuesLoading />
      ) : error ? (
        <View className="px-4 gap-3 pt-4">
          <Text className="text-sm text-destructive">
            Failed to load issues:{" "}
            {error instanceof Error ? error.message : "unknown error"}
          </Text>
          <Button variant="outline" onPress={() => refetch()}>
            <Text>Retry</Text>
          </Button>
        </View>
      ) : showEmptyState ? (
        <EmptyState
          message={
            hasActiveFilters
              ? "No issues match the current filters."
              : emptyMessageForScope(scope)
          }
        />
      ) : (
        <SectionList
          style={isPlaceholderData ? { opacity: 0.5 } : undefined}
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() => (
            <View className="h-px bg-border ml-4" />
          )}
          renderSectionHeader={({ section }) => (
            <SectionHeader
              status={section.status}
              count={section.data.length}
            />
          )}
          contentContainerClassName="pb-6"
          renderItem={({ item }) => (
            <IssueRow
              issue={item}
              onPress={() => {
                if (wsSlug) router.push(`/${wsSlug}/issue/${item.id}`);
              }}
            />
          )}
          refreshing={isRefetching && !isPlaceholderData}
          onRefresh={refetch}
        />
      )}

    </View>
  );
}

/**
 * Outline icon button matching the pill height so the toolbar row reads as
 * one visual group. Mirrors web `IssuesHeader` / `MyIssuesHeader` filter
 * trigger (`packages/views/my-issues/components/my-issues-header.tsx:174`),
 * which is also `variant="outline"` + icon-sized — NOT the ghost-style we'd
 * get from <IconButton>. Square (`w-9`) with `px-0` to suppress the sm
 * default `px-3`.
 */
function FilterButton({
  onPress,
  hasActiveFilters,
}: {
  onPress: () => void;
  hasActiveFilters: boolean;
}) {
  const { colorScheme } = useColorScheme();
  return (
    <View style={{ position: "relative" }} className="ml-2">
      <Button
        variant="outline"
        size="sm"
        onPress={onPress}
        accessibilityLabel="Filter"
        className="w-9 px-0"
      >
        <Ionicons
          name="options-outline"
          size={16}
          color={THEME[colorScheme].mutedForeground}
        />
      </Button>
      {hasActiveFilters ? (
        <View
          pointerEvents="none"
          className="absolute top-1 right-1 size-1.5 rounded-full bg-brand"
        />
      ) : null}
    </View>
  );
}

/**
 * Toolbar row mirroring web `MyIssuesHeader` / `IssuesHeader`
 * (`packages/views/my-issues/components/my-issues-header.tsx:138-163`):
 * left-aligned scope pill group + right-side Filter icon (red dot when
 * filters are active). Replaces the previous full-width segmented tabs +
 * Filter-in-title-bar split — keeps scope and the filter affordance in the
 * same row, because they both control the list directly below.
 */
function ScopeToolbar<S extends string>({
  scopes,
  scope,
  onChange,
  onOpenFilter,
  hasActiveFilters,
  sortBy,
  sortDirection,
}: {
  scopes: { value: S; label: string }[];
  scope: S;
  onChange: (value: S) => void;
  onOpenFilter: () => void;
  hasActiveFilters: boolean;
  sortBy: MyIssuesSortBy;
  sortDirection: MyIssuesSortDirection;
}) {
  const [sortVisible, setSortVisible] = useState(false);

  return (
    <>
      <View className="flex-row items-center pt-2 pb-2 pr-4">
        {/* Pills scroll horizontally so the fourth scope never gets
            squeezed under the sort / filter buttons on narrow screens. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-1"
          contentContainerClassName="items-center gap-1 pl-4 pr-2"
        >
          {scopes.map((s) => {
            const active = scope === s.value;
            return (
              <Button
                key={s.value}
                variant="outline"
                size="sm"
                onPress={() => onChange(s.value)}
                className={active ? "bg-accent" : ""}
                accessibilityState={{ selected: active }}
              >
                <Text
                  numberOfLines={1}
                  className={active ? "text-accent-foreground" : "text-muted-foreground"}
                >
                  {s.label}
                </Text>
              </Button>
            );
          })}
        </ScrollView>
        <View className="flex-row items-center gap-1">
          <SortButton
            onPress={() => setSortVisible(true)}
            sortBy={sortBy}
            sortDirection={sortDirection}
          />
          <FilterButton
            onPress={onOpenFilter}
            hasActiveFilters={hasActiveFilters}
          />
        </View>
      </View>
      <SortPickerModal
        visible={sortVisible}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onClose={() => setSortVisible(false)}
      />
    </>
  );
}

const SORT_OPTIONS: {
  key: string;
  label: string;
  sortBy: MyIssuesSortBy;
  sortDirection: MyIssuesSortDirection;
}[] = [
  { key: "created_desc", label: "Created (Newest)", sortBy: "created_at", sortDirection: "desc" },
  { key: "created_asc", label: "Created (Oldest)", sortBy: "created_at", sortDirection: "asc" },
  { key: "updated_desc", label: "Updated (Newest)", sortBy: "updated_at", sortDirection: "desc" },
  { key: "updated_asc", label: "Updated (Oldest)", sortBy: "updated_at", sortDirection: "asc" },
  { key: "start_asc", label: "Start Date (Soonest)", sortBy: "start_date", sortDirection: "asc" },
  { key: "start_desc", label: "Start Date (Latest)", sortBy: "start_date", sortDirection: "desc" },
  { key: "due_asc", label: "Due Date (Soonest)", sortBy: "due_date", sortDirection: "asc" },
  { key: "due_desc", label: "Due Date (Latest)", sortBy: "due_date", sortDirection: "desc" },
];

function SortButton({
  onPress,
  sortBy,
  sortDirection,
}: {
  onPress: () => void;
  sortBy: MyIssuesSortBy;
  sortDirection: MyIssuesSortDirection;
}) {
  const { colorScheme } = useColorScheme();
  const isDefault = sortBy === "created_at" && sortDirection === "desc";
  return (
    <View style={{ position: "relative" }}>
      <Button
        variant="outline"
        size="sm"
        onPress={onPress}
        accessibilityLabel="Sort"
        className="w-9 px-0"
      >
        <Ionicons
          name={sortDirection === "asc" ? "arrow-up" : "arrow-down"}
          size={16}
          color={isDefault ? THEME[colorScheme].mutedForeground : THEME[colorScheme].primary}
        />
      </Button>
      {!isDefault ? (
        <View
          pointerEvents="none"
          className="absolute top-1 right-1 size-1.5 rounded-full bg-brand"
        />
      ) : null}
    </View>
  );
}

function SortPickerModal({
  visible,
  sortBy,
  sortDirection,
  onClose,
}: {
  visible: boolean;
  sortBy: MyIssuesSortBy;
  sortDirection: MyIssuesSortDirection;
  onClose: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const checkColor = THEME[colorScheme].primary;
  const setSortBy = useMyIssuesViewStore((s) => s.setSortBy);
  const setSortDirection = useMyIssuesViewStore((s) => s.setSortDirection);
  const currentKey = `${sortBy === "created_at" ? "created" : sortBy === "updated_at" ? "updated" : sortBy === "start_date" ? "start" : "due"}_${sortDirection}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose}>
        <View className="flex-1 items-center justify-center px-6">
          <Pressable onPress={() => {}} className="w-full max-w-sm">
            <View className="bg-popover rounded-2xl overflow-hidden">
              <View className="px-4 py-3 border-b border-border">
                <Text className="text-base font-semibold text-foreground">
                  Sort by
                </Text>
              </View>
              <View className="px-2 py-1">
                {SORT_OPTIONS.map((opt) => {
                  const selected = opt.key === currentKey;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        setSortBy(opt.sortBy);
                        setSortDirection(opt.sortDirection);
                        onClose();
                      }}
                      className="flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-secondary"
                    >
                      <Ionicons
                        name={opt.sortDirection === "asc" ? "arrow-up" : "arrow-down"}
                        size={16}
                        color={THEME[colorScheme].mutedForeground}
                      />
                      <Text className="flex-1 text-base text-foreground">
                        {opt.label}
                      </Text>
                      {selected ? (
                        <Ionicons name="checkmark" size={20} color={checkColor} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function ActiveFilterChips({
  statusFilters,
  priorityFilters,
  onClearStatus,
  onClearPriority,
}: {
  statusFilters: IssueStatus[];
  priorityFilters: IssuePriority[];
  onClearStatus: (s: IssueStatus) => void;
  onClearPriority: (p: IssuePriority) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5 px-4 pb-2">
      {statusFilters.map((s) => (
        <Chip key={`s-${s}`} label={STATUS_LABEL[s]} onClear={() => onClearStatus(s)} />
      ))}
      {priorityFilters.map((p) => (
        <Chip key={`p-${p}`} label={PRIORITY_LABEL[p]} onClear={() => onClearPriority(p)} />
      ))}
    </View>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  const { colorScheme } = useColorScheme();
  return (
    <Pressable
      onPress={onClear}
      className="flex-row items-center gap-1 pl-2.5 pr-2 py-1 rounded-full border border-border bg-secondary/40 active:bg-secondary"
    >
      <Text className="text-xs text-foreground">{label}</Text>
      <Ionicons
        name="close"
        size={12}
        color={THEME[colorScheme].mutedForeground}
      />
    </Pressable>
  );
}

function SectionHeader({
  status,
  count,
}: {
  status: IssueStatus;
  count: number;
}) {
  return (
    <View className="flex-row items-center gap-2 px-4 py-2 bg-background">
      <StatusIcon status={status} size={14} />
      <Text className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {STATUS_LABEL[status]}
      </Text>
      <Text className="text-xs text-muted-foreground/60">{count}</Text>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-sm text-muted-foreground text-center">
        {message}
      </Text>
    </View>
  );
}

function emptyMessageForScope(scope: MyIssuesScope): string {
  switch (scope) {
    case "all":
      return "No issues involving you yet.";
    case "assigned":
      return "No issues assigned to you.";
    case "created":
      return "You haven't created any issues.";
    case "agents":
      return "No issues assigned to your agents or squads yet.";
  }
}

