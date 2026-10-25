import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type {
  Autopilot,
  AutopilotRun,
  AutopilotRunStatus,
  AutopilotStatus,
  AutopilotTrigger,
  GetAutopilotResponse,
  ListAutopilotRunsResponse,
} from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { useWorkspaceStore } from "@/data/workspace-store";
import { api } from "@/data/api";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

const STATUS_COLOR: Record<AutopilotStatus, string> = {
  active: "#10b981",
  paused: "#f59e0b",
  archived: "#9ca3af",
};

const RUN_STATUS_COLOR: Record<AutopilotRunStatus, string> = {
  issue_created: "#3b82f6",
  running: "#3b82f6",
  completed: "#10b981",
  failed: "#ef4444",
  skipped: "#9ca3af",
};

const RUN_STATUS_ICON: Record<AutopilotRunStatus, string> = {
  issue_created: "document-text",
  running: "sync",
  completed: "checkmark-circle",
  failed: "close-circle",
  skipped: "ban",
};

export default function AutopilotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { colorScheme } = useColorScheme();
  const t = THEME[colorScheme];
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["autopilots", wsId, "detail", id],
    queryFn: () => api.getAutopilot(id!),
    enabled: Boolean(id && wsId),
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["autopilots", wsId, "runs", id],
    queryFn: () => api.listAutopilotRuns(id!),
    select: (d: ListAutopilotRunsResponse) => d.runs,
    enabled: Boolean(id && wsId),
  });

  const autopilot = data?.autopilot;
  const triggers = data?.triggers ?? [];

  const handleToggleStatus = async () => {
    if (!autopilot) return;
    const newStatus: AutopilotStatus =
      autopilot.status === "active" ? "paused" : "active";
    try {
      await api.updateAutopilot(autopilot.id, { status: newStatus });
      qc.invalidateQueries({ queryKey: ["autopilots", wsId] });
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to update status");
    }
  };

  const handleRunNow = async () => {
    if (!autopilot) return;
    try {
      await api.triggerAutopilot(autopilot.id);
      Alert.alert("Triggered", "Autopilot has been triggered");
      qc.invalidateQueries({
        queryKey: ["autopilots", wsId, "runs", id],
      });
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to trigger");
    }
  };

  const handleDelete = () => {
    if (!autopilot) return;
    Alert.alert(
      "Delete Autopilot",
      `This will permanently delete "${autopilot.title}". This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteAutopilot(autopilot.id);
              qc.invalidateQueries({ queryKey: ["autopilots", wsId] });
              router.back();
            } catch (err: any) {
              Alert.alert("Error", err?.message ?? "Failed to delete");
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.background }}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={t.foreground} />
        </View>
      </View>
    );
  }

  if (!autopilot) {
    return (
      <View style={{ flex: 1, backgroundColor: t.background }}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: t.mutedForeground }}>Autopilot not found</Text>
        </View>
      </View>
    );
  }

  const statusColor = STATUS_COLOR[autopilot.status];

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: autopilot.title }} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {/* Status + Actions */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: statusColor,
              }}
            />
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: statusColor,
              }}
            >
              {autopilot.status.charAt(0).toUpperCase() +
                autopilot.status.slice(1)}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => router.push(`/${wsSlug}/autopilot/${autopilot.id}/edit`)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: t.secondary,
              }}
            >
              <Text style={{ fontSize: 13, color: t.foreground }}>
                Edit
              </Text>
            </Pressable>
            <Pressable
              onPress={handleToggleStatus}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: t.secondary,
              }}
            >
              <Text style={{ fontSize: 13, color: t.foreground }}>
                {autopilot.status === "active" ? "Pause" : "Activate"}
              </Text>
            </Pressable>
            {autopilot.status === "active" && (
              <Pressable
                onPress={handleRunNow}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: t.foreground,
                }}
              >
                <Text style={{ fontSize: 13, color: t.background }}>
                  Run Now
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Properties Section */}
        <SectionTitle title="Properties" t={t} />
        <View
          style={{
            backgroundColor: t.secondary,
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            gap: 14,
          }}
        >
          <PropertyRow
            label="Agent"
            value={
              autopilot.assignee_type === "squad" ? "Squad" : "Agent"
            }
            t={t}
          />
          <PropertyRow
            label="Output Mode"
            value={
              autopilot.execution_mode === "create_issue"
                ? "Create Issue"
                : "Run Only"
            }
            t={t}
          />
          {autopilot.description ? (
            <View>
              <Text
                style={{
                  fontSize: 12,
                  color: t.mutedForeground,
                  marginBottom: 4,
                }}
              >
                Prompt
              </Text>
              <Text
                style={{ fontSize: 14, color: t.foreground, lineHeight: 20 }}
                numberOfLines={6}
              >
                {autopilot.description}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Triggers Section */}
        <SectionTitle title="Triggers" t={t} />
        <View
          style={{
            backgroundColor: t.secondary,
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}
        >
          {triggers.length === 0 ? (
            <Text
              style={{
                fontSize: 14,
                color: t.mutedForeground,
                textAlign: "center",
                paddingVertical: 12,
              }}
            >
              No triggers configured
            </Text>
          ) : (
            triggers.map((trigger) => (
              <TriggerRow key={trigger.id} trigger={trigger} t={t} />
            ))
          )}
        </View>

        {/* Run History Section */}
        <SectionTitle title="Run History" t={t} />
        <View
          style={{
            backgroundColor: t.secondary,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {runsLoading ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <ActivityIndicator size="small" color={t.foreground} />
            </View>
          ) : runs.length === 0 ? (
            <Text
              style={{
                fontSize: 14,
                color: t.mutedForeground,
                textAlign: "center",
                padding: 20,
              }}
            >
              No runs yet
            </Text>
          ) : (
            runs.map((run) => (
              <RunRow key={run.id} run={run} t={t} wsSlug={wsSlug ?? ""} />
            ))
          )}
        </View>

        {/* Danger Zone */}
        <SectionTitle title="Danger Zone" t={t} />
        <Pressable
          onPress={handleDelete}
          style={{
            backgroundColor: "#fef2f2",
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 14, color: "#ef4444", fontWeight: "600" }}>
            Delete Autopilot
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title, t }: { title: string; t: (typeof THEME)["light"] }) {
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: "600",
        color: t.mutedForeground,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 8,
      }}
    >
      {title}
    </Text>
  );
}

function PropertyRow({
  label,
  value,
  t,
}: {
  label: string;
  value: string;
  t: (typeof THEME)["light"];
}) {
  return (
    <View>
      <Text
        style={{ fontSize: 12, color: t.mutedForeground, marginBottom: 2 }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 14, color: t.foreground }}>{value}</Text>
    </View>
  );
}

function TriggerRow({
  trigger,
  t,
}: {
  trigger: AutopilotTrigger;
  t: (typeof THEME)["light"];
}) {
  const isWebhook = trigger.kind === "webhook";
  const iconName = isWebhook ? "globe-outline" : "time-outline";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <Ionicons
        name={iconName as any}
        size={18}
        color={t.mutedForeground}
        style={{ marginTop: 2 }}
      />
      <View style={{ flex: 1 }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "500", color: t.foreground }}>
            {trigger.kind.charAt(0).toUpperCase() + trigger.kind.slice(1)}
          </Text>
          {trigger.label ? (
            <Text style={{ fontSize: 12, color: t.mutedForeground }}>
              ({trigger.label})
            </Text>
          ) : null}
          {!trigger.enabled && (
            <View
              style={{
                backgroundColor: t.secondary,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 10, color: t.mutedForeground }}>
                Disabled
              </Text>
            </View>
          )}
        </View>
        {trigger.cron_expression ? (
          <Text
            style={{
              fontSize: 12,
              color: t.mutedForeground,
              marginTop: 2,
            }}
          >
            {trigger.cron_expression}
            {trigger.timezone ? ` (${trigger.timezone})` : ""}
          </Text>
        ) : null}
        {trigger.next_run_at ? (
          <Text
            style={{
              fontSize: 12,
              color: t.mutedForeground,
              marginTop: 2,
            }}
          >
            Next: {formatDate(trigger.next_run_at)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function RunRow({
  run,
  t,
  wsSlug,
}: {
  run: AutopilotRun;
  t: (typeof THEME)["light"];
  wsSlug: string;
}) {
  const statusColor = RUN_STATUS_COLOR[run.status] ?? "#9ca3af";
  const statusIcon = RUN_STATUS_ICON[run.status] ?? "help-circle";

  const handlePress = () => {
    if (run.issue_id) {
      router.push(`/${wsSlug}/issue/${run.issue_id}`);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!run.issue_id}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
        gap: 10,
      }}
    >
      <Ionicons
        name={statusIcon as any}
        size={18}
        color={statusColor}
      />
      <View style={{ flex: 1 }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "500",
              color: statusColor,
            }}
          >
            {run.status
              .replace("_", " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())}
          </Text>
          <Text style={{ fontSize: 12, color: t.mutedForeground }}>
            {run.source}
          </Text>
        </View>
        {run.failure_reason ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: "#ef4444",
              marginTop: 2,
            }}
          >
            {run.failure_reason}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 12, color: t.mutedForeground }}>
        {formatDate(run.triggered_at || run.created_at)}
      </Text>
      {run.issue_id && (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={t.mutedForeground}
        />
      )}
    </Pressable>
  );
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
