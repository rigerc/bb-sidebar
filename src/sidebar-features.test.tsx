// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { idleSidebarThreadFields } from "./test-fixtures";
import { DEFAULT_SIDEBAR_SETTINGS, quickActionKeysOf } from "./sidebar-settings";
import { HOLD_TO_SELECT_MS, threadRange } from "./ThreadSelection";

const app = await loadPluginApp(() => import("../app"));
const props = { activeThreadId: null, activeProjectId: null, isCompactViewport: false, searchQuery: "", onNavigate: vi.fn() };
const errors = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: errors, success: vi.fn(), message: vi.fn() } }));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

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

function pointerEvents() {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number; pointerType: string; isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init); this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "touch"; this.isPrimary = init.isPrimary ?? true;
    }
  });
}

it("holds to enter selection mode, suppresses the release click, and toggles subsequent taps", async () => {
  pointerEvents();
  const slot = renderSlot(app.threadLists[0]!, props, { sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc });
  const a = await screen.findByRole("link", { name: "thr_a" });
  vi.useFakeTimers();
  fireEvent.pointerDown(a, { pointerId: 1, pointerType: "touch", button: 0 });
  act(() => { vi.advanceTimersByTime(HOLD_TO_SELECT_MS); });
  expect(screen.getByRole("region", { name: "Selected threads" }).textContent).toContain("1 selected");
  fireEvent.pointerUp(a, { pointerId: 1 }); fireEvent.click(a);
  expect(screen.getByRole("region", { name: "Selected threads" }).textContent).toContain("1 selected");
  const b = screen.getByRole("link", { name: "thr_b" });
  fireEvent.pointerDown(b, { pointerId: 2, pointerType: "touch", button: 0 });
  fireEvent.pointerUp(b, { pointerId: 2 }); fireEvent.click(b);
  expect(screen.getByRole("region", { name: "Selected threads" }).textContent).toContain("2 selected");
  expect(slot.inspection.navigateCalls).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  fireEvent.click(b);
  expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_b", options: { split: false } }]);
});

it.each(["movement", "scroll", "cancel", "release", "second pointer", "blur"])("cancels a pending hold on %s", async reason => {
  pointerEvents();
  renderSlot(app.threadLists[0]!, props, { sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc });
  const a = await screen.findByRole("link", { name: "thr_a" });
  vi.useFakeTimers();
  fireEvent.pointerDown(a, { pointerId: 1, pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
  if (reason === "movement") fireEvent.pointerMove(window, { pointerId: 1, clientX: 20, clientY: 27 });
  if (reason === "scroll") fireEvent.scroll(a.parentElement!);
  if (reason === "cancel") fireEvent.pointerCancel(window, { pointerId: 1 });
  if (reason === "release") fireEvent.pointerUp(window, { pointerId: 1 });
  if (reason === "second pointer") fireEvent.pointerDown(a, { pointerId: 2, pointerType: "touch", isPrimary: false });
  if (reason === "blur") fireEvent.blur(window);
  act(() => { vi.advanceTimersByTime(HOLD_TO_SELECT_MS + 100); });
  expect(screen.queryByRole("region", { name: "Selected threads" })).toBeNull();
});

it("can disable holds while preserving Shift selection and configured layout", async () => {
  pointerEvents();
  renderSlot(app.threadLists[0]!, props, { sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc: {
    ...rpc, getSidebarSettings: () => ({ ...DEFAULT_SIDEBAR_SETTINGS, inactiveThreadsEnabled: false, sidebarQuickActions: [], layout: {
      ...DEFAULT_SIDEBAR_SETTINGS.layout, density: "spacious", holdToSelect: false, showProjectFilter: false, showProvider: false,
    } }),
  } });
  const a = await screen.findByRole("link", { name: "thr_a" });
  await waitFor(() => expect(document.querySelector("[data-bb-sidebar-root]")?.getAttribute("data-density")).toBe("spacious"));
  expect(screen.queryByRole("toolbar", { name: "Sidebar quick actions" })).toBeNull();
  vi.useFakeTimers();
  fireEvent.pointerDown(a, { pointerId: 1, pointerType: "touch", button: 0 });
  act(() => { vi.advanceTimersByTime(HOLD_TO_SELECT_MS); });
  expect(screen.queryByRole("region", { name: "Selected threads" })).toBeNull();
  fireEvent.click(a, { shiftKey: true });
  expect(screen.getByRole("region", { name: "Selected threads" })).toBeTruthy();
});

it("keeps mobile selection actions unobscured when the hold release lands on the project filter", async () => {
  pointerEvents();
  const slot = renderSlot(app.threadLists[0]!, { ...props, isCompactViewport: true }, { sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc });
  const row = await screen.findByRole("link", { name: "thr_a" });
  const filter = screen.getByRole("button", { name: "Project scope: All projects" });
  vi.useFakeTimers();
  fireEvent.pointerDown(row, { pointerId: 1, pointerType: "touch", button: 0 });
  act(() => { vi.advanceTimersByTime(HOLD_TO_SELECT_MS); });
  fireEvent.pointerUp(row, { pointerId: 1 });
  // Inserting the selection bar moves this control under the stationary finger.
  fireEvent.click(filter);
  expect(filter.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByRole("region", { name: "Selected threads" }).textContent).toContain("1 selected");
  expect(slot.inspection.navigateCalls).toEqual([]);
  // The next deliberate press must work normally.
  fireEvent.pointerDown(filter, { pointerId: 2, pointerType: "touch", button: 0 });
  fireEvent.pointerUp(filter, { pointerId: 2 });
  fireEvent.click(filter);
  expect(filter.getAttribute("aria-expanded")).toBe("true");
});

it("suppresses a hold release retargeted outside the sidebar without swallowing the next press", async () => {
  pointerEvents();
  renderSlot(app.threadLists[0]!, { ...props, isCompactViewport: true }, { sidebarThreads: { status: "ready", threads: rows, projects: [] }, rpc });
  const row = await screen.findByRole("link", { name: "thr_a" });
  const button = document.createElement("button");
  const outsideClick = vi.fn(); button.onclick = outsideClick; document.body.append(button);
  vi.useFakeTimers();
  fireEvent.pointerDown(row, { pointerId: 1, pointerType: "touch", button: 0 });
  act(() => { vi.advanceTimersByTime(HOLD_TO_SELECT_MS); });
  fireEvent.pointerUp(row, { pointerId: 1 });
  fireEvent.click(button);
  expect(outsideClick).not.toHaveBeenCalled();
  fireEvent.pointerDown(button, { pointerId: 2, button: 0 });
  fireEvent.click(button);
  expect(outsideClick).toHaveBeenCalledOnce();
  button.remove();
});
