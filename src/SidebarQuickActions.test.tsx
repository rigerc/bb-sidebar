// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";
import { SidebarQuickActions } from "./SidebarQuickActions";
import { DEFAULT_SIDEBAR_LAYOUT } from "./sidebar-layout";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { actions: ["new-project", "new-thread"] as const, layout: DEFAULT_SIDEBAR_LAYOUT, projectId: "proj_selected", onNavigate: vi.fn() };

it("opens compose in the selected project and respects action order", () => {
  const slot = renderSlot({ component: SidebarQuickActions }, props);
  expect([...screen.getByRole("toolbar").querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual(["New project", "New thread"]);
  fireEvent.click(screen.getByRole("button", { name: "New thread" }));
  expect(slot.inspection.navigateCalls).toEqual([{ method: "toCompose", options: { projectId: "proj_selected", focusPrompt: true } }]);
  expect(props.onNavigate).toHaveBeenCalledOnce();
});

it("creates a project from a connected machine and folder, then navigates to it", async () => {
  const create = vi.fn(async () => ({ id: "proj_new", name: "Example", kind: "standard" as const, gitRemoteUrl: null, sources: [], createdAt: 100, updatedAt: 100 }));
  const slot = renderSlot({ component: SidebarQuickActions }, props, { sdk: {
    hosts: { list: async () => [makeHostResponse({ id: "host_online", name: "Online", status: "connected" }), makeHostResponse({ id: "host_offline", name: "Offline", status: "disconnected" })] },
    projects: { create },
  } });
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  await screen.findByRole("option", { name: "Online" });
  expect(screen.queryByRole("option", { name: "Offline" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: " Example " } });
  fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: " /workspace/example " } });
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Example", source: { type: "local_path", hostId: "host_online", path: "/workspace/example" } }));
  await waitFor(() => expect(slot.inspection.navigateCalls).toEqual([{ method: "toProject", projectId: "proj_new" }]));
  expect(props.onNavigate).toHaveBeenCalledOnce();
});

it("retains the form for retry after creation fails", async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error("Folder does not exist"))
    .mockResolvedValue({ id: "proj_new", name: "Example", kind: "standard", gitRemoteUrl: null, sources: [], createdAt: 100, updatedAt: 100 });
  const slot = renderSlot({ component: SidebarQuickActions }, props, { sdk: {
    hosts: { list: async () => [makeHostResponse({ id: "host_online", status: "connected" })] }, projects: { create },
  } });
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  await waitFor(() => expect((screen.getByLabelText("Machine") as HTMLSelectElement).value).toBe("host_online"));
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Example" } });
  fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: "/bad" } });
  fireEvent.submit(screen.getByRole("form", { name: "Create project" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Folder does not exist");
  expect(slot.inspection.navigateCalls).toEqual([]);
  expect(screen.getByLabelText("Project name")).toHaveProperty("value", "Example");
  fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: "/good" } });
  fireEvent.submit(screen.getByRole("form", { name: "Create project" }));
  await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
});

it("retries loading machines, keeps creation disabled until ready, and preserves icon labels", async () => {
  const list = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
  renderSlot({ component: SidebarQuickActions }, { ...props, layout: { ...DEFAULT_SIDEBAR_LAYOUT, quickActionLabels: false } }, { sdk: { hosts: { list } } });
  expect(screen.getByRole("button", { name: "New project" }).textContent).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not load machines. Try again.");
  expect(screen.getByRole("button", { name: "Create project" })).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "Refresh machines" }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  await screen.findByRole("option", { name: "No connected machines" });
});
