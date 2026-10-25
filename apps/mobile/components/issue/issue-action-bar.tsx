/**
 * Compact action bar for the issue detail screen. Sits between the header
 * card and the description, surfacing the most-used actions as visible
 * icon+label buttons instead of hiding them behind a three-dot menu.
 *
 * Actions:
 *   - Open on web (globe)
 *   - Copy link (link)
 *   - Pin / Unpin (bookmark)
 *   - More (ellipsis → overflow menu with Edit details, Delete)
 *
 * The bar uses pill-shaped Pressable buttons with an icon and a short
 * label, separated by subtle vertical dividers into logical groups.
 */
import { Linking, Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { WEB_URL } from "@/lib/urls";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useCreatePin, useDeletePin } from "@/data/mutations/pins";

interface Props {
  issueId: string;
  issueIdentifier: string;
  isPinned: boolean;
  onMore: () => void;
}

export function IssueActionBar({
  issueId,
  issueIdentifier,
  isPinned,
  onMore,
}: Props) {
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const createPin = useCreatePin();
  const deletePin = useDeletePin();

  const issueLink = wsSlug
    ? `${WEB_URL}/${wsSlug}/issues/${issueId}`
    : null;

  const handleOpenOnWeb = () => {
    if (issueLink) Linking.openURL(issueLink);
  };

  const handleCopyLink = () => {
    if (issueLink) Clipboard.setStringAsync(issueLink);
  };

  const handleTogglePin = () => {
    if (isPinned) {
      deletePin.mutate({ itemType: "issue", itemId: issueId });
    } else {
      createPin.mutate({ item_type: "issue", item_id: issueId });
    }
  };

  return (
    <View className="flex-row items-center px-4 py-2 gap-0">
      <ActionButton
        icon="globe-outline"
        label="Open on web"
        onPress={handleOpenOnWeb}
      />
      <Divider />
      <ActionButton
        icon="link-outline"
        label="Copy link"
        onPress={handleCopyLink}
      />
      <Divider />
      <ActionButton
        icon={isPinned ? "bookmark" : "bookmark-outline"}
        label={isPinned ? "Unpin" : "Pin"}
        onPress={handleTogglePin}
      />
      <Divider />
      <ActionButton
        icon="ellipsis-horizontal"
        label="More"
        onPress={onMore}
      />
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "flex-1 flex-row items-center justify-center gap-1.5",
        "py-2 rounded-lg active:bg-secondary/60",
      )}
      hitSlop={4}
    >
      <Ionicons name={icon} size={16} className="text-foreground" />
      <Text className="text-xs font-medium text-foreground">{label}</Text>
    </Pressable>
  );
}

function Divider() {
  return <View className="w-px h-4 bg-border/60" />;
}
