/**
 * Squads list page — workspace-wide squad/team management.
 *
 * Mirrors web `packages/views/squads/components/squads-page.tsx`:
 * - Fetches all squads in the workspace
 * - Shows squad name, description, member count, and leader
 * - Search filtering
 * - Navigation to squad detail (placeholder for now)
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Agent, Squad } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { squadListOptions } from "@/data/queries/squads";
import { agentListOptions } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

export default function SquadsPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { colorScheme } = useColorScheme();

  const [search, setSearch] = useState("");

  const { data: squads = [], isLoading, error, refetch } = useQuery(squadListOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));

  const agentsById = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  const filteredSquads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return squads;
    return squads.filter((squad) => {
      const nameMatch = squad.name.toLowerCase().includes(q);
      const descMatch = squad.description?.toLowerCase().includes(q);
      return nameMatch || descMatch;
    });
  }, [squads, search]);

  const handleSquadPress = (squad: Squad) => {
    if (!wsSlug) return;
    // Navigate to squad detail page
    router.push(`/${wsSlug}/more/squads/${squad.id}`);
  };

  if (isLoading) {
    return <SquadsLoading />;
  }

  if (error) {
    return (
      <View className="flex-1 bg-background px-4 gap-3 pt-4">
        <Text className="text-sm text-destructive">
          Failed to load squads:{" "}
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
      {/* Search */}
      <View className="px-4 pt-2 pb-2">
        <Input
          placeholder="Search squads..."
          value={search}
          onChangeText={setSearch}
          className="h-9"
        />
      </View>

      {/* Squad list */}
      {filteredSquads.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons
            name="people-outline"
            size={48}
            color={THEME[colorScheme].mutedForeground}
            style={{ opacity: 0.5 }}
          />
          <Text className="text-sm text-muted-foreground text-center mt-3">
            {search
              ? "No squads match the current search."
              : "No squads in this workspace."}
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="pb-6">
          {filteredSquads.map((squad) => (
            <SquadRow
              key={squad.id}
              squad={squad}
              leader={agentsById.get(squad.leader_id)}
              onPress={() => handleSquadPress(squad)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function SquadRow({
  squad,
  leader,
  onPress,
}: {
  squad: Squad;
  leader?: Agent;
  onPress: () => void;
}) {
  const { colorScheme } = useColorScheme();

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3 active:bg-secondary border-b border-border"
    >
      <ActorAvatar type="squad" id={squad.id} size={40} />
      <View className="flex-1 ml-3 gap-0.5">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {squad.name}
        </Text>
        {squad.description ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {squad.description}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-3 mt-1">
          {leader && (
            <View className="flex-row items-center gap-1">
              <Ionicons
                name="person-outline"
                size={12}
                color={THEME[colorScheme].mutedForeground}
              />
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {leader.name}
              </Text>
            </View>
          )}
          {squad.member_count !== undefined && (
            <View className="flex-row items-center gap-1">
              <Ionicons
                name="people-outline"
                size={12}
                color={THEME[colorScheme].mutedForeground}
              />
              <Text className="text-xs text-muted-foreground">
                {squad.member_count} members
              </Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={THEME[colorScheme].mutedForeground}
      />
    </Pressable>
  );
}

function SquadsLoading() {
  return (
    <View className="flex-1 bg-background px-4 pt-4 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </View>
        </View>
      ))}
    </View>
  );
}
