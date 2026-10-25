/**
 * Squad detail page — shows squad info and members.
 *
 * Mirrors web `packages/views/squads/components/squad-detail-page.tsx`:
 * - Fetches squad details and members
 * - Shows squad name, description, leader
 * - Lists members with their roles
 * - Edit entry for editable squad fields
 */
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { Agent, Squad, SquadMember } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { api } from "@/data/api";
import { agentListOptions } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

export default function SquadDetailPage() {
  const { id, workspace: wsSlug } = useLocalSearchParams<{
    id: string;
    workspace: string;
  }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { colorScheme } = useColorScheme();

  const { data: squad, isLoading: squadLoading, error: squadError } = useQuery({
    queryKey: ["squad", id],
    queryFn: () => api.getSquad(id!),
    enabled: !!id,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["squad", id, "members"],
    queryFn: () => api.listSquadMembers(id!),
    enabled: !!id,
  });

  const { data: agents = [] } = useQuery(agentListOptions(wsId));

  const agentsById = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  const isLoading = squadLoading || membersLoading;

  if (isLoading) {
    return <SquadDetailLoading />;
  }

  if (squadError || !squad) {
    return (
      <View className="flex-1 bg-background px-4 gap-3 pt-4">
        <Text className="text-sm text-destructive">
          Failed to load squad:{" "}
          {squadError instanceof Error ? squadError.message : "unknown error"}
        </Text>
      </View>
    );
  }

  const leader = agentsById.get(squad.leader_id);
  const openEdit = () => {
    if (!wsSlug) return;
    router.push({
      pathname: "/[workspace]/more/squads/[id]/edit",
      params: { workspace: wsSlug, id: squad.id },
    });
  };

  return (
    <>
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable onPress={openEdit} hitSlop={8} className="px-1 py-1">
            <Text className="text-base text-brand">Edit</Text>
          </Pressable>
        ),
      }}
    />
    <ScrollView className="flex-1 bg-background">
      {/* Squad header */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <View className="flex-row items-center gap-3">
          <ActorAvatar type="squad" id={squad.id} size={48} />
          <View className="flex-1">
            <Text className="text-lg font-semibold text-foreground">
              {squad.name}
            </Text>
            {squad.description && (
              <Text className="text-sm text-muted-foreground mt-0.5">
                {squad.description}
              </Text>
            )}
          </View>
        </View>

        {/* Leader info */}
        {leader && (
          <View className="flex-row items-center gap-2 mt-3 px-1">
            <Ionicons
              name="star-outline"
              size={14}
              color={THEME[colorScheme].mutedForeground}
            />
            <Text className="text-xs text-muted-foreground">Leader:</Text>
            <ActorAvatar type="agent" id={leader.id} size={16} />
            <Text className="text-xs text-foreground">{leader.name}</Text>
          </View>
        )}
      </View>

      {/* Members section */}
      <View className="px-4 pt-4 pb-6">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm font-medium text-foreground">
            Members ({members.length})
          </Text>
          <Button variant="outline" size="sm" onPress={() => {}}>
            <Ionicons
              name="add"
              size={14}
              color={THEME[colorScheme].foreground}
            />
            <Text className="text-xs ml-1">Add</Text>
          </Button>
        </View>

        {members.length === 0 ? (
          <View className="items-center py-8">
            <Ionicons
              name="people-outline"
              size={32}
              color={THEME[colorScheme].mutedForeground}
              style={{ opacity: 0.5 }}
            />
            <Text className="text-sm text-muted-foreground mt-2">
              No members yet
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                agent={member.member_type === "agent" ? agentsById.get(member.member_id) : undefined}
                isLeader={member.member_type === "agent" && member.member_id === squad.leader_id}
              />
            ))}
          </View>
        )}
      </View>

      {/* Instructions section */}
      {squad.instructions && (
        <View className="px-4 pt-4 pb-6 border-t border-border">
          <Text className="text-sm font-medium text-foreground mb-2">
            Instructions
          </Text>
          <Text className="text-sm text-muted-foreground">
            {squad.instructions}
          </Text>
        </View>
      )}
    </ScrollView>
    </>
  );
}

function MemberRow({
  member,
  agent,
  isLeader,
}: {
  member: SquadMember;
  agent?: Agent;
  isLeader: boolean;
}) {
  const { colorScheme } = useColorScheme();

  return (
    <View className="flex-row items-center px-3 py-2 rounded-lg bg-secondary/50">
      <ActorAvatar
        type={member.member_type}
        id={member.member_id}
        size={32}
        showPresence={member.member_type === "agent"}
      />
      <View className="flex-1 ml-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-medium text-foreground">
            {agent?.name ?? member.member_id.slice(0, 8)}
          </Text>
          {isLeader && (
            <View className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
              <Text className="text-xs text-amber-700 dark:text-amber-400">
                Leader
              </Text>
            </View>
          )}
        </View>
        {member.role && (
          <Text className="text-xs text-muted-foreground mt-0.5">
            {member.role}
          </Text>
        )}
      </View>
    </View>
  );
}

function SquadDetailLoading() {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <View className="flex-row items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </View>
        </View>
      </View>
      <View className="px-4 pt-4 pb-6 gap-3">
        <Skeleton className="h-4 w-1/4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} className="flex-row items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <View className="flex-1 gap-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
