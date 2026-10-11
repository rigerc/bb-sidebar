import { useThreadOperations } from "./useThreadOperations";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon, type IconName } from "./components/Icon";
import { Tooltip } from "./components/Tooltip";
import { runThreadTasks } from "./thread-tasks";
import type { LifecycleApi } from "./useLifecycle";

const ROW_SELECTOR = "[data-sidebar-thread-id]";

/** Read the rendered order: collapsed shelves and unloaded pages aren't selected. */
export function visibleSelectionRows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ROW_SELECTOR)].filter(row =>
    !row.closest("[hidden], [aria-hidden='true']") && !row.hasAttribute("data-sidebar-rename-anchor"),
  );
}

export function threadRange(ids: readonly string[], anchor: string | null, target: string): string[] {
  const start = anchor ? ids.indexOf(anchor) : -1;
  const end = ids.indexOf(target);
  if (end < 0) return [];
  if (start < 0) return [target];
  return ids.slice(Math.min(start, end), Math.max(start, end) + 1);
}

export const HOLD_TO_SELECT_MS = 500;

export function ThreadSelection({ threads, lifecycle, activeThreadId, onNavigate, holdToSelect = true, children }: {
  threads: readonly PluginSidebarThread[];
  lifecycle: LifecycleApi;
  activeThreadId: string | null;
  onNavigate: () => void;
  holdToSelect?: boolean;
  children: ReactNode;
}) {
  const sdk = useSdk();
  const actions = useThreadOperations();
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const holdMode = useRef(false);
  const suppressClick = useRef<string | null>(null);
  const cancelHold = useRef<(() => void) | null>(null);
  const clear = () => { holdMode.current = false; anchorRef.current = null; setSelected(new Set()); };
  useEffect(() => () => { cancelHold.current?.(); }, [holdToSelect]);
  useEffect(() => { if (!selected.size) holdMode.current = false; }, [selected.size]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sync = () => {
      const rows = visibleSelectionRows(root);
      const visible = new Set(rows.map(row => row.dataset.sidebarThreadId!));
      const current = selectedRef.current;
      for (const row of root.querySelectorAll<HTMLElement>(ROW_SELECTOR)) {
        const checked = visible.has(row.dataset.sidebarThreadId!) && current.has(row.dataset.sidebarThreadId!);
        row.toggleAttribute("data-thread-selected", checked);
        row.closest("[data-thread-row]")?.toggleAttribute("data-thread-selected", checked);
      }
      if ([...current].some(id => !visible.has(id))) {
        setSelected(new Set([...current].filter(id => visible.has(id))));
      }
      if (anchorRef.current && !visible.has(anchorRef.current)) anchorRef.current = null;
    };
    sync();
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === "attributes" ||
        [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element &&
          (node.matches(ROW_SELECTOR) || node.querySelector(ROW_SELECTOR))))) sync();
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "data-sidebar-thread-id"] });
    return () => observer.disconnect();
  });

  const select = (row: HTMLElement, shift: boolean, toggle: boolean) => {
    if (busyRef.current) return;
    const id = row.dataset.sidebarThreadId!;
    const ids = visibleSelectionRows(rootRef.current!).map(item => item.dataset.sidebarThreadId!);
    if (shift) {
      const anchor = anchorRef.current ?? activeThreadId;
      const range = threadRange(ids, anchor, id);
      if (!anchor || !ids.includes(anchor)) anchorRef.current = id;
      setSelected(current => new Set(toggle ? [...current, ...range] : range));
    } else if (toggle) {
      anchorRef.current = id;
      setSelected(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
  };
  const targetRow = (target: EventTarget | null) => target instanceof Element
    ? target.closest<HTMLElement>(ROW_SELECTOR) : null;
  const click = (event: MouseEvent<HTMLDivElement>) => {
    const row = targetRow(event.target);
    if (!row || !rootRef.current?.contains(row)) return;
    if (suppressClick.current === row.dataset.sidebarThreadId) {
      suppressClick.current = null;
      event.preventDefault(); event.stopPropagation(); return;
    }
    const toggle = event.ctrlKey || event.metaKey;
    if (event.shiftKey || toggle || holdMode.current) {
      event.preventDefault(); event.stopPropagation();
      select(row, event.shiftKey, toggle || holdMode.current);
    } else {
      anchorRef.current = row.dataset.sidebarThreadId!;
      setSelected(new Set());
    }
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // A fresh press disarms a cancelled hold's trailing-click guard.
    suppressClick.current = null;
    if (cancelHold.current) { cancelHold.current(); return; }
    const row = targetRow(event.target);
    if (!row || !rootRef.current?.contains(row)) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey || holdMode.current) {
      event.stopPropagation(); return;
    }
    if (!holdToSelect || busyRef.current || event.button !== 0 || event.isPrimary === false) return;
    // Claim touch early so the row context menu's own long-press timer cannot
    // compete. Mouse movement still reaches the existing reorder/split hooks.
    if (event.pointerType === "touch") event.stopPropagation();
    const { pointerId, clientX, clientY } = event;
    let triggered = false;
    let cancellingDrag = false;
    const cancel = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("scroll", cancel, true);
      window.removeEventListener("blur", cancel);
      cancelHold.current = null;
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      if (triggered) { next.preventDefault(); next.stopPropagation(); }
      else if (Math.hypot(next.clientX - clientX, next.clientY - clientY) >= 6) cancel();
    };
    const end = (next: PointerEvent) => { if (next.pointerId === pointerId && !cancellingDrag) cancel(); };
    const timer = window.setTimeout(() => {
      if (!row.isConnected || !visibleSelectionRows(rootRef.current!).includes(row) || busyRef.current) { cancel(); return; }
      // Cancel the host's pending drag and Radix context-menu gesture before
      // turning this stationary press into selection.
      cancellingDrag = true;
      row.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId }));
      cancellingDrag = false;
      triggered = true;
      holdMode.current = true;
      suppressClick.current = row.dataset.sidebarThreadId!;
      select(row, false, true);
    }, HOLD_TO_SELECT_MS);
    cancelHold.current = cancel;
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("scroll", cancel, true);
    window.addEventListener("blur", cancel);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (event.key === "Escape" && selected.size) {
      event.preventDefault(); event.stopPropagation();
      if (!busyRef.current) clear();
      return;
    }
    const row = targetRow(event.target);
    if (row && event.shiftKey && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); event.stopPropagation();
      select(row, true, event.ctrlKey || event.metaKey);
    }
  };

  const chosen = threads.filter(thread => selected.has(thread.id));
  const canPark = chosen.length > 0 && chosen.every(thread => lifecycle.canPark(thread));
  const run = async (label: string, task: (id: string) => Promise<unknown>, movesThread = false) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const ids = [...selected];
    const visibleIds = rootRef.current ? visibleSelectionRows(rootRef.current).map(row => row.dataset.sidebarThreadId!) : [];
    try {
      const result = await runThreadTasks(ids, async id => {
        if (await task(id) === false) throw new Error("Thread action was not completed");
      });
      setSelected(new Set(result.failures.map(failure => failure.threadId)));
      if (result.failures.length) toast.error(`${label}: ${result.failures.length} failed`, {
        description: "Failed threads remain selected. Try again.",
      });
      if (movesThread && activeThreadId && result.succeededThreadIds.includes(activeThreadId)) {
        const next = visibleIds.find(id => !ids.includes(id));
        if (next) actions.open(next);
        else actions.openNewThread({ projectId: chosen.find(thread => thread.id === activeThreadId)?.projectId, focusPrompt: true });
        onNavigate();
      }
    } finally { busyRef.current = false; setBusy(false); }
  };
  const bulkButton = (label: string, icon: IconName, task: (id: string) => Promise<unknown>, enabled = true, moves = false) =>
    <Tooltip label={label} key={label}><button type="button" aria-label={label} disabled={busy || !enabled}
      className="inline-flex size-7 items-center justify-center rounded text-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
      onClick={() => void run(label, task, moves)}><Icon name={icon} className="size-3.5" aria-hidden="true" /></button></Tooltip>;

  return <div ref={rootRef} className="flex min-h-0 flex-1 flex-col" onClickCapture={click} onKeyDownCapture={keyDown}
    onPointerDownCapture={pointerDown}
    onContextMenuCapture={event => {
      if (targetRow(event.target) && (holdMode.current || cancelHold.current)) {
        event.preventDefault(); event.stopPropagation();
      }
    }}
    onDoubleClickCapture={event => {
      if (targetRow(event.target) && (event.shiftKey || event.ctrlKey || event.metaKey || holdMode.current)) {
        event.preventDefault(); event.stopPropagation();
      }
    }}>
    {selected.size > 0 ? <div role="region" aria-label="Selected threads" aria-busy={busy}
      className="flex shrink-0 flex-col gap-0.5 border-b border-sidebar-border px-2 py-1">
      <div className="flex items-center justify-between gap-2">
      <span role="status" className="text-xs text-foreground">{busy ? "Applying…" : `${selected.size} selected`}</span>
      <Tooltip label="Clear selection (Escape)"><button type="button" aria-label="Clear selection" disabled={busy} onClick={clear}
        className="inline-flex size-7 items-center justify-center rounded text-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40">
        <Icon name="CircleX" className="size-3.5" aria-hidden="true" />
      </button></Tooltip>
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
      {bulkButton("Pin selected threads", "Pin", id => actions.setPinned(id, true))}
      {bulkButton("Unpin selected threads", "PinOff", id => actions.setPinned(id, false))}
      {bulkButton("Mark selected threads read", "MailOpen", id => sdk.threads.markRead({ threadId: id }))}
      {bulkButton("Mark selected threads unread", "Mail", id => sdk.threads.markUnread({ threadId: id }))}
      {bulkButton("Park selected threads", "PauseCircle", id => lifecycle.park(id), canPark, true)}
      {bulkButton("Settle selected threads", "Check", id => lifecycle.settle(id), canPark, true)}
      </div>
    </div> : null}
    {children}
  </div>;
}
