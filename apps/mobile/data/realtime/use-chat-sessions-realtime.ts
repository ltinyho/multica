/**
 * Chat workspace-level realtime — Layer 3.
 *
 * Mounted globally in workspace `_layout.tsx` via `<RealtimeSubscriptions />`.
 * Keeps every chat cache fresh regardless of which tab / session the user
 * is on:
 *   - chatKeys.sessions(wsId)        — titles, has_unread, deletions
 *   - chatKeys.messages(sessionId)   — for EVERY session, not just the
 *                                       one on screen
 *   - chatKeys.pendingTask(sessionId)— same
 *
 * Why messages / pendingTask live here instead of the per-session hook:
 * both caches use `staleTime: Infinity` and are keyed per session. When a
 * reply landed for a session that wasn't on screen (user switched sessions
 * mid-run, or the chat tab hadn't hydrated yet), a per-session filter
 * dropped the event, and re-opening that session served the stale cache —
 * no reply, and a "working" pill that never cleared. Mirrors web's global
 * chat handlers in `packages/core/realtime/use-realtime-sync.ts`. Every
 * handler is an O(1) patch on one key, and patches on keys that were never
 * fetched are no-ops, so this doesn't scale with sessions visited.
 *
 * `task:message` (live trace) and `chat:session_deleted`'s screen unwind
 * stay in `use-chat-session-realtime.ts` — they only matter for the
 * session currently rendered.
 */
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "@/data/queries/chat";
import { useWSSubscriptions } from "@/lib/use-ws-subscriptions";
import {
  applyChatDoneToCache,
  clearPendingTask,
  dropSessionFromList,
  patchSessionListAfterRename,
  promotePendingTaskToRunning,
  seedPendingTaskFromQueued,
} from "./chat-ws-updaters";

export function useChatSessionsRealtime() {
  const qc = useQueryClient();

  useWSSubscriptions(
    (ws, wsId) => {
      const invalidateSessions = () =>
        qc.invalidateQueries({ queryKey: chatKeys.sessions(wsId) });

      return [
        // User-message echo (this device or another one). Invalidate only
        // refetches mounted queries; unmounted sessions are just marked
        // stale and refetch when opened.
        ws.on("chat:message", (payload) => {
          qc.invalidateQueries({
            queryKey: chatKeys.messages(payload.chat_session_id),
          });
          qc.invalidateQueries({
            queryKey: chatKeys.pendingTask(payload.chat_session_id),
          });
        }),
        ws.on("chat:done", (payload) => {
          applyChatDoneToCache(qc, payload);
          // has_unread flips server-side; refetch so the dot shows even when
          // the user isn't in the chat screen.
          invalidateSessions();
        }),
        ws.on("task:queued", (payload) => {
          seedPendingTaskFromQueued(qc, payload);
        }),
        ws.on("task:dispatch", (payload) => {
          promotePendingTaskToRunning(qc, payload);
        }),
        ws.on("task:cancelled", (payload) => {
          if (!payload.chat_session_id) return;
          clearPendingTask(qc, payload.chat_session_id);
        }),
        ws.on("task:completed", (payload) => {
          if (!payload.chat_session_id) return;
          // `chat:done` already wrote the assistant message and cleared
          // pendingTask. Defensive clear in case the two events arrive out
          // of order on a flaky network.
          clearPendingTask(qc, payload.chat_session_id);
        }),
        ws.on("task:failed", (payload) => {
          if (!payload.chat_session_id) return;
          // FailTask persists a destructive assistant message — surface it
          // by refetching messages and clearing the pending pill.
          clearPendingTask(qc, payload.chat_session_id);
          qc.invalidateQueries({
            queryKey: chatKeys.messages(payload.chat_session_id),
          });
        }),
        // chat:session_read clears the unread flag (could be triggered from
        // web/desktop on the same account).
        ws.on("chat:session_read", invalidateSessions),
        // chat:session_updated has no formal payload type yet — server
        // emits {chat_session_id, title?, updated_at?}. Narrow inline.
        ws.on("chat:session_updated", (p) => {
          const payload = p as {
            chat_session_id: string;
            title?: string;
            updated_at?: string;
          };
          patchSessionListAfterRename(qc, wsId, payload);
        }),
        ws.on("chat:session_deleted", (payload) => {
          dropSessionFromList(qc, wsId, payload);
        }),
        // Reconnect: we may have missed events while disconnected. Prefix
        // invalidation refetches only the mounted session; every other
        // session's cache is marked stale and refetches when reopened.
        ws.onReconnect(() => {
          invalidateSessions();
          qc.invalidateQueries({ queryKey: chatKeys.allMessages() });
          qc.invalidateQueries({ queryKey: chatKeys.allPendingTasks() });
        }),
      ];
    },
    [qc],
  );
}
