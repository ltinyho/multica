/**
 * Agents list page — workspace-wide agent management.
 *
 * Mirrors web `packages/views/agents/components/agents-page.tsx`:
 * - Fetches all agents in the workspace
 * - Shows agent name, description, status, and avatar
 * - Search filtering
 * - Navigation to agent detail (placeholder for now)
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Agent } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { agentListOptions } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "idle" | "working" | "blocked" | "error" | "offline";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "working", label: "Working" },
  { value: "idle", label: "Idle" },
  { value: "offline", label: "Offline" },
];

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

export default function AgentsPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { colorScheme } = useColorScheme();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const { data: agents = [], isLoading, error, refetch } = useQuery(agentListOptions(wsId));

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((agent) => {
      // Status filter
      if (statusFilter !== "all" && agent.status !== statusFilter) {
        return false;
      }
      // Search filter
      if (q) {
        const nameMatch = agent.name.toLowerCase().includes(q);
        const descMatch = agent.description?.toLowerCase().includes(q);
        if (!nameMatch && !descMatch) return false;
      }
      return true;
    });
  }, [agents, statusFilter, search]);

  const handleAgentPress = (agent: Agent) => {
    if (!wsSlug) return;
    // Navigate to agent detail page
    router.push(`/${wsSlug}/agent/${agent.id}`);
  };

  if (isLoading) {
    return <AgentsLoading />;
  }

  if (error) {
    return (
      <View className="flex-1 bg-background px-4 gap-3 pt-4">
        <Text className="text-sm text-destructive">
          Failed to load agents:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </Text>
        <Button variant="outline" onPress={() => refetch()}>
          <Text>Retry</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Search and filters */}
      <View className="px-4 pt-2 pb-2 gap-2">
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Input
              placeholder="Search agents..."
              value={search}
              onChangeText={setSearch}
              className="h-9"
            />
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-1.5">
          {STATUS_FILTERS.map((filter) => {
            const active = statusFilter === filter.value;
            return (
              <Button
                key={filter.value}
                variant="outline"
                size="sm"
                onPress={() => setStatusFilter(filter.value)}
                className={cn(active ? "bg-accent" : "")}
                accessibilityState={{ selected: active }}
              >
                <Text
                  numberOfLines={1}
                  className={cn(
                    "text-xs",
                    active ? "text-accent-foreground" : "text-muted-foreground"
                  )}
                >
                  {filter.label}
                </Text>
              </Button>
            );
          })}
        </ScrollView>
      </View>

      {/* Agent list */}
      {filteredAgents.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons
            name="people-outline"
            size={48}
            color={THEME[colorScheme].mutedForeground}
            style={{ opacity: 0.5 }}
          />
          <Text className="text-sm text-muted-foreground text-center mt-3">
            {search || statusFilter !== "all"
              ? "No agents match the current filters."
              : "No agents in this workspace."}
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="pb-6">
          {filteredAgents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              onPress={() => handleAgentPress(agent)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function AgentRow({ agent, onPress }: { agent: Agent; onPress: () => void }) {
  const { colorScheme } = useColorScheme();
  const statusColor = STATUS_COLORS[agent.status] ?? "bg-muted-foreground/40";
  const statusLabel = STATUS_LABELS[agent.status] ?? agent.status;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3 active:bg-secondary border-b border-border"
    >
      <ActorAvatar type="agent" id={agent.id} size={40} showPresence />
      <View className="flex-1 ml-3 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
            {agent.name}
          </Text>
          <View className="flex-row items-center gap-1">
            <View
              style={{ width: 6, height: 6, borderRadius: 3 }}
              className={statusColor}
            />
            <Text className="text-xs text-muted-foreground">{statusLabel}</Text>
          </View>
        </View>
        {agent.description ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {agent.description}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={THEME[colorScheme].mutedForeground}
      />
    </Pressable>
  );
}

function AgentsLoading() {
  return (
    <View className="flex-1 bg-background px-4 pt-4 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </View>
        </View>
      ))}
    </View>
  );
}
