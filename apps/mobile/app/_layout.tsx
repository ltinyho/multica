import "../global.css";

import { useCallback, useEffect, useRef } from "react";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import type { NotificationResponse } from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { api } from "@/data/api";
import { queryClient } from "@/data/query-client";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { LightboxProvider, prewarmHighlighter } from "@/lib/markdown";
import { ActionSheetHost } from "@/lib/action-sheet";
import { NAV_THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";
import { requestNotificationPermissionOnce } from "@/lib/notifications";

// Kick off Shiki highlighter init at module load — fires once per process,
// finishes before the user navigates to any screen with a code block. If
// init fails (engine unavailable) the highlighter falls back to plain
// text; nothing here is allowed to throw.
prewarmHighlighter();

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const isInit = !useAuthStore((s) => s.isLoading);
  const isAuthed = !!useAuthStore((s) => s.user);
  const qc = useQueryClient();
  // Idempotent guard: 401 on multiple in-flight requests would otherwise
  // logout/navigate repeatedly during the same session-expire moment.
  const signingOutRef = useRef(false);
  const pendingNotifTarget = useRef<string | null>(null);
  const didNavigateNotif = useRef(false);

  const handleNotificationTap = useCallback(
    (resp: NotificationResponse) => {
      const data = resp.notification.request.content.data as Record<
        string,
        unknown
      >;
      const issueId = data?.issueId;
      if (!issueId || typeof issueId !== "string") return;

      const slug = useWorkspaceStore.getState().currentWorkspaceSlug;
      const target = slug
        ? `/${slug}/issue/${issueId}`
        : `/_/issue/${issueId}`;
      didNavigateNotif.current = false;
      if (isInit && isAuthed) {
        didNavigateNotif.current = true;
        router.push(target as any);
      } else {
        pendingNotifTarget.current = target;
      }
    },
    [isInit, isAuthed],
  );

  useEffect(() => {
    const sub =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationTap,
      );
    return () => sub.remove();
  }, [handleNotificationTap]);

  useEffect(() => {
    if (!isInit || !isAuthed) return;
    const target = pendingNotifTarget.current;
    if (!target || didNavigateNotif.current) return;
    pendingNotifTarget.current = null;
    didNavigateNotif.current = true;
    router.push(target as any);
  }, [isInit, isAuthed]);

  useEffect(() => {
    // Wire 401 handling onto the shared ApiClient singleton. Must be set
    // before any request fires — initialize() below kicks off the first
    // getMe() call, so do this synchronously first.
    api.setOptions({
      onUnauthorized: () => {
        if (signingOutRef.current) return;
        signingOutRef.current = true;
        void (async () => {
          await useAuthStore.getState().logout();
          await useWorkspaceStore.getState().clear();
          qc.clear();
          router.replace("/login");
          // Reset on next tick so a fresh session can hit 401 again later
          // without being silently swallowed.
          setTimeout(() => {
            signingOutRef.current = false;
          }, 0);
        })();
      },
    });
    initialize();
    void requestNotificationPermissionOnce().catch((err) => {
      console.warn("[notifications] permission request failed", err);
    });
  }, [initialize, qc]);

  return <>{children}</>;
}

export default function RootLayout() {
  const { colorScheme, isDarkColorScheme } = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider value={NAV_THEME[colorScheme]}>
              <AuthInitializer>
                <LightboxProvider>
                  <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                  </Stack>
                  <PortalHost />
                  <ActionSheetHost />
                </LightboxProvider>
              </AuthInitializer>
            </ThemeProvider>
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
