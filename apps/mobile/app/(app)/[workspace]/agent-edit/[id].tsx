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
import type {
  AgentVisibility,
  RuntimeDevice,
  RuntimeModel,
} from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { AutosizeTextArea } from "@/components/ui/autosize-textarea";
import {
  MIN_BODY_INPUT_HEIGHT_PX,
  MOBILE_PLACEHOLDER_COLOR,
} from "@/components/ui/input-tokens";
import { api } from "@/data/api";
import { useUpdateAgent } from "@/data/mutations/agents";
import {
  runtimeListOptions,
  runtimeModelsOptions,
} from "@/data/queries/runtimes";
import { useWorkspaceStore } from "@/data/workspace-store";

const VISIBILITY_OPTIONS: Array<{ value: AgentVisibility; label: string }> = [
  { value: "workspace", label: "Workspace" },
  { value: "private", label: "Private" },
];

export default function EditAgent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const detail = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id,
  });
  const { data: runtimes = [], isLoading: runtimesLoading } = useQuery(
    runtimeListOptions(wsId),
  );
  const update = useUpdateAgent(id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [visibility, setVisibility] = useState<AgentVisibility>("workspace");
  const [selectedRuntimeId, setSelectedRuntimeId] = useState("");
  const [model, setModel] = useState("");
  const [maxTasksText, setMaxTasksText] = useState("1");
  const [seeded, setSeeded] = useState(false);
  const modelsQuery = useQuery(runtimeModelsOptions(selectedRuntimeId));

  useEffect(() => {
    if (!detail.data || seeded) return;
    setName(detail.data.name);
    setDescription(detail.data.description ?? "");
    setInstructions(detail.data.instructions ?? "");
    setVisibility(detail.data.visibility ?? "workspace");
    setSelectedRuntimeId(detail.data.runtime_id ?? "");
    setModel(detail.data.model ?? "");
    setMaxTasksText(String(detail.data.max_concurrent_tasks ?? 1));
    setSeeded(true);
  }, [detail.data, seeded]);

  const maxTasks = Number.parseInt(maxTasksText, 10);
  const maxTasksValid = Number.isInteger(maxTasks) && maxTasks >= 1;
  const selectedRuntime =
    runtimes.find((runtime) => runtime.id === selectedRuntimeId) ?? null;
  const runtimeValid = selectedRuntimeId.trim().length > 0;
  const models = modelsQuery.data?.models ?? [];
  const modelSelectionSupported = modelsQuery.data?.supported ?? true;

  const dirty = useMemo(() => {
    if (!detail.data || !seeded) return false;
    return (
      name.trim() !== detail.data.name ||
      description.trim() !== (detail.data.description ?? "") ||
      instructions.trim() !== (detail.data.instructions ?? "") ||
      visibility !== detail.data.visibility ||
      selectedRuntimeId !== detail.data.runtime_id ||
      model.trim() !== (detail.data.model ?? "") ||
      (maxTasksValid && maxTasks !== detail.data.max_concurrent_tasks)
    );
  }, [
    description,
    detail.data,
    instructions,
    maxTasks,
    maxTasksValid,
    model,
    name,
    seeded,
    selectedRuntimeId,
    visibility,
  ]);

  const canSave =
    seeded &&
    name.trim().length > 0 &&
    runtimeValid &&
    maxTasksValid &&
    dirty &&
    !update.isPending;

  const onCancel = useCallback(() => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert("Discard changes?", "Your edits to this agent will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }, [dirty]);

  const onRuntimeSelect = useCallback(
    (runtimeId: string) => {
      setSelectedRuntimeId(runtimeId);
      if (runtimeId !== selectedRuntimeId) {
        setModel("");
      }
    },
    [selectedRuntimeId],
  );

  const onSave = useCallback(() => {
    if (!canSave) return;
    update.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        runtime_id: selectedRuntimeId,
        model: model.trim(),
        visibility,
        max_concurrent_tasks: maxTasks,
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
  }, [
    canSave,
    description,
    instructions,
    maxTasks,
    model,
    name,
    selectedRuntimeId,
    update,
    visibility,
  ]);

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
                  placeholder="Agent name"
                  placeholderTextColor={MOBILE_PLACEHOLDER_COLOR}
                  className="text-base text-foreground bg-secondary/50 rounded-md px-3 py-2"
                  editable={!update.isPending}
                />
              </Field>

              <Field label="Description">
                <AutosizeTextArea
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What does this agent do?"
                  className="bg-secondary/50 rounded-md px-3 py-2"
                  minHeight={80}
                />
              </Field>

              <Field label="Visibility">
                <View className="flex-row rounded-md bg-secondary/50 p-1">
                  {VISIBILITY_OPTIONS.map((option) => {
                    const selected = visibility === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setVisibility(option.value)}
                        className={
                          selected
                            ? "flex-1 rounded px-3 py-2 bg-background"
                            : "flex-1 rounded px-3 py-2"
                        }
                      >
                        <Text
                          className={
                            selected
                              ? "text-sm text-foreground text-center font-medium"
                              : "text-sm text-muted-foreground text-center"
                          }
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <Field label="Runtime">
                <RuntimeSelect
                  runtimes={runtimes}
                  selectedRuntimeId={selectedRuntimeId}
                  currentRuntimeName={
                    detail.data.runtime_id === selectedRuntimeId
                      ? selectedRuntime?.name
                      : undefined
                  }
                  loading={runtimesLoading}
                  disabled={update.isPending}
                  onSelect={onRuntimeSelect}
                />
                {!runtimeValid ? (
                  <Text className="text-xs text-destructive">
                    Select a runtime for this agent.
                  </Text>
                ) : null}
              </Field>

              <Field label="Model">
                <ModelSelect
                  models={models}
                  value={model}
                  loading={modelsQuery.isLoading || modelsQuery.isFetching}
                  error={modelsQuery.isError}
                  supported={modelSelectionSupported}
                  disabled={update.isPending || !runtimeValid}
                  onSelect={setModel}
                />
              </Field>

              <Field label="Max concurrent tasks">
                <TextInput
                  value={maxTasksText}
                  onChangeText={(next) =>
                    setMaxTasksText(next.replace(/[^0-9]/g, ""))
                  }
                  placeholder="1"
                  placeholderTextColor={MOBILE_PLACEHOLDER_COLOR}
                  keyboardType="number-pad"
                  className="text-base text-foreground bg-secondary/50 rounded-md px-3 py-2"
                  editable={!update.isPending}
                />
                {!maxTasksValid ? (
                  <Text className="text-xs text-destructive">
                    Enter a number greater than 0.
                  </Text>
                ) : null}
              </Field>

              <Field label="Instructions">
                <AutosizeTextArea
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder="Instructions for this agent"
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

function RuntimeSelect({
  runtimes,
  selectedRuntimeId,
  currentRuntimeName,
  loading,
  disabled,
  onSelect,
}: {
  runtimes: RuntimeDevice[];
  selectedRuntimeId: string;
  currentRuntimeName?: string;
  loading: boolean;
  disabled: boolean;
  onSelect: (runtimeId: string) => void;
}) {
  const selectedRuntime = runtimes.find(
    (runtime) => runtime.id === selectedRuntimeId,
  );
  const showMissingRuntime =
    selectedRuntimeId &&
    !selectedRuntime &&
    !runtimes.some((runtime) => runtime.id === selectedRuntimeId);

  if (loading && runtimes.length === 0) {
    return (
      <View className="rounded-md bg-secondary/50 px-3 py-3">
        <Text className="text-sm text-muted-foreground">Loading runtimes...</Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {showMissingRuntime ? (
        <RuntimeOption
          name={
            currentRuntimeName ?? `Current runtime ${selectedRuntimeId.slice(0, 8)}`
          }
          detail="Current runtime"
          selected
          disabled={disabled}
          onPress={() => onSelect(selectedRuntimeId)}
        />
      ) : null}
      {runtimes.map((runtime) => (
        <RuntimeOption
          key={runtime.id}
          name={runtime.name || runtime.id.slice(0, 8)}
          detail={[
            runtime.runtime_mode === "cloud" ? "Cloud" : "Local",
            runtime.provider || null,
            runtime.status === "online" ? "Online" : "Offline",
          ]
            .filter(Boolean)
            .join(" / ")}
          selected={runtime.id === selectedRuntimeId}
          disabled={disabled}
          onPress={() => onSelect(runtime.id)}
        />
      ))}
      {runtimes.length === 0 && !showMissingRuntime ? (
        <View className="rounded-md bg-secondary/50 px-3 py-3">
          <Text className="text-sm text-muted-foreground">
            No runtimes available.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function RuntimeOption({
  name,
  detail,
  selected,
  disabled,
  onPress,
}: {
  name: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={
        selected
          ? "rounded-md border border-brand bg-brand/10 px-3 py-2"
          : "rounded-md border border-border bg-secondary/50 px-3 py-2"
      }
    >
      <View className="flex-row items-center gap-3">
        <View
          className={
            selected
              ? "h-4 w-4 rounded-full border-4 border-brand"
              : "h-4 w-4 rounded-full border border-muted-foreground"
          }
        />
        <View className="flex-1">
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ModelSelect({
  models,
  value,
  loading,
  error,
  supported,
  disabled,
  onSelect,
}: {
  models: RuntimeModel[];
  value: string;
  loading: boolean;
  error: boolean;
  supported: boolean;
  disabled: boolean;
  onSelect: (model: string) => void;
}) {
  const selectedModel = models.find((model) => model.id === value);
  const showMissingModel =
    value.trim().length > 0 && !models.some((model) => model.id === value);

  if (!supported && !loading) {
    return (
      <View className="rounded-md bg-secondary/50 px-3 py-3">
        <Text className="text-sm text-muted-foreground">
          Model is managed by this runtime.
        </Text>
      </View>
    );
  }

  if (loading && models.length === 0) {
    return (
      <View className="rounded-md bg-secondary/50 px-3 py-3">
        <Text className="text-sm text-muted-foreground">
          Loading models...
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <ModelOption
        name="Use runtime default"
        detail="No model override"
        selected={value.trim().length === 0}
        disabled={disabled}
        onPress={() => onSelect("")}
      />
      {showMissingModel ? (
        <ModelOption
          name={selectedModel?.label || value}
          detail="Current model"
          selected
          disabled={disabled}
          onPress={() => onSelect(value)}
        />
      ) : null}
      {models.map((model) => (
        <ModelOption
          key={model.id}
          name={model.label || model.id}
          detail={[
            model.provider || null,
            model.default ? "Default" : null,
          ]
            .filter(Boolean)
            .join(" / ")}
          selected={model.id === value}
          disabled={disabled}
          onPress={() => onSelect(model.id)}
        />
      ))}
      {!loading && models.length === 0 && !error ? (
        <View className="rounded-md bg-secondary/50 px-3 py-3">
          <Text className="text-sm text-muted-foreground">
            No models available.
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text className="text-xs text-muted-foreground">
          Model discovery failed. Use runtime default or keep the current model.
        </Text>
      ) : null}
    </View>
  );
}

function ModelOption({
  name,
  detail,
  selected,
  disabled,
  onPress,
}: {
  name: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={
        selected
          ? "rounded-md border border-brand bg-brand/10 px-3 py-2"
          : "rounded-md border border-border bg-secondary/50 px-3 py-2"
      }
    >
      <View className="flex-row items-center gap-3">
        <View
          className={
            selected
              ? "h-4 w-4 rounded-full border-4 border-brand"
              : "h-4 w-4 rounded-full border border-muted-foreground"
          }
        />
        <View className="flex-1">
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </View>
    </Pressable>
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
