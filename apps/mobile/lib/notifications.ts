import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type {
  InboxItem,
  TaskCompletedPayload,
  TaskFailedPayload,
} from "@multica/core/types";
import { getInboxDisplayTitle } from "@/lib/inbox-display";

let configured = false;
let permissionRequested = false;

function configureNotifications() {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Notifications",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function requestNotificationPermissionOnce() {
  configureNotifications();
  await ensureAndroidNotificationChannel();

  if (permissionRequested) return;
  permissionRequested = true;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return;
  await Notifications.requestPermissionsAsync();
}

export async function sendTestNotification() {
  await requestNotificationPermissionOnce();

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) {
    throw new Error("Notification permission has not been granted.");
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Multica test notification",
      body: "Local system notifications are working on this device.",
    },
    trigger: null,
  });
}

export async function notifyInboxItem(item: InboxItem) {
  configureNotifications();
  await ensureAndroidNotificationChannel();
  if (AppState.currentState === "active") return;

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) return;

  const body = (item.body ?? "").replace(/\s+/g, " ").trim();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: getInboxDisplayTitle(item),
      body: body || item.title,
      data: {
        inboxItemId: item.id,
        issueId: item.issue_id,
        type: item.type,
      },
    },
    trigger: null,
  });
}

export async function notifyUnreadInboxItems(items: readonly InboxItem[]) {
  for (const item of items) {
    if (item.read || item.archived) continue;
    await notifyInboxItem(item);
  }
}

export async function notifyTaskFinished(
  payload: TaskCompletedPayload | TaskFailedPayload,
  outcome: "completed" | "failed",
) {
  configureNotifications();
  await ensureAndroidNotificationChannel();
  if (AppState.currentState === "active") return;

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) return;

  const isChatTask = Boolean(payload.chat_session_id);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: outcome === "completed" ? "Task completed" : "Task failed",
      body: isChatTask
        ? outcome === "completed"
          ? "An assistant reply is ready in Chat."
          : "A chat task failed."
        : outcome === "completed"
          ? "An agent finished a task."
          : "An agent task failed.",
      data: {
        taskId: payload.task_id,
        agentId: payload.agent_id,
        issueId: payload.issue_id,
        chatSessionId: payload.chat_session_id,
        type: `task:${outcome}`,
      },
    },
    trigger: null,
  });
}
