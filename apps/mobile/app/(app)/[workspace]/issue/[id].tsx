/**
 * Issue detail screen.
 *
 * Read-mostly timeline with an inline comment composer pinned to the
 * bottom (`<InlineCommentComposer>`). The composer is a single
 * `<TextInput>` + mention suggestion bar — no modal route, no toolbar,
 * no draft persistence. Sticks to the keyboard via `KeyboardStickyView`.
 *
 * Header note: the parent _layout.tsx already declares the `issue/[id]`
 * Stack.Screen with title "Issue". We override that here once the data
 * lands so the navigation bar shows `MUL-123` (Linear-style).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import type { Issue } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  TimelineList,
  type TimelineListHandle,
} from "@/components/issue/timeline-list";
import { AgentHeaderBadge } from "@/components/issue/agent-header-badge";
import { InlineCommentComposer } from "@/components/issue/inline-comment-composer";
import { ThreadListPanel } from "@/components/issue/thread-list-panel";
import { IssueDetailLoading } from "@/components/issue/issue-detail-loading";
import { buildTimelineRows } from "@/lib/timeline-thread";
import { coalesceTimeline } from "@/lib/timeline-coalesce";
import {
  findCachedIssue,
  issueDetailOptions,
  issueKeys,
  issueTimelineOptions,
} from "@/data/queries/issues";
import { useDeleteIssue, useResolveComment } from "@/data/mutations/issues";
import { pinListOptions } from "@/data/queries/pins";
import { useCreatePin, useDeletePin } from "@/data/mutations/pins";
import { useAuthStore } from "@/data/auth-store";
import { useIssueRealtime } from "@/data/realtime/use-issue-realtime";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useViewedIssuesStore } from "@/data/viewed-issues-store";
import { useCommentSelectStore } from "@/data/comment-select-store";
import { useReplyTargetStore } from "@/data/stores/reply-target-store";
import {
  showActionSheetWithOptions,
  type ActionSheetItem,
} from "@/lib/action-sheet";
import { WEB_URL } from "@/lib/urls";

export default function IssueDetail() {
  // `highlight` + `h` come from inbox deep-link (apps/mobile/app/(app)/
  // [workspace]/(tabs)/inbox.tsx). `highlight` is the target comment id;
  // `h` is a per-tap nonce so re-tapping the same row re-fires the
  // scroll-and-flash effect.
  const { id, workspace: wsSlug, highlight, h } = useLocalSearchParams<{
    id: string;
    workspace: string;
    highlight?: string;
    h?: string;
  }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  // Rows in My Issues / Issues / Project lists already carry the full
  // issue, so render that immediately and let `getIssue` refresh it in the
  // background — no blank screen between tap and first paint.
  const detail = useQuery({
    ...issueDetailOptions(wsId, id),
    placeholderData: () => findCachedIssue(qc, wsId, id),
  });
  const timeline = useQuery(issueTimelineOptions(wsId, id));
  const timelineRef = useRef<TimelineListHandle>(null);

  // Thread list panel state
  const [threadPanelVisible, setThreadPanelVisible] = useState(false);
  const timelineRows = useMemo(
    () =>
      timeline.data
        ? buildTimelineRows(coalesceTimeline(timeline.data))
        : [],
    [timeline.data],
  );
  const threadCount = useMemo(
    () => timelineRows.filter((r) => r.entry.type === "comment").length,
    [timelineRows],
  );

  // Subscribe to per-issue WS events: status/priority/assignee/label
  // changes, comments, activity, reactions, agent task progress.
  // Mounted with `id` — cleans up automatically on navigate-away.
  // If another client deletes the issue we're viewing, pop back so the
  // user isn't stranded on a 404 detail page.
  useIssueRealtime(id, () => router.back());

  // Track viewed issues so the chat composer's `@` suggestion bar can
  // surface "Recent" — the user just looked at MUL-123, likely wants to
  // ask the agent about it next. Workspace-scoped + in-memory; see
  // data/viewed-issues-store.ts.
  useEffect(() => {
    if (wsId && id) {
      useViewedIssuesStore.getState().push(wsId, id);
    }
  }, [wsId, id]);

  // Screen-scoped composer state — clear on unmount so re-entering the
  // issue starts from a clean slate (no stale text-selection comment id,
  // no stale "Replying to X" target). Both stores are singletons used by
  // the long-press action sheet.
  useEffect(() => {
    return () => {
      useCommentSelectStore.getState().clear();
      useReplyTargetStore.getState().clear();
    };
  }, []);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      detail.refetch(),
      qc.invalidateQueries({ queryKey: issueKeys.timeline(wsId, id) }),
    ]);
  }, [detail, qc, wsId, id]);

  const handleJumpToThread = useCallback(
    (commentId: string) => {
      setThreadPanelVisible(false);
      // Small delay to let the modal close before scrolling.
      setTimeout(() => timelineRef.current?.scrollToComment(commentId), 300);
    },
    [],
  );

  const issue = detail.data;
  const deleteIssue = useDeleteIssue();
  const resolveComment = useResolveComment(id);

  const handleResolveThread = useCallback(
    (commentId: string, resolved: boolean) => {
      resolveComment.mutate({ commentId, resolved });
    },
    [resolveComment],
  );
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { data: pins } = useQuery(pinListOptions(wsId, userId));
  const isPinned =
    !!issue &&
    !!pins?.some((p) => p.item_type === "issue" && p.item_id === issue.id);
  const createPin = useCreatePin();
  const deletePin = useDeletePin();

  // Three-dot menu in the header (visible when scrolled down):
  // full action list. The action bar's "More" button uses a trimmed
  // version that skips actions already visible in the bar.
  const onPressMore = useCallback(() => {
    if (!issue || !wsSlug) return;
    const issueLink = `${WEB_URL}/${wsSlug}/issues/${issue.id}`;
    const pinIcon = isPinned ? "pin-outline" : "pin";
    const options = [
      { label: "Cancel" },
      { label: isPinned ? "Unpin" : "Pin", icon: pinIcon },
      { label: "Edit details", icon: "create-outline" },
      { label: "Copy link", icon: "link-outline" },
      { label: "Open on web", icon: "globe-outline" },
      { label: "Jump to top", icon: "arrow-up-outline" },
      { label: "Jump to bottom", icon: "arrow-down-outline" },
      { label: "Delete issue", icon: "trash-outline" },
    ] satisfies ActionSheetItem[];
    const destructiveIndex = options.length - 1;
    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
        destructiveButtonIndex: destructiveIndex,
        title: issue.identifier,
      },
      (i) => {
        const label = options[i]?.label;
        if (label === "Pin") {
          createPin.mutate({ item_type: "issue", item_id: issue.id });
        } else if (label === "Unpin") {
          deletePin.mutate({ itemType: "issue", itemId: issue.id });
        } else if (label === "Edit details") {
          if (wsSlug) router.push(`/${wsSlug}/issue/${issue.id}/edit`);
        } else if (label === "Copy link" && issueLink) {
          Clipboard.setStringAsync(issueLink);
        } else if (label === "Open on web" && issueLink) {
          Linking.openURL(issueLink);
        } else if (label === "Jump to top") {
          timelineRef.current?.scrollToStart({ animated: true });
        } else if (label === "Jump to bottom") {
          timelineRef.current?.scrollToEnd({ animated: true });
        } else if (label === "Delete issue") {
          confirmDelete(issue, () =>
            deleteIssue.mutate(issue.id, {
              onSuccess: () => router.back(),
            }),
          );
        }
      },
    );
  }, [issue, wsSlug, deleteIssue, isPinned, createPin, deletePin]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: issue?.identifier ?? "Issue",
          headerBackTitle: "Back",
          headerRight: issue
            ? () => (
                <View className="flex-row items-center gap-2">
                  {/* Ambient agent-working badge — renders null when no
                   *  active tasks, so it doesn't crowd the header in the
                   *  common case. See agent-header-badge.tsx. */}
                  <AgentHeaderBadge issueId={id} />
                  {/* Thread list button — shows count badge when threads exist */}
                  {threadCount > 0 ? (
                    <Pressable
                      onPress={() => setThreadPanelVisible(true)}
                      hitSlop={8}
                      className="relative p-1"
                      accessibilityLabel={`${threadCount} threads`}
                    >
                      <Ionicons
                        name="chatbubbles-outline"
                        size={20}
                        className="text-foreground"
                      />
                      <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary items-center justify-center">
                        <Text className="text-[10px] leading-3 font-bold text-primary-foreground">
                          {threadCount}
                        </Text>
                      </View>
                    </Pressable>
                  ) : null}
                  <IconButton
                    name="ellipsis-horizontal"
                    onPress={onPressMore}
                    accessibilityLabel="Issue actions"
                  />
                </View>
              )
            : undefined,
        }}
      />
      {detail.isLoading ? (
        <IssueDetailLoading />
      ) : detail.error || !issue ? (
        <View className="flex-1 items-center justify-center px-6 gap-3">
          <Text className="text-sm text-destructive text-center">
            Failed to load issue:{" "}
            {detail.error instanceof Error
              ? detail.error.message
              : "not found"}
          </Text>
          <Button variant="outline" onPress={() => detail.refetch()}>
            <Text>Retry</Text>
          </Button>
        </View>
      ) : (
        <View className="flex-1">
          <TimelineList
            ref={timelineRef}
            issue={issue}
            entries={timeline.data}
            timelineLoading={timeline.isLoading}
            refreshing={
              (detail.isRefetching && !detail.isPlaceholderData) ||
              timeline.isRefetching
            }
            onRefresh={onRefresh}
            highlightCommentId={highlight}
            highlightNonce={h}
          />
          <InlineCommentComposer issueId={id} />
          <ThreadListPanel
            visible={threadPanelVisible}
            onClose={() => setThreadPanelVisible(false)}
            rows={timelineRows}
            onJumpToThread={handleJumpToThread}
            onResolve={handleResolveThread}
            topInset={insets.top}
            bottomInset={insets.bottom}
          />
        </View>
      )}
    </View>
  );
}

function confirmDelete(issue: Issue, onConfirm: () => void) {
  Alert.alert(
    "Delete issue?",
    `${issue.identifier} and its comments, reactions, and attachments will be permanently deleted. This cannot be undone.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirm },
    ],
  );
}
