import { useMemo } from "react";
import { useSdk, useBbNavigate, type PluginSidebarThread, type PluginThreadActionTarget } from "@get-bb/plugin-sdk/app";

/** Current SDK equivalents of the removed sidebar operations hook. */
export function useThreadOperations() {
  const sdk = useSdk();
  const navigate = useBbNavigate();
  return useMemo(() => ({
    open: navigate.toThread,
    openNewThread: navigate.toCompose,
    setPinned: async (threadId: string, pinned: boolean) => {
      await (pinned ? sdk.threads.pin({ threadId }) : sdk.threads.unpin({ threadId }));
    },
    setRead: async (threadId: string, read: boolean) => {
      await (read ? sdk.threads.markRead({ threadId }) : sdk.threads.markUnread({ threadId }));
    },
    rename: async (threadId: string, title: string) => {
      await sdk.threads.update({ threadId, title });
    },
  }), [sdk, navigate]);
}

export function threadActionTarget(thread: PluginSidebarThread): PluginThreadActionTarget {
  return { ...thread, environment: thread.environment?.id
    ? { id: thread.environment.id, path: thread.environment.path } : null };
}
