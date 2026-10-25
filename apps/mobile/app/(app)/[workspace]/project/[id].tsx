/**
 * Project detail screen. Single column, scrolling:
 *
 *   Header card (icon + title + description, tap → edit)
 *   Properties section (Status / Priority / Lead — tap chip → picker)
 *   Resources section (read-only by default, "Add" button → resource form)
 *   Related issues (Open / Done bucketed list)
 *
 * Per-record realtime: `useProjectRealtime(id, onDeleted=back)` subscribes
 * to `project:updated` (full replace) and `project:deleted` (pop back).
 *
 * Right-top "…" menu (ActionSheetIOS) → Edit / Delete. Delete asks for
 * confirmation via `Alert.alert` per iOS HIG (destructive actions need
 * a second tap).
 */
import { useCallback } from "react";
import { Alert, Linking, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconButton } from "@/components/ui/icon-button";
import { ProjectHeaderCard } from "@/components/project/project-header-card";
import { ProjectPropertiesSection } from "@/components/project/project-properties-section";
import { ProjectRelatedIssues } from "@/components/project/project-related-issues";
import { ProjectResourcesSection } from "@/components/project/project-resources-section";
import {
  projectDetailOptions,
  projectListOptions,
  projectResourcesOptions,
} from "@/data/queries/projects";
import { issueKeys } from "@/data/queries/issue-keys";
import { useDeleteProject } from "@/data/mutations/projects";
import { pinListOptions } from "@/data/queries/pins";
import { useCreatePin, useDeletePin } from "@/data/mutations/pins";
import { useAuthStore } from "@/data/auth-store";
import { useProjectRealtime } from "@/data/realtime/use-project-realtime";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  showActionSheetWithOptions,
  type ActionSheetItem,
} from "@/lib/action-sheet";
import { WEB_URL } from "@/lib/urls";

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const qc = useQueryClient();

  // Projects list rows carry the full project — render from that while
  // the detail request is in flight.
  const detail = useQuery({
    ...projectDetailOptions(wsId, id),
    placeholderData: () =>
      qc.getQueryData(projectListOptions(wsId).queryKey)?.find((p) => p.id === id),
  });
  const deleteProject = useDeleteProject(id);

  // Per-record realtime — when another client deletes the project we're
  // viewing, pop back so the user isn't stranded on a 404.
  useProjectRealtime(id, () => router.back());

  const onRefresh = useCallback(async () => {
    await Promise.all([
      detail.refetch(),
      qc.invalidateQueries({ queryKey: projectResourcesOptions(wsId, id).queryKey }),
      qc.invalidateQueries({
        queryKey: [...issueKeys.list(wsId), "byProject", id],
      }),
    ]);
  }, [detail, qc, wsId, id]);

  const project = detail.data;

  // EMPTY_PROJECT carries an empty id — parseWithFallback returned the
  // fallback because the response shape drifted. Treat as "not found".
  const projectMissing = !project || project.id === "";

  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { data: pins } = useQuery(pinListOptions(wsId, userId));
  const isPinned =
    !!project &&
    !!pins?.some(
      (p) => p.item_type === "project" && p.item_id === project.id,
    );
  const createPin = useCreatePin();
  const deletePin = useDeletePin();

  const onPressMore = () => {
    if (!project) return;
    const pinIcon = isPinned ? "pin-outline" : "pin";
    const options = [
      { label: "Cancel" },
      { label: isPinned ? "Unpin" : "Pin", icon: pinIcon },
      { label: "Edit details", icon: "create-outline" },
      { label: "Open on web", icon: "globe-outline" },
      { label: "Delete", icon: "trash-outline" },
    ] satisfies ActionSheetItem[];
    const destructiveIndex = options.length - 1;
    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
        destructiveButtonIndex: destructiveIndex,
      },
      (i) => {
        const label = options[i]?.label;
        if (label === "Pin") {
          createPin.mutate({ item_type: "project", item_id: project.id });
          return;
        }
        if (label === "Unpin") {
          deletePin.mutate({ itemType: "project", itemId: project.id });
          return;
        }
        if (label === "Edit details") {
          if (wsSlug) router.push(`/${wsSlug}/project/${id}/edit`);
          return;
        }
        if (label === "Open on web") {
          Linking.openURL(`${WEB_URL}/${wsSlug}/projects/${id}`);
          return;
        }
        if (i === destructiveIndex) {
          onDelete();
        }
      },
    );
  };

  const onDelete = () => {
    Alert.alert(
      "Delete project?",
      "This cannot be undone. Issues in this project will become unassigned from any project.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteProject.mutate(undefined, {
              onSuccess: () => router.back(),
            });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: project?.title || "Project",
          headerBackTitle: "Back",
          headerRight: project
            ? () => (
                <IconButton
                  name="ellipsis-horizontal"
                  onPress={onPressMore}
                  accessibilityLabel="Project actions"
                />
              )
            : undefined,
        }}
      />
      {detail.isLoading ? (
        <ProjectDetailLoading />
      ) : detail.error || projectMissing ? (
        <View className="flex-1 items-center justify-center px-6 gap-3">
          <Text className="text-sm text-destructive text-center">
            Failed to load project:{" "}
            {detail.error instanceof Error
              ? detail.error.message
              : "not found"}
          </Text>
          <Button variant="outline" onPress={() => detail.refetch()}>
            <Text>Retry</Text>
          </Button>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="pb-10"
          refreshControl={
            <RefreshControl
              refreshing={detail.isRefetching && !detail.isPlaceholderData}
              onRefresh={onRefresh}
            />
          }
          keyboardDismissMode="on-drag"
        >
          <ProjectHeaderCard
            project={project}
            onEdit={() => {
              if (wsSlug) router.push(`/${wsSlug}/project/${id}/edit`);
            }}
          />
          <ProjectPropertiesSection
            project={project}
            onPressStatus={() => {
              if (wsSlug)
                router.push({
                  pathname: "/[workspace]/project/[id]/picker/status",
                  params: { workspace: wsSlug, id },
                });
            }}
            onPressPriority={() => {
              if (wsSlug)
                router.push({
                  pathname: "/[workspace]/project/[id]/picker/priority",
                  params: { workspace: wsSlug, id },
                });
            }}
            onPressLead={() => {
              if (wsSlug)
                router.push({
                  pathname: "/[workspace]/project/[id]/picker/lead",
                  params: { workspace: wsSlug, id },
                });
            }}
          />
          <ProjectResourcesSection
            projectId={id}
            onAdd={() => {
              if (wsSlug)
                router.push({
                  pathname: "/[workspace]/project/[id]/add-resource",
                  params: { workspace: wsSlug, id },
                });
            }}
          />
          <View className="h-3" />
          <ProjectRelatedIssues projectId={id} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ProjectDetailLoading() {
  return (
    <View className="px-4 pt-4 gap-4">
      <Skeleton className="size-8 rounded-md" />
      <Skeleton className="h-7 w-2/3" />
      <View className="gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </View>
      <Skeleton className="h-2 w-full rounded-full mt-2" />
      <View className="gap-3 mt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </View>
    </View>
  );
}
