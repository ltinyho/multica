import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/text";
import { AutosizeTextArea } from "@/components/ui/autosize-textarea";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import {
  MIN_BODY_INPUT_HEIGHT_PX,
  MOBILE_PLACEHOLDER_COLOR,
} from "@/components/ui/input-tokens";
import { api } from "@/data/api";
import { agentListOptions } from "@/data/queries/agents";
import { useUpdateSquad } from "@/data/mutations/squads";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

export default function EditSquad() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { colorScheme } = useColorScheme();
  const detail = useQuery({
    queryKey: ["squad", id],
    queryFn: () => api.getSquad(id!),
    enabled: !!id,
  });
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const update = useUpdateSquad(id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!detail.data || seeded) return;
    setName(detail.data.name);
    setDescription(detail.data.description ?? "");
    setInstructions(detail.data.instructions ?? "");
    setLeaderId(detail.data.leader_id ?? "");
    setSeeded(true);
  }, [detail.data, seeded]);

  const leader = useMemo(
    () => agents.find((agent) => agent.id === leaderId),
    [agents, leaderId],
  );

  const dirty = useMemo(() => {
    if (!detail.data || !seeded) return false;
    return (
      name.trim() !== detail.data.name ||
      description.trim() !== (detail.data.description ?? "") ||
      instructions.trim() !== (detail.data.instructions ?? "") ||
      leaderId !== detail.data.leader_id
    );
  }, [description, detail.data, instructions, leaderId, name, seeded]);

  const canSave =
    seeded &&
    name.trim().length > 0 &&
    leaderId.length > 0 &&
    dirty &&
    !update.isPending;

  const onCancel = useCallback(() => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert("Discard changes?", "Your edits to this squad will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }, [dirty]);

  const onSave = useCallback(() => {
    if (!canSave) return;
    update.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        leader_id: leaderId,
      },
      {
        onSuccess: () => router.back(),
        onError: (err) => {
          Alert.alert(
            "Failed to save",
            err instanceof Error ? err.message : "Unknown error",
          );
        },
      },
    );
  }, [canSave, description, instructions, leaderId, name, update]);

  const headerLeft = useCallback(
    () => (
      <Pressable onPress={onCancel} className="px-1 py-1">
        <Text className="text-base text-brand">Cancel</Text>
      </Pressable>
    ),
    [onCancel],
  );

  const headerRight = useCallback(
    () => (
      <Pressable
        onPress={onSave}
        disabled={!canSave}
        className={canSave ? "px-1 py-1" : "px-1 py-1 opacity-40"}
      >
        <Text className="text-base text-brand font-semibold">
          {update.isPending ? "Saving..." : "Save"}
        </Text>
      </Pressable>
    ),
    [canSave, onSave, update.isPending],
  );

  return (
    <>
      <Stack.Screen options={{ headerLeft, headerRight }} />
      <KeyboardAvoidingView
        className="flex-1 bg-background"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-4 pb-6 gap-4"
          keyboardShouldPersistTaps="handled"
        >
          {!detail.data ? (
            <Text className="text-sm text-muted-foreground">Loading...</Text>
          ) : (
            <>
              <Field label="Name">
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Squad name"
                  placeholderTextColor={MOBILE_PLACEHOLDER_COLOR}
                  className="text-base text-foreground bg-secondary/50 rounded-md px-3 py-2"
                  editable={!update.isPending}
                />
              </Field>

              <Field label="Description">
                <AutosizeTextArea
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What does this squad do?"
                  className="bg-secondary/50 rounded-md px-3 py-2"
                  minHeight={80}
                />
              </Field>

              <Field label="Leader">
                <View className="rounded-md bg-secondary/50 overflow-hidden">
                  {leader ? (
                    <View className="flex-row items-center gap-3 px-3 py-3 border-b border-border">
                      <ActorAvatar
                        type="agent"
                        id={leader.id}
                        size={32}
                        showPresence
                      />
                      <View className="flex-1 min-w-0">
                        <Text
                          className="text-sm font-medium text-foreground"
                          numberOfLines={1}
                        >
                          {leader.name}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Current leader
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {agents.length === 0 ? (
                    <Text className="px-3 py-3 text-sm text-muted-foreground">
                      No agents available.
                    </Text>
                  ) : (
                    agents.map((agent) => {
                      const selected = agent.id === leaderId;
                      return (
                        <Pressable
                          key={agent.id}
                          onPress={() => setLeaderId(agent.id)}
                          className="flex-row items-center gap-3 px-3 py-3 active:bg-secondary"
                        >
                          <ActorAvatar
                            type="agent"
                            id={agent.id}
                            size={28}
                            showPresence
                          />
                          <Text
                            className="flex-1 text-sm text-foreground"
                            numberOfLines={1}
                          >
                            {agent.name}
                          </Text>
                          {selected ? (
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color={THEME[colorScheme].primary}
                            />
                          ) : null}
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </Field>

              <Field label="Instructions">
                <AutosizeTextArea
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder="Instructions for this squad"
                  className="bg-secondary/50 rounded-md px-3 py-2"
                  minHeight={MIN_BODY_INPUT_HEIGHT_PX}
                />
              </Field>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
      {children}
    </View>
  );
}
