import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type {
  Agent,
  AutopilotExecutionMode,
  AutopilotTrigger,
} from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { useWorkspaceStore } from "@/data/workspace-store";
import { agentListOptions } from "@/data/queries/agents";
import { api } from "@/data/api";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "hourly", label: "Hourly" },
] as const;

const TIMES = [
  "08:00", "09:00", "10:00", "12:00", "14:00", "17:00", "20:00",
];

function cronToFrequency(cron: string): { freq: string; time: string } {
  const parts = cron.split(" ");
  if (parts.length < 5) return { freq: "daily", time: "09:00" };
  const [m, h, , , dow] = parts;
  const time = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  if (dow === "1-5") return { freq: "weekdays", time };
  if (dow === "1") return { freq: "weekly", time };
  if (h === "*") return { freq: "hourly", time: "00:00" };
  return { freq: "daily", time };
}

function frequencyToCron(freq: string, time: string): string {
  const [h, m] = time.split(":");
  switch (freq) {
    case "hourly":
      return `${m} * * * *`;
    case "daily":
      return `${m} ${h} * * *`;
    case "weekdays":
      return `${m} ${h} * * 1-5`;
    case "weekly":
      return `${m} ${h} * * 1`;
    default:
      return `${m} ${h} * * *`;
  }
}

