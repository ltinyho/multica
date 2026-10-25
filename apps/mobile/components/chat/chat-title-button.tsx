/**
 * Centred, tappable title region for the Chat tab's native Stack header.
 * Rendered as `headerTitle: () => <ChatTitleButton ... />` so iOS positions
 * it where it expects the screen title, but the whole region is a Pressable
 * — tap opens the sessions + agent picker sheet.
 */
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Agent, ChatSession } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

interface Props {
  currentSession: ChatSession | null;
  currentAgent: Agent | null;
  onPress: () => void;
}

export function ChatTitleButton({
  currentSession,
  currentAgent,
  onPress,
}: Props) {
  const agentName = currentAgent?.name ?? "Chat";
  const subtitle = currentSession?.title || "New chat";
  const { colorScheme } = useColorScheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      className="flex-row items-center gap-2 px-2 py-1 rounded-lg active:bg-secondary"
      accessibilityRole="button"
      accessibilityLabel="Sessions and agent picker"
    >
      <ActorAvatar
        type={currentAgent ? "agent" : null}
        id={currentAgent?.id ?? null}
        size={24}
        showPresence
      />
      {/* flex-1 gives the name a definite width: with an intrinsic-width
          wrapper Android under-measured the semibold text and ellipsized
          names that had plenty of room ("devops_co…"). */}
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center">
          <Text
            className="text-base font-semibold text-foreground flex-shrink"
            numberOfLines={1}
          >
            {agentName}
          </Text>
          <Ionicons
            name="chevron-down"
            size={14}
            color={THEME[colorScheme].mutedForeground}
            style={{ marginLeft: 4 }}
          />
        </View>
        <Text
          className="text-xs text-muted-foreground"
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}
