import type { ComponentType } from "react";
import type { PluginRpcContract } from "@get-bb/plugin-sdk";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { renderSlot as sdkRenderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { RenderSlotOptions, RenderedSlot } from "@get-bb/plugin-sdk/testing/app";

type SidebarCall = { method: string; threadId?: string; options?: unknown; pinned?: boolean; read?: boolean; title?: string };

/** Preserve the existing behavior assertions while using SDK writes/navigation. */
export function renderSlot<Props extends object, Contract extends PluginRpcContract = PluginRpcContract>(
  registration: { component: ComponentType<Props> }, props: Props, options: RenderSlotOptions<Contract> = {},
): RenderedSlot & { readonly sidebarActionCalls: SidebarCall[] } {
  const fakes = options.sdk?.threads;
  const result = sdkRenderSlot(registration, props, {
    ...options,
    sdk: { ...options.sdk, threads: {
      pin: async () => makeThreadResponse(), unpin: async () => makeThreadResponse(),
      markRead: async () => makeThreadResponse(),
      markUnread: async () => makeThreadResponse(),
      update: async () => makeThreadResponse(), archive: async ({ threadId }) => ({ ok: true, archivedThreadIds: [threadId] }),
      ...fakes,
    } },
    threadActions: options.threadActions ?? (thread => [{ key: "bb--core/archive", pluginId: "bb--core", group: "archive",
      action: { label: "Archive", icon: "Archive", run: async () => {
        // This fake models a confirmed host action; production owns the prompt.
        await resultSdkArchive(thread.id);
      } },
    }]),
  });
  // Run through the provided SDK fake and record the confirmed archive intent.
  const confirmedArchives: SidebarCall[] = [];
  async function resultSdkArchive(threadId: string) {
    confirmedArchives.push({ method: "archive", threadId });
    await fakes?.archive?.({ threadId });
  }
  return Object.defineProperty(result, "sidebarActionCalls", { configurable: true, get: () => {
    // 0.6.37 still logs its synthetic split-source pointer probes here, although
    // that legacy log is no longer declared on RenderedSlot.
    const probes = (result.inspection as unknown as { sidebarActionCalls?: SidebarCall[] }).sidebarActionCalls ?? [];
    const navigation = result.inspection.navigateCalls.flatMap<SidebarCall>(call => {
      if (call.method === "toThread") return [{ ...call, method: "open" }];
      if (call.method === "toCompose") return [{ ...call, method: "openNewThread" }];
      return [];
    });
    const mutations = result.inspection.sdkCalls.flatMap<SidebarCall>(call => {
      const input = call.args[0] as { threadId: string; title?: string };
      if (call.method === "threads.pin" || call.method === "threads.unpin") return [{ method: "setPinned", threadId: input.threadId, pinned: call.method === "threads.pin" }];
      if (call.method === "threads.markRead" || call.method === "threads.markUnread") return [{ method: "setRead", threadId: input.threadId, read: call.method === "threads.markRead" }];
      if (call.method === "threads.update" && input.title) return [{ method: "rename", threadId: input.threadId, title: input.title }];
      return [];
    });
    return [...probes, ...navigation, ...mutations, ...confirmedArchives];
  } }) as ReturnType<typeof sdkRenderSlot> & { sidebarActionCalls: SidebarCall[] };
}
