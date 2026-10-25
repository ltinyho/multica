/**
 * Agent detail page — shows agent info, status, and configuration.
 *
 * Mirrors web `packages/views/agents/components/agent-detail-page.tsx`:
 * - Fetches agent details
 * - Shows agent name, description, status, runtime, model
 * - Edit entry for editable agent fields
 */
import { useMemo } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { Agent, AgentTask, RuntimeDevice } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { api } from "@/data/api";
import { useCancelAgentTasks } from "@/data/mutations/agents";
import { agentTaskSnapshotOptions } from "@/data/queries/agent-task-snapshot";
import { agentListOptions } from "@/data/queries/agents";
import { runtimeListOptions } from "@/data/queries/runtimes";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-muted-foreground/40",
  working: "bg-success",
  blocked: "bg-destructive",
  error: "bg-destructive",
  offline: "bg-muted-foreground/40",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  working: "Working",
  blocked: "Blocked",
  error: "Error",
  offline: "Offline",
};

const ACTIVE_TASK_STATUSES = new Set<AgentTask["status"]>([
  "queued",
  "dispatched",
  "waiting_local_directory",
  "running",
]);

function isActiveTask(task: AgentTask): boolean {
  return ACTIVE_TASK_STATUSES.has(task.status);
}

export default function AgentDetailPage() {
  const { id, workspace: wsSlug } = useLocalSearchParams<{
    id: string;
    workspace: string;
  }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { colorScheme } = useColorScheme();

  const qc = useQueryClient();
  const { data: agent, isLoading: agentLoading, error: agentError } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id,
    // The Agents list already carries the full agent (skills, instructions,
    // model), so render it immediately while the detail refetch runs.
    placeholderData: () =>
      qc
        .getQueryData(agentListOptions(wsId).queryKey)
        ?.find((a) => a.id === id),
  });

  const { data: runtimes = [] } = useQuery(runtimeListOptions(wsId));
  const { data: taskSnapshot = [] } = useQuery(agentTaskSnapshotOptions(wsId));
  const cancelTasks = useCancelAgentTasks(id ?? "");

  const runtime = useMemo(() => {
    if (!agent) return undefined;
    return runtimes.find((r) => r.id === agent.runtime_id);
  }, [agent, runtimes]);

  const activeTasks = useMemo(() => {
    if (!agent) return [];
    return taskSnapshot.filter(
      (task) => task.agent_id === agent.id && isActiveTask(task),
    );
  }, [agent, taskSnapshot]);

  if (agentLoading) {
    return <AgentDetailLoading />;
  }

  if (agentError || !agent) {
    return (
      <View className="flex-1 bg-background px-4 gap-3 pt-4">
        <Text className="text-sm text-destructive">
          Failed to load agent:{" "}
          {agentError instanceof Error ? agentError.message : "unknown error"}
        </Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[agent.status] ?? "bg-muted-foreground/40";
  const statusLabel = STATUS_LABELS[agent.status] ?? agent.status;
  const activeTaskCount = activeTasks.length;
  const openEdit = () => {
    if (!wsSlug) return;
    router.push({
      pathname: "/[workspace]/agent-edit/[id]",
      params: { workspace: wsSlug, id: agent.id },
    });
  };
  const onStopAgent = () => {
    if (activeTaskCount === 0 || cancelTasks.isPending) return;
    Alert.alert(
      "Stop agent?",
      `This will cancel ${activeTaskCount} active ${
        activeTaskCount === 1 ? "task" : "tasks"
      } for ${agent.name}.`,
      [
        { text: "Keep running", style: "cancel" },
        {
          text: "Stop",
          style: "destructive",
          onPress: () => {
            cancelTasks.mutate(undefined, {
              onError: (err) => {
                Alert.alert(
                  "Failed to stop agent",
                  err instanceof Error ? err.message : "Unknown error",
                );
              },
            });
          },
        },
      ],
    );
  };

  return (
    <>
    <Stack.Screen
      options={{
        title: agent.name,
        headerRight: () => (
          <Pressable onPress={openEdit} hitSlop={8} className="px-1 py-1">
            <Text className="text-base text-brand">Edit</Text>
          </Pressable>
        ),
      }}
    />
    <ScrollView className="flex-1 bg-background">
      {/* Agent header */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <View className="flex-row items-center gap-3">
          <ActorAvatar type="agent" id={agent.id} size={48} showPresence />
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-lg font-semibold text-foreground">
                {agent.name}
              </Text>
              <View className="flex-row items-center gap-1">
                <View
                  style={{ width: 8, height: 8, borderRadius: 4 }}
                  className={statusColor}
                />
                <Text className="text-xs text-muted-foreground">{statusLabel}</Text>
              </View>
            </View>
            {agent.description && (
              <Text className="text-sm text-muted-foreground mt-0.5">
                {agent.description}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Agent details */}
      <View className="px-4 pt-4 pb-6">
        {activeTaskCount > 0 ? (
          <View className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3">
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">
                  Working now
                </Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  {activeTaskCount === 1
                    ? "1 active task can be stopped."
                    : `${activeTaskCount} active tasks can be stopped.`}
                </Text>
              </View>
              <Button
                variant="destructive"
                size="sm"
                onPress={onStopAgent}
                disabled={cancelTasks.isPending}
              >
                <Ionicons name="stop-circle-outline" size={15} color="#fff" />
                <Text>{cancelTasks.isPending ? "Stopping..." : "Stop"}</Text>
              </Button>
            </View>
          </View>
        ) : null}

        <Text className="text-sm font-medium text-foreground mb-3">
          Configuration
        </Text>

        <View className="gap-3">
          {/* Runtime */}
          <DetailRow
            label="Runtime"
            value={runtime?.name ?? agent.runtime_id.slice(0, 8)}
            icon="hardware-chip-outline"
          />

          {/* Runtime mode */}
          <DetailRow
            label="Mode"
            value={agent.runtime_mode === "local" ? "Local" : "Cloud"}
            icon="cloud-outline"
          />

          {/* Model */}
          {agent.model && (
            <DetailRow
              label="Model"
              value={agent.model}
              icon="cube-outline"
            />
          )}

          {/* Visibility */}
          <DetailRow
            label="Visibility"
            value={agent.visibility === "workspace" ? "Workspace" : "Private"}
            icon="eye-outline"
          />

          {/* Max concurrent tasks */}
          <DetailRow
            label="Max Tasks"
            value={String(agent.max_concurrent_tasks)}
            icon="layers-outline"
          />
        </View>
      </View>

      {/* Skills section */}
      {agent.skills && agent.skills.length > 0 && (
        <View className="px-4 pt-4 pb-6 border-t border-border">
          <Text className="text-sm font-medium text-foreground mb-3">
            Skills ({agent.skills.length})
          </Text>
          <View className="gap-2">
            {agent.skills.map((skill) => (
              <View
                key={skill.id}
                className="flex-row items-center px-3 py-2 rounded-lg bg-secondary/50"
              >
                <Ionicons
                  name="code-outline"
                  size={14}
                  color={THEME[colorScheme].mutedForeground}
                />
                <View className="ml-2 flex-1">
                  <Text className="text-sm text-foreground">{skill.name}</Text>
                  {skill.description && (
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                      {skill.description}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Instructions section */}
      {agent.instructions && (
        <View className="px-4 pt-4 pb-6 border-t border-border">
          <Text className="text-sm font-medium text-foreground mb-2">
            Instructions
          </Text>
          <Text className="text-sm text-muted-foreground">
            {agent.instructions}
          </Text>
        </View>
      )}
    </ScrollView>
    </>
  );
}

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  const { colorScheme } = useColorScheme();

  return (
    <View className="flex-row items-center px-3 py-2 rounded-lg bg-secondary/50">
      <Ionicons
        name={icon as any}
        size={16}
        color={THEME[colorScheme].mutedForeground}
      />
      <View className="ml-3 flex-1">
        <Text className="text-xs text-muted-foreground">{label}</Text>
        <Text className="text-sm text-foreground">{value}</Text>
      </View>
    </View>
  );
}

function AgentDetailLoading() {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <View className="flex-row items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </View>
        </View>
      </View>
      <View className="px-4 pt-4 pb-6 gap-3">
        <Skeleton className="h-4 w-1/4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </View>
    </ScrollView>
  );
}
