// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { idleSidebarThreadFields } from "./test-fixtures";
import { DEFAULT_SIDEBAR_SETTINGS, quickActionKeysOf } from "./sidebar-settings";
import { threadRange } from "./ThreadSelection";

const app = await loadPluginApp(() => import("../app"));
const props = { activeThreadId: null, activeProjectId: null, isCompactViewport: false, searchQuery: "", onNavigate: vi.fn() };
const errors = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: errors, success: vi.fn(), message: vi.fn() } }));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

function thread(id: string): PluginSidebarThread {
  return { ...idleSidebarThreadFields, id, projectId: "proj_1", title: id, titleFallback: null,
    displayTitle: id, parentThreadId: null, sectionId: null, originKind: null, originPluginId: null,
    providerId: "codex", hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none", indicatorLabel: "Idle", isUnread: false, isPinned: false, isArchived: false,
    lastReadAt: 100, latestAttentionAt: 100,
    environment: null, host: null, createdAt: 100, updatedAt: 100 };
}
const rows = [thread("thr_a"), thread("thr_b"), thread("thr_c")];
const rpc = {
  getSidebarSettings: () => ({ ...DEFAULT_SIDEBAR_SETTINGS, inactiveThreadsEnabled: false }),
  listLifecycle: () => ({ rows: [] }), listInboxOrder: () => ({ threadIds: rows.map(row => row.id) }),
};

it("selects the visible range without navigation, extends in reverse, and clears with Escape", async () => {
  const slot = renderSlot(app.threadLists[0]!, { ...props, activeThreadId: "thr_a" }, {
    sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc,
  });
  fireEvent.click(await screen.findByRole("link", { name: "thr_c" }), { shiftKey: true });
  expect(screen.getByRole("region", { name: "Selected threads" }).textContent).toContain("3 selected");
  expect(slot.inspection.navigateCalls).toEqual([]);
  expect(document.querySelectorAll("a[data-thread-selected]")).toHaveLength(3);
  fireEvent.click(screen.getByRole("link", { name: "thr_b" }), { shiftKey: true });
  expect(screen.getByRole("region", { name: "Selected threads" }).textContent).toContain("2 selected");
  fireEvent.keyDown(screen.getByRole("link", { name: "thr_b" }), { key: "Escape" });
  expect(screen.queryByRole("region", { name: "Selected threads" })).toBeNull();
  expect(document.querySelectorAll("a[data-thread-selected]")).toHaveLength(0);
});

it("supports individual toggles and Shift+Enter, and sends bulk pin to every selected row", async () => {
  const pin = vi.fn(async () => makeThreadResponse());
  const slot = renderSlot(app.threadLists[0]!, props, {
    sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc, sdk: { threads: { pin } },
  });
  const a = await screen.findByRole("link", { name: "thr_a" });
  fireEvent.click(a, { ctrlKey: true });
  fireEvent.keyDown(screen.getByRole("link", { name: "thr_c" }), { key: "Enter", shiftKey: true });
  fireEvent.click(screen.getByRole("link", { name: "thr_b" }), { metaKey: true });
  fireEvent.click(screen.getByRole("button", { name: "Pin selected threads" }));
  await waitFor(() => expect(pin).toHaveBeenCalledTimes(2));
  expect(pin.mock.calls).toEqual([[{ threadId: "thr_a" }], [{ threadId: "thr_c" }]]);
  await waitFor(() => expect(screen.queryByRole("region", { name: "Selected threads" })).toBeNull());
  expect(slot.inspection.navigateCalls).toEqual([]);
});

