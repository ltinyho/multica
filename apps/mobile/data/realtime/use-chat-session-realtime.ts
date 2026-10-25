/**
 * Per-session chat realtime — Layer 3.
 *
 * Mounted by the chat screen with the active session id; cleans up on
 * navigate-away. All handlers self-gate on `chat_session_id === sessionId`.
 *
 * Messages / pendingTask caches are NOT patched here — those are kept fresh
 * for every session by the workspace-level `use-chat-sessions-realtime.ts`,
 * so a reply that lands while another session is on screen still shows up
 * when the user switches back. This hook only owns what the rendered
 * session needs:
 *
 *   - task:message          → append to the live execution trace
 *   - chat:session_deleted  → fire onSessionDeleted() so the screen can
 *                             drop the active id and unwind UI
 */
import { useQueryClient } from "@tanstack/react-query";
import { useWSSubscriptions } from "@/lib/use-ws-subscriptions";
import { appendTaskMessage } from "./chat-ws-updaters";

export function useChatSessionRealtime(
  sessionId: string | null,
  onSessionDeleted?: () => void,
) {
  const qc = useQueryClient();

  useWSSubscriptions(
    (ws) => {
      if (!sessionId) return;

      const isMine = (p: { chat_session_id?: string }) =>
        p.chat_session_id === sessionId;

      return [
        ws.on("chat:session_deleted", (payload) => {
          if (!isMine(payload)) return;
          onSessionDeleted?.();
        }),
        // Live execution trace for any task firing under this chat session.
        // Per-record gate: `chat_session_id` is optional on the payload
        // (issue tasks also fire `task:message`), so non-chat traffic is
        // filtered out here. The cache is keyed on `task_id` rather than
        // `sessionId`, so completed tasks still render their trace under the
        // assistant bubble after the live pill unmounts.
        ws.on("task:message", (payload) => {
          if (!isMine(payload)) return;
          appendTaskMessage(qc, payload);
        }),
      ];
    },
    [sessionId, qc, onSessionDeleted],
  );
}
