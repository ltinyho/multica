import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Autopilot, AutopilotStatus } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { useWorkspaceStore } from "@/data/workspace-store";
import { autopilotListOptions } from "@/data/queries/autopilots";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

const STATUS_COLOR: Record<AutopilotStatus, string> = {
  active: "#10b981",
  paused: "#f59e0b",
  archived: "#9ca3af",
};

const STATUS_ICON: Record<AutopilotStatus, string> = {
  active: "play",
  paused: "pause",
  archived: "archive",
};

type FilterStatus = "all" | AutopilotStatus;

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

export default function AutopilotsScreen() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { colorScheme } = useColorScheme();
  const t = THEME[colorScheme];
  const qc = useQueryClient();

  const [filter, setFilter] = useState<FilterStatus>("all");

  const {
    data: autopilots = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    ...autopilotListOptions(wsId),
    select: (d) => d.autopilots,
  });

  const filtered = useMemo(
    () =>
      filter === "all"
        ? autopilots
        : autopilots.filter((a) => a.status === filter),
    [autopilots, filter],
  );

  const handleRefresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["autopilots", wsId] });
  }, [qc, wsId]);

  const handleCreate = () => {
    if (!wsSlug) return;
    router.push(`/${wsSlug}/autopilot/new`);
  };

  const renderItem = useCallback(
    ({ item }: { item: Autopilot }) => (
      <AutopilotRow item={item} wsSlug={wsSlug ?? ""} t={t} />
    ),
    [wsSlug, t],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      {/* Filter pills */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          paddingVertical: 8,
          gap: 8,
        }}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor:
                filter === f.value ? t.foreground : t.secondary,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color:
                  filter === f.value ? t.background : t.foreground,
              }}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={t.foreground} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={t.foreground}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 100,
          }}
          ListEmptyComponent={
            <View
              style={{
                alignItems: "center",
                paddingTop: 80,
                gap: 12,
              }}
            >
              <Ionicons
                name="flash-outline"
                size={48}
                color={t.mutedForeground}
              />
              <Text style={{ color: t.mutedForeground, fontSize: 15 }}>
                No autopilots yet
              </Text>
              <Text
                style={{
                  color: t.mutedForeground,
                  fontSize: 13,
                  textAlign: "center",
                  paddingHorizontal: 32,
                }}
              >
                Schedule recurring tasks for your AI agents
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={handleCreate}
        style={{
          position: "absolute",
          right: 20,
          bottom: 32,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: t.foreground,
          justifyContent: "center",
          alignItems: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
          elevation: 5,
        }}
      >
        <Ionicons name="add" size={28} color={t.background} />
      </Pressable>
    </View>
  );
}

function AutopilotRow({
  item,
  wsSlug,
  t,
}: {
  item: Autopilot;
  wsSlug: string;
  t: (typeof THEME)["light"];
}) {
  const statusColor = STATUS_COLOR[item.status] ?? STATUS_COLOR.active;
  const statusIcon = STATUS_ICON[item.status] ?? "play";

  const lastRun = item.last_run_at
    ? formatRelativeDate(item.last_run_at)
    : null;

  return (
    <Pressable
      onPress={() => router.push(`/${wsSlug}/autopilot/${item.id}`)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
        gap: 12,
      }}
    >
      <Ionicons name="flash" size={20} color={t.mutedForeground} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            fontWeight: "500",
            color: t.foreground,
          }}
        >
          {item.title}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Ionicons
              name={statusIcon as any}
              size={12}
              color={statusColor}
            />
            <Text style={{ fontSize: 12, color: statusColor }}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: t.mutedForeground }}>
            {item.execution_mode === "create_issue"
              ? "Create Issue"
              : "Run Only"}
          </Text>
          {lastRun ? (
            <Text style={{ fontSize: 12, color: t.mutedForeground }}>
              {lastRun}
            </Text>
          ) : null}
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={16}
        color={t.mutedForeground}
      />
    </Pressable>
  );
}

function formatRelativeDate(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
