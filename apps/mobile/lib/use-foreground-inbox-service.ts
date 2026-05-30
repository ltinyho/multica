import { useEffect } from "react";
import { Platform } from "react-native";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  startForegroundInboxService,
  stopForegroundInboxService,
} from "./foreground-inbox-service";

export function useForegroundInboxService() {
  const workspaceSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);

  useEffect(() => {
    if (Platform.OS !== "android" || !workspaceSlug) return;

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
