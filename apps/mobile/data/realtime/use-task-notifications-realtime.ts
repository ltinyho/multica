/**
 * Workspace-level local notifications for task terminal events.
 *
 * Most issue/comment notifications arrive as `inbox:new` and are handled by
 * useInboxRealtime. Plain task completions do not currently create inbox rows
 * server-side, so listen to task terminal events directly for mobile system
 * notifications while the app is recently backgrounded.
 */
import { notifyTaskFinished } from "@/lib/notifications";
import { useWSSubscriptions } from "@/lib/use-ws-subscriptions";

export function useTaskNotificationsRealtime() {
  useWSSubscriptions(
    (ws) => [
      ws.on("task:completed", (payload) => {
        if (!payload.issue_id && !payload.chat_session_id) return;
        void notifyTaskFinished(payload, "completed").catch((err) => {
          console.warn("[notifications] failed to show task completion", err);
        });
      }),
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