export default function EditAutopilotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { colorScheme } = useColorScheme();
  const t = THEME[colorScheme];
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [executionMode, setExecutionMode] =
    useState<AutopilotExecutionMode>("create_issue");
  const [frequency, setFrequency] = useState<string>("daily");
  const [time, setTime] = useState("09:00");
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["autopilots", wsId, "detail", id],
    queryFn: () => api.getAutopilot(id!),
    enabled: Boolean(id && wsId),
  });

  const { data: agents = [] } = useQuery(agentListOptions(wsId));

  // Pre-fill form when data loads
  useEffect(() => {
    if (data?.autopilot && agents.length > 0 && !loaded) {
      const ap = data.autopilot;
      setTitle(ap.title);
      setDescription(ap.description ?? "");
      setExecutionMode(ap.execution_mode);
      // Find matching agent
      const match = agents.find((a) => a.id === ap.assignee_id);
      if (match) setSelectedAgent(match);
      // Parse trigger
      const trigger = data.triggers?.find((tr) => tr.kind === "schedule");
      if (trigger?.cron_expression) {
        const { freq, time: tVal } = cronToFrequency(trigger.cron_expression);
        setFrequency(freq);
        setTime(tVal);
      }
      setLoaded(true);
    }
  }, [data, agents, loaded]);

  const autopilot = data?.autopilot;
  const existingTrigger = data?.triggers?.find((tr) => tr.kind === "schedule");

  const canSubmit = title.trim().length > 0 && selectedAgent !== null;

  const handleSave = async () => {
    if (!canSubmit || submitting || !autopilot) return;
    setSubmitting(true);
    try {
      await api.updateAutopilot(autopilot.id, {
        title: title.trim(),
        description: description.trim() || null,
        assignee_id: selectedAgent!.id,
        assignee_type: "agent",
        execution_mode: executionMode,
      });

      // Update or create schedule trigger
      const cronExpr = frequencyToCron(frequency, time);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (existingTrigger) {
        await api.updateAutopilotTrigger(autopilot.id, existingTrigger.id, {
          cron_expression: cronExpr,
          timezone: tz,
        });
      } else {
        await api.createAutopilotTrigger(autopilot.id, {
          kind: "schedule",
          cron_expression: cronExpr,
          timezone: tz,
        });
      }

      qc.invalidateQueries({ queryKey: ["autopilots", wsId] });
      Alert.alert("Saved", "Autopilot updated successfully");
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to update autopilot");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !loaded) {
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

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <FieldLabel label="Name" t={t} />
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Autopilot name"
          placeholderTextColor={t.mutedForeground}
          style={{
            backgroundColor: t.secondary,
            borderRadius: 10,
            padding: 14,
            fontSize: 15,
            color: t.foreground,
            marginBottom: 16,
          }}
        />

        {/* Runbook */}
        <FieldLabel label="Runbook (Prompt)" t={t} />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What should the agent do on each run?"
          placeholderTextColor={t.mutedForeground}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          style={{
            backgroundColor: t.secondary,
            borderRadius: 10,
            padding: 14,
            fontSize: 15,
            color: t.foreground,
            minHeight: 120,
            marginBottom: 16,
          }}
        />

        {/* Agent Picker */}
        <FieldLabel label="Agent" t={t} />
        <Pressable
          onPress={() => setAgentPickerOpen(true)}
          style={{
            backgroundColor: t.secondary,
            borderRadius: 10,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {selectedAgent ? (
            <>
              <ActorAvatar
                type="agent"
                id={selectedAgent.id}
                size={24}
              />
              <Text
                style={{
                  flex: 1,
                  fontSize: 15,
                  color: t.foreground,
                }}
                numberOfLines={1}
              >
                {selectedAgent.name}
              </Text>
            </>
          ) : (
            <Text
              style={{
                flex: 1,
                fontSize: 15,
                color: t.mutedForeground,
              }}
            >
              Select an agent
            </Text>
          )}
          <Ionicons
            name="chevron-down"
            size={16}
            color={t.mutedForeground}
          />
        </Pressable>

        {/* Execution Mode */}
        <FieldLabel label="Output Mode" t={t} />
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {(
            [
              {
                value: "create_issue",
                label: "Create Issue",
                desc: "Each run creates a tracked issue",
              },
              {
                value: "run_only",
                label: "Run Only",
                desc: "Silent run, no issue created",
              },
            ] as const
          ).map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setExecutionMode(opt.value)}
              style={{
                flex: 1,
                backgroundColor:
                  executionMode === opt.value
                    ? t.foreground
                    : t.secondary,
                borderRadius: 10,
                padding: 14,
                borderWidth: executionMode === opt.value ? 0 : 1,
                borderColor: t.border,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color:
                    executionMode === opt.value
                      ? t.background
                      : t.foreground,
                }}
              >
                {opt.label}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color:
                    executionMode === opt.value
                      ? t.background
                      : t.mutedForeground,
                  marginTop: 4,
                }}
              >
                {opt.desc}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Schedule */}
        <FieldLabel label="Schedule" t={t} />
        <View
          style={{
            backgroundColor: t.secondary,
            borderRadius: 10,
            padding: 14,
            gap: 12,
            marginBottom: 16,
          }}
        >
          {/* Frequency */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {FREQUENCIES.map((f) => (
              <Pressable
                key={f.value}
                onPress={() => setFrequency(f.value)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor:
                    frequency === f.value ? t.foreground : t.background,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color:
                      frequency === f.value ? t.background : t.foreground,
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Time */}
          <View>
            <Text
              style={{
                fontSize: 12,
                color: t.mutedForeground,
                marginBottom: 6,
              }}
            >
              Time
            </Text>
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
            >
              {TIMES.map((tVal) => (
                <Pressable
                  key={tVal}
                  onPress={() => setTime(tVal)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor:
                      time === tVal ? t.foreground : t.background,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: time === tVal ? t.background : t.foreground,
                    }}
                  >
                    {tVal}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Save Button */}
        <Pressable
          onPress={handleSave}
          disabled={!canSubmit || submitting}
          style={{
            backgroundColor: canSubmit ? t.foreground : t.secondary,
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={t.background} />
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: canSubmit ? t.background : t.mutedForeground,
              }}
            >
              Save Changes
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Agent Picker Modal */}
      <AgentPickerModal
        visible={agentPickerOpen}
        agents={agents}
        selectedId={selectedAgent?.id ?? null}
        onSelect={(agent) => {
          setSelectedAgent(agent);
          setAgentPickerOpen(false);
        }}
        onClose={() => setAgentPickerOpen(false)}
        t={t}
      />
    </View>
  );
}

function FieldLabel({
  label,
  t,
}: {
  label: string;
  t: (typeof THEME)["light"];
}) {
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: "600",
        color: t.mutedForeground,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 6,
      }}
    >
      {label}
    </Text>
  );
}

function AgentPickerModal({
  visible,
  agents,
  selectedId,
  onSelect,
  onClose,
  t,
}: {
  visible: boolean;
  agents: Agent[];
  selectedId: string | null;
  onSelect: (agent: Agent) => void;
  onClose: () => void;
  t: (typeof THEME)["light"];
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
        onPress={onClose}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 360,
              backgroundColor: t.background,
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: t.border,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: t.foreground,
                }}
              >
                Choose an agent
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              {agents.length === 0 ? (
                <View style={{ padding: 32, alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 14,
                      color: t.mutedForeground,
                    }}
                  >
                    No agents available
                  </Text>
                </View>
              ) : (
                agents.map((agent) => {
                  const selected = agent.id === selectedId;
                  return (
                    <Pressable
                      key={agent.id}
                      onPress={() => onSelect(agent)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        backgroundColor: selected
                          ? t.secondary
                          : "transparent",
                      }}
                    >
                      <ActorAvatar
                        type="agent"
                        id={agent.id}
                        size={32}
                      />
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 15,
                          fontWeight: selected ? "600" : "400",
                          color: t.foreground,
                        }}
                        numberOfLines={1}
                      >
                        {agent.name}
                      </Text>
                      {selected && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={t.foreground}
                        />
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
