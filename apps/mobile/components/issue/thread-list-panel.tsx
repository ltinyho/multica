/**
 * Thread list panel — a modal overlay that shows all comment threads on an
 * issue. Lets the user quickly see how many threads exist, jump to any
 * thread's latest reply, and toggle resolved/expanded state.
 *
 * Resolved threads are collapsed by default in the panel. Each row shows:
 *   - Author name + reply count + resolved badge
 *   - Last reply timestamp
 *   - Tap → scrolls timeline to that thread's last reply + highlights
 */
import { useMemo, useState } from "react";
import { Pressable, View, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TimelineEntry } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { useActorLookup } from "@/data/use-actor-name";
import { timeAgo } from "@/lib/time-ago";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { TimelineRow } from "@/lib/timeline-thread";

interface ThreadInfo {
  root: TimelineEntry;
  replies: TimelineEntry[];
  lastEntry: TimelineEntry;
  resolved: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  rows: TimelineRow[];
  /** Called when the user taps a thread — should scroll the timeline to
   *  that thread's last entry and highlight it. */
  onJumpToThread: (commentId: string) => void;
  /** Called when the user taps the resolve/unresolve button on a thread. */
  onResolve: (commentId: string, resolved: boolean) => void;
  topInset?: number;
  bottomInset?: number;
}

export function ThreadListPanel({
  visible,
  onClose,
  rows,
  onJumpToThread,
  onResolve,
  topInset = 0,
  bottomInset = 0,
}: Props) {
  const { colorScheme } = useColorScheme();
  const mutedFg = THEME[colorScheme].mutedForeground;

  // Extract only comment-type rows (skip activity rows).
  const threads = useMemo<ThreadInfo[]>(() => {
    return rows
      .filter((r) => r.entry.type === "comment")
      .map((r) => {
        const allEntries = [r.entry, ...r.replies];
        const lastEntry = allEntries[allEntries.length - 1];
        return {
          root: r.entry,
          replies: r.replies,
          lastEntry,
          resolved: !!r.entry.resolved_at,
        };
      });
  }, [rows]);

  const openThreads = threads.filter((t) => !t.resolved);
  const resolvedThreads = threads.filter((t) => t.resolved);
  const totalThreads = threads.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: topInset, paddingBottom: bottomInset }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/60">
          <View className="flex-row items-center gap-2">
            <Ionicons name="chatbubbles-outline" size={20} color={mutedFg} />
            <Text className="text-lg font-semibold">
              Threads
            </Text>
            <View className="min-w-[20px] h-5 px-1.5 rounded-full bg-secondary items-center justify-center">
              <Text className="text-xs leading-4 font-medium text-muted-foreground">
                {totalThreads}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="p-1"
            accessibilityLabel="Close thread list"
          >
            <Ionicons name="close" size={24} color={mutedFg} />
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 12 }}>
          {totalThreads === 0 ? (
            <View className="flex-1 items-center justify-center py-20">
              <Ionicons name="chatbubbles-outline" size={40} color={mutedFg} />
              <Text className="text-sm text-muted-foreground mt-3">
                No threads yet
              </Text>
            </View>
          ) : (
            <>
              {/* Open threads */}
              {openThreads.length > 0 && (
                <ThreadSection
                  label="Open"
                  threads={openThreads}
                  defaultExpanded
                  onJumpToThread={onJumpToThread}
                  onResolve={onResolve}
                />
              )}
              {/* Resolved threads — collapsed by default */}
              {resolvedThreads.length > 0 && (
                <ThreadSection
                  label="Resolved"
                  threads={resolvedThreads}
                  defaultExpanded={false}
                  onJumpToThread={onJumpToThread}
                  onResolve={onResolve}
                />
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ThreadSection({
  label,
  threads,
  defaultExpanded,
  onJumpToThread,
  onResolve,
}: {
  label: string;
  threads: ThreadInfo[];
  defaultExpanded: boolean;
  onJumpToThread: (commentId: string) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { colorScheme } = useColorScheme();
  const mutedFg = THEME[colorScheme].mutedForeground;

  return (
    <View>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
      >
        <View className="flex-row items-center gap-2">
          <Ionicons
            name={expanded ? "chevron-down" : "chevron-forward"}
            size={16}
            color={mutedFg}
          />
          <Text className="text-sm font-semibold text-foreground">
            {label}
          </Text>
          <View className="min-w-[18px] h-[18px] px-1 rounded bg-secondary items-center justify-center">
            <Text className="text-[10px] leading-3 font-medium text-muted-foreground">
              {threads.length}
            </Text>
          </View>
        </View>
      </Pressable>
      {expanded
        ? threads.map((t) => (
            <ThreadRow
              key={t.root.id}
              thread={t}
              onJumpToThread={onJumpToThread}
              onResolve={onResolve}
            />
          ))
        : null}
    </View>
  );
}

function ThreadRow({
  thread,
  onJumpToThread,
  onResolve,
}: {
  thread: ThreadInfo;
  onJumpToThread: (commentId: string) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
}) {
  const { getName } = useActorLookup();
  const { colorScheme } = useColorScheme();
  const mutedFg = THEME[colorScheme].mutedForeground;

  const rootName = getName(
    thread.root.actor_type as "member" | "agent" | null | undefined,
    thread.root.actor_id,
  );
  const replyCount = thread.replies.length;
  const total = 1 + replyCount;
  const lastReply = thread.replies.length > 0 ? thread.replies[thread.replies.length - 1] : null;

  const handlePress = () => {
    // Jump to the last entry in this thread.
    const targetId = lastReply ? lastReply.id : thread.root.id;
    onJumpToThread(targetId);
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-3 px-4 py-3 ml-6 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={`Thread by ${rootName}, ${total} ${total === 1 ? "message" : "messages"}. Tap to jump.`}
    >
      <ActorAvatar
        type={thread.root.actor_type as "member" | "agent"}
        id={thread.root.actor_id}
        size={28}
      />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
            {rootName}
          </Text>
          {thread.resolved ? (
            <Ionicons name="checkmark-circle" size={14} color={mutedFg} />
          ) : null}
        </View>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {total} {total === 1 ? "message" : "messages"}
          {lastReply
            ? ` · last ${timeAgo(lastReply.created_at)}`
            : ` · ${timeAgo(thread.root.created_at)}`}
        </Text>
      </View>
      {/* Preview of last message */}
      <View className="flex-1 ml-2">
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {lastReply?.content?.replace(/\n/g, " ").slice(0, 60) ?? ""}
        </Text>
      </View>
      <Pressable
        onPress={() => onResolve(thread.root.id, !thread.resolved)}
        hitSlop={8}
        className="p-1.5"
        accessibilityLabel={thread.resolved ? "Unresolve thread" : "Resolve thread"}
      >
        <Ionicons
          name={thread.resolved ? "checkmark-circle" : "checkmark-circle-outline"}
          size={22}
          color={thread.resolved ? "#22c55e" : mutedFg}
        />
      </Pressable>
      <Ionicons name="chevron-forward" size={14} color={mutedFg} />
    </Pressable>
  );
}
