/**
 * Best-effort local notification fallback for background Android sessions.
 *
 * WebSocket events are still the fast path, but Android may throttle a
 * backgrounded JS socket/timer even when the user has disabled battery killing.
 * Polling the authoritative inbox gives us a second path: if the app process is
 * alive and the inbox contains an unread item we have not notified for this
 * session, schedule a system notification.
 */
import { useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import type { InboxItem } from "@multica/core/types";
import { api } from "@/data/api";
import { inboxKeys } from "@/data/queries/inbox";
import { useWorkspaceStore } from "@/data/workspace-store";
import { notifyUnreadInboxItems } from "@/lib/notifications";
import { useQueryClient } from "@tanstack/react-query";

const POLL_INTERVAL_MS = 30_000;

export function useInboxNotificationPoller() {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const notifiedIdsRef = useRef(new Set<string>());
  const pollingRef = useRef(false);

  useEffect(() => {
    notifiedIdsRef.current.clear();
  }, [wsId]);

  useEffect(() => {
    if (Platform.OS === "android") return;
    if (!wsId) return;

    let cancelled = false;

    const poll = async (reason: string) => {
      if (cancelled || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const items = await api.listInbox();
        if (cancelled) return;

        qc.setQueryData(inboxKeys.list(wsId), items);

        const unseenUnread = items.filter((item: InboxItem) => {
          if (item.read || item.archived) return false;
          if (notifiedIdsRef.current.has(item.id)) return false;
          return true;
        });

        for (const item of unseenUnread) {
          notifiedIdsRef.current.add(item.id);
        }
        if (unseenUnread.length > 0) {
          console.info("[notifications] inbox poll found unread items", {
            reason,
            count: unseenUnread.length,
          });
          await notifyUnreadInboxItems(unseenUnread);
        }
      } catch (err) {
        console.warn("[notifications] inbox poll failed", err);
      } finally {
        pollingRef.current = false;
      }
    };

    const onAppStateChange = (status: AppStateStatus) => {
      if (status !== "active") {
        void poll(status);
      }
    };

    const appStateSub = AppState.addEventListener("change", onAppStateChange);
    if (AppState.currentState !== "active") {
      void poll(AppState.currentState);
    }
    const timer = setInterval(() => {
      if (AppState.currentState !== "active") {
        void poll("interval");
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      appStateSub.remove();
      clearInterval(timer);
    };
  }, [qc, wsId]);
}
