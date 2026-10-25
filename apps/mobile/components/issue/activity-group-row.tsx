/**
 * Collapsible group of consecutive activity rows. Collapsed by default to
 * save screen space — shows a single summary line like "12 activities".
 * Tap to expand and see individual entries; tap again to collapse.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TimelineEntry } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActivityRow } from "./activity-row";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";

export function ActivityGroupRow({ entries }: { entries: TimelineEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const { colorScheme } = useColorScheme();
  const mutedFg = THEME[colorScheme].mutedForeground;

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center px-4 py-1.5 gap-2"
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? `Collapse ${entries.length} activities`
            : `Expand ${entries.length} activities`
        }
      >
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-forward"}
          size={12}
          color={mutedFg}
        />
        <Text className="text-xs text-muted-foreground">
          {entries.length} activities
        </Text>
      </Pressable>
      {expanded
        ? entries.map((entry) => (
            <View key={entry.id} className="mt-1">
              <ActivityRow entry={entry} />
            </View>
          ))
        : null}
    </View>
  );
}
