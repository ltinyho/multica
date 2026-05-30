import { useEffect } from "react";
import { Platform } from "react-native";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  startForegroundInboxService,
  stopForegroundInboxService,
} from "./foreground-inbox-service";

const ENABLE_FOREGROUND_INBOX_SERVICE =
  process.env.EXPO_PUBLIC_ANDROID_INBOX_SERVICE !== "none";

export function useForegroundInboxService() {
  const workspaceSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);

  useEffect(() => {
    if (
      Platform.OS !== "android" ||
      !ENABLE_FOREGROUND_INBOX_SERVICE ||
      !workspaceSlug
    ) {
      return;
    }

    let cancelled = false;
    void startForegroundInboxService(workspaceSlug).then(() => {
      if (cancelled) stopForegroundInboxService();
    });

    return () => {
      cancelled = true;
      stopForegroundInboxService();
    };
  }, [workspaceSlug]);
}
