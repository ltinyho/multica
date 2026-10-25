import { NativeModules, Platform } from "react-native";
import { API_URL } from "@/data/api";
import { getToken } from "@/data/secure-storage";

interface InboxForegroundServiceModule {
  start(token: string, workspaceSlug: string, apiUrl: string): void;
  stop(): void;
}

const nativeModule = NativeModules.InboxForegroundService as
  | InboxForegroundServiceModule
  | undefined;

export async function startForegroundInboxService(workspaceSlug: string) {
  if (Platform.OS !== "android" || !nativeModule || !API_URL) return;
  const token = await getToken();
  if (!token) return;
  nativeModule.start(token, workspaceSlug, API_URL);
}

export function stopForegroundInboxService() {
  if (Platform.OS !== "android" || !nativeModule) return;
  nativeModule.stop();
}
