/**
 * Workspace-level local notifications for task terminal events.
 *
 * Most concrete notifications arrive as `inbox:new` and are handled by
 * useInboxRealtime / the Android foreground inbox service. Task completion
 * payloads only carry ids, so a generic "Task completed" notification is noisy
 * and duplicates the eventual concrete inbox item. Keep only task failures
 * here because they are actionable even without a richer message.
 */
import { notifyTaskFinished } from "@/lib/notifications";
import { useWSSubscriptions } from "@/lib/use-ws-subscriptions";

export function useTaskNotificationsRealtime() {
  useWSSubscriptions(
    (ws) => [
      ws.on("task:failed", (payload) => {
        if (!payload.issue_id && !payload.chat_session_id) return;
        void notifyTaskFinished(payload, "failed").catch((err) => {
          console.warn("[notifications] failed to show task failure", err);
        });
      }),
    ],
    [],
  );
}