it("keeps only failed rows selected after a partial bulk failure", async () => {
  renderSlot(app.threadLists[0]!, props, {
    sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc,
    sdk: { threads: { markUnread: async ({ threadId }) => {
      if (threadId === "thr_b") throw new Error("offline");
      return makeThreadResponse();
    } } },
  });
  fireEvent.click(await screen.findByRole("link", { name: "thr_a" }), { ctrlKey: true });
  fireEvent.click(screen.getByRole("link", { name: "thr_c" }), { shiftKey: true });
  fireEvent.click(screen.getByRole("button", { name: "Mark selected threads unread" }));
  await waitFor(() => expect(screen.getByRole("region", { name: "Selected threads" }).textContent).toContain("1 selected"));
  expect(document.querySelector("a[data-thread-selected]")?.getAttribute("data-sidebar-thread-id")).toBe("thr_b");
  expect(errors).toHaveBeenCalledWith("Mark selected threads unread: 1 failed", expect.anything());
});

it("prunes selection when rows disappear from search", async () => {
  const slot = renderSlot(app.threadLists[0]!, props, { sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc });
  fireEvent.click(await screen.findByRole("link", { name: "thr_b" }), { ctrlKey: true });
  const Inbox = app.threadLists[0]!.component;
  slot.rerender(<Inbox {...props} searchQuery="thr_c" />);
  await waitFor(() => expect(screen.queryByRole("region", { name: "Selected threads" })).toBeNull());
});

it("renders configured plugin quick actions in order without navigating the thread", async () => {
  const run = vi.fn(async () => {});
  const slot = renderSlot(app.threadLists[0]!, props, {
    sidebarThreads: { status: "ready", threads: [rows[0]!], projects: [] },
    rpc: { ...rpc, getSidebarSettings: () => ({ ...DEFAULT_SIDEBAR_SETTINGS, inactiveThreadsEnabled: false, quickActionKeys: ["test/second", "test/first"] }) },
    threadActions: () => ["first", "second", "third"].map(id => ({ key: `test/${id}`, pluginId: "test", group: "test",
      action: { label: `Action ${id}`, icon: "Pin", run } })),
  });
  const second = await screen.findByRole("button", { name: "Action second" });
  expect([...second.closest(".bb-sidebar-quick-actions")!.querySelectorAll("button")].map(button => button.getAttribute("aria-label")))
    .toEqual(["Action second", "Action first"]);
  fireEvent.click(second);
  await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  expect(slot.inspection.navigateCalls).toEqual([]);
});

it("renders action choices and passes the selected value", async () => {
  const run = vi.fn(async () => {});
  renderSlot(app.threadLists[0]!, props, {
    sidebarThreads: { status: "ready", threads: [rows[0]!], projects: [] },
    rpc: { ...rpc, getSidebarSettings: () => ({ ...DEFAULT_SIDEBAR_SETTINGS, inactiveThreadsEnabled: false, quickActionKeys: ["test/choices"] }) },
    threadActions: () => [{ key: "test/choices", pluginId: "test", group: "test", action: { label: "Choose mode", icon: "Pin", run,
      choices: { items: [{ id: "one", label: "One" }, { id: "two", label: "Two" }] } } }],
  });
  fireEvent.click(await screen.findByRole("button", { name: "Choose mode" }));
  fireEvent.click(await screen.findByRole("button", { name: "Two" }));
  await waitFor(() => expect(run).toHaveBeenCalledWith("two"));
});

it("exposes titles outside links/buttons for the asciimoji adapter", async () => {
  renderSlot(app.threadLists[0]!, props, { sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc });
  await screen.findByRole("link", { name: "thr_a" });
  for (const anchor of document.querySelectorAll("a[data-sidebar-thread-id]")) {
    const title = anchor.parentElement?.querySelector(".bb-thread-title");
    expect(title).toBeTruthy();
    expect(title?.closest("a, button")).toBeNull();
    // Asciimoji inserts its interactive face beside this title.
    expect(title?.parentElement?.closest("a, button")).toBeNull();
  }
});

it("bounds cached quick-action keys and handles missing range anchors", () => {
  expect(quickActionKeysOf(["p/a", "p/a", null, "bad", "p/b", "p/c", "p/d", "p/e"])).toEqual(["p/a", "p/b", "p/c", "p/d"]);
  expect(threadRange(["a", "b", "c"], "c", "a")).toEqual(["a", "b", "c"]);
  expect(threadRange(["a", "b"], "gone", "b")).toEqual(["b"]);
});
