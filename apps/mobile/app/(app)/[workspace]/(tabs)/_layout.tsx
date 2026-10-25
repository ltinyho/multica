/**
 * Bottom tab bar — JS `<Tabs>` from expo-router (react-navigation under the
 * hood). We tried NativeTabs first but its `canPreventDefault: false`
 * constraint makes "tap More → open something" impossible. JS Tabs
 * supports `listeners.tabPress + e.preventDefault()`, the canonical RN
 * pattern for tab-as-action.
 *
 * The "More" tab is **not a navigation target** — its press opens a
 * DropdownMenu popover anchored above the tab. The popover is rendered
 * by `<MoreTabDropdownAnchor />` as a sibling of `<Tabs>`, NOT as a
 * `tabBarButton` replacement: keeping the real tab button intact means
 * the icon + "More" label render identically to the other three tabs.
 * We just open the dropdown imperatively from `listeners.tabPress` via
 * the exposed `TriggerRef.open()`.
 *
 * The stub (tabs)/more.tsx file still exists only because expo-router
 * requires every Tabs.Screen to have a backing route file — the press
 * is preventDefault'd so we never actually navigate to it.
 *
 * Active / inactive tint colors are derived from the current colour
 * scheme via THEME so dark mode picks contrasting values automatically.
 */
import { useCallback, useRef } from "react";
import { Tabs } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TriggerRef } from "@rn-primitives/dropdown-menu";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useAuthStore } from "@/data/auth-store";
import { issueListOptions } from "@/data/queries/issues";
import { projectListOptions } from "@/data/queries/projects";
import { agentListOptions } from "@/data/queries/agents";
import { squadListOptions } from "@/data/queries/squads";
import { pinListOptions } from "@/data/queries/pins";
import { autopilotListOptions } from "@/data/queries/autopilots";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import {
  useInboxUnreadCount,
  useChatUnreadSessionCount,
} from "@/lib/unread-counts";
import { MoreTabDropdownAnchor } from "@/components/nav/more-tab-dropdown";

// Only override backgroundColor — @react-navigation/elements Badge internally
// sets borderRadius = size/2, height = size, minWidth = size, so a single
// character renders as a perfect circle. Overriding minWidth/fontSize here
// breaks that geometry. Text color is auto-derived from backgroundColor
// luminance by Badge itself (white on brand blue).
const BADGE_STYLE = {
  backgroundColor: THEME.light.brand,
};

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const t = THEME[colorScheme];

  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const inboxUnread = useInboxUnreadCount(wsId);
  const chatUnread = useChatUnreadSessionCount(wsId);

  // Truncation aligned with web: inbox 99+, chat 9+ (matches sidebar +
  // ChatFab respectively). `undefined` makes React Navigation hide the
  // badge, so zero-count is a free no-op.
  const inboxBadge =
    inboxUnread > 0 ? (inboxUnread > 99 ? "99+" : String(inboxUnread)) : undefined;
  const chatBadge =
    chatUnread > 0 ? (chatUnread > 9 ? "9+" : String(chatUnread)) : undefined;

  // Imperative handle into the More tab's dropdown — listeners.tabPress
  // calls .open(); the @rn-primitives Trigger measures itself inside
  // open() so the popover anchors to MoreTabDropdownAnchor's rect.
  const moreTriggerRef = useRef<TriggerRef>(null);

  // Opening the More popover is a strong signal the user is about to jump
  // into one of its list pages — start those fetches now so the page
  // renders with data instead of a skeleton. prefetchQuery is a no-op for
  // caches that are still fresh.
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const prefetchMoreDestinations = useCallback(() => {
    if (!wsId) return;
    void qc.prefetchQuery(issueListOptions(wsId));
    void qc.prefetchQuery(projectListOptions(wsId));
    void qc.prefetchQuery(agentListOptions(wsId));
    void qc.prefetchQuery(squadListOptions(wsId));
    void qc.prefetchQuery(autopilotListOptions(wsId));
    if (userId) void qc.prefetchQuery(pinListOptions(wsId, userId));
  }, [qc, wsId, userId]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.foreground,
          tabBarInactiveTintColor: t.mutedForeground,
          tabBarStyle: { backgroundColor: t.background },
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="inbox"
          options={{
            title: "Inbox",
            tabBarBadge: inboxBadge,
            tabBarBadgeStyle: BADGE_STYLE,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "file-tray-full" : "file-tray-full-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="my-issues"
          options={{
            title: "My Issues",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "checkmark-circle" : "checkmark-circle-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: "Chat",
            tabBarBadge: chatBadge,
            tabBarBadgeStyle: BADGE_STYLE,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "chatbubble" : "chatbubble-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: "More",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="ellipsis-horizontal" size={size} color={color} />
            ),
          }}
          listeners={() => ({
            tabPress: (e) => {
              // Don't navigate to the (stub) /more screen — open the
              // dropdown popover instead. The trigger is invisible and
              // mounted in MoreTabDropdownAnchor below; ref.open() also
              // measures its rect so the popover anchors correctly.
              e.preventDefault();
              prefetchMoreDestinations();
              moreTriggerRef.current?.open();
            },
          })}
        />
      </Tabs>

      <MoreTabDropdownAnchor triggerRef={moreTriggerRef} />
    </View>
  );
}
