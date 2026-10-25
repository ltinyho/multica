/**
 * Sub-issues section for the issue detail screen.
 *
 * Shows a collapsible list of child issues with a progress ring and a
 * "+" button to create new sub-issues. Default collapsed per Linear iOS
 * convention — the user taps the header to expand.
 *
 * Each row renders: status icon · identifier · title · assignee avatar.
 * Tapping a row navigates to that child issue's detail screen.
 */
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import type { Issue } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { StatusIcon } from "@/components/ui/status-icon";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { childIssuesOptions } from "@/data/queries/issues";
import { useWorkspaceStore } from "@/data/workspace-store";

/** Small circular progress ring — filled arc from 0..1. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 5;
  const stroke = 1.5;
  const circumference = 2 * Math.PI * r;
  const progress = total > 0 ? done / total : 0;
  const offset = circumference * (1 - progress);
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Circle
        cx={7}
        cy={7}
        r={r}
        fill="none"
        stroke="hsl(240 3.7% 70%)"
        strokeWidth={stroke}
      />
      {progress > 0 ? (
        <Circle
          cx={7}
          cy={7}
          r={r}
          fill="none"
          stroke="hsl(221.2 83.2% 53.3%)"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 7 7)"
        />
      ) : null}
    </Svg>
  );
}

/** Single sub-issue row — status icon · identifier · title · assignee. */
function SubIssueRow({ child }: { child: Issue }) {
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const isDone = child.status === "done" || child.status === "cancelled";

  const onPress = useCallback(() => {
    if (!wsSlug) return;
    router.push(`/${wsSlug}/issue/${child.id}`);
  }, [wsSlug, child.id]);

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-2.5 px-3 py-2.5 active:bg-secondary/60"
    >
      <StatusIcon status={child.status} size={14} />
      <Text className="text-[11px] text-muted-foreground font-medium shrink-0 w-14">
        {child.identifier}
      </Text>
      <Text
        className={`flex-1 text-sm ${isDone ? "text-muted-foreground" : "text-foreground"}`}
        numberOfLines={1}
      >
        {child.title}
      </Text>
      {child.assignee_type && child.assignee_id ? (
        <ActorAvatar
          type={child.assignee_type}
          id={child.assignee_id}
          size={20}
        />
      ) : (
        <View className="size-5 rounded-full border border-dashed border-muted-foreground/30" />
      )}
    </Pressable>
  );
}

interface Props {
  issueId: string;
}

export function SubIssuesSection({ issueId }: Props) {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const [collapsed, setCollapsed] = useState(true);

  const { data: childIssues = [] } = useQuery(childIssuesOptions(wsId, issueId));

  const handleCreateSubIssue = useCallback(() => {
    if (!wsSlug) return;
    router.push({
      pathname: `/${wsSlug}/new-issue`,
      params: { parentIssueId: issueId },
    });
  }, [wsSlug, issueId]);

  if (childIssues.length === 0) {
    return (
      <View className="px-4 pt-2 pb-1">
        <Pressable
          onPress={handleCreateSubIssue}
          className="flex-row items-center gap-1.5"
          hitSlop={8}
        >
          <Ionicons name="add" size={14} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">Add sub-issues</Text>
        </Pressable>
      </View>
    );
  }

  const doneCount = childIssues.filter((c) => c.status === "done").length;

  return (
    <View className="mt-4 px-4">
      {/* Header — tappable to collapse/expand */}
      <View className="flex-row items-center gap-2 mb-2">
        <Pressable
          onPress={() => setCollapsed((v) => !v)}
          className="flex-row items-center gap-1.5 flex-1"
          hitSlop={8}
        >
          <Ionicons
            name="chevron-down"
            size={14}
            className="text-muted-foreground"
            style={{
              transform: [{ rotate: collapsed ? "-90deg" : "0deg" }],
            }}
          />
          <Text className="text-sm font-medium text-foreground">
            Sub-issues
          </Text>
          <View className="flex-row items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5">
            <ProgressRing done={doneCount} total={childIssues.length} />
            <Text className="text-[11px] text-muted-foreground font-medium">
              {doneCount}/{childIssues.length}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={handleCreateSubIssue}
          className="size-7 items-center justify-center rounded-md active:bg-secondary"
          hitSlop={8}
          accessibilityLabel="Add sub-issue"
        >
          <Ionicons name="add" size={18} className="text-muted-foreground" />
        </Pressable>
      </View>

      {/* List */}
      {!collapsed ? (
        <View className="rounded-lg border border-border/60 overflow-hidden bg-card/30">
          {childIssues.map((child, i) => (
            <View key={child.id}>
              {i > 0 ? <View className="h-px bg-border/40" /> : null}
              <SubIssueRow child={child} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
