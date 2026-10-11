import { useContext, createContext, useRef, useState } from "react";
import {
  experimental_Icon as HostIcon,
  experimental_useThreadActions as useThreadActions,
  experimental_useThreadActionRegistrations as useThreadActionRegistrations,
  type PluginSidebarThread,
  type PluginBoundThreadAction,
} from "@get-bb/plugin-sdk/app";
import { Tooltip } from "./components/Tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "./components/Popover";
import { MAX_QUICK_ACTIONS } from "./sidebar-settings";
import { threadActionTarget } from "./useThreadOperations";
import { toast } from "sonner";

export const QuickActionsContext = createContext<readonly string[]>([]);
const BUTTON_CLASS = "pointer-events-auto relative inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

export function QuickActions({ thread, onRename }: {
  thread: PluginSidebarThread;
  onRename?: () => void;
}) {
  const keys = useContext(QuickActionsContext);
  const actions = useThreadActions(threadActionTarget(thread), { keys, requestRename: onRename });
  if (!actions.length) return null;
  return <span className="bb-sidebar-quick-actions relative inline-flex shrink-0 items-center" aria-label="Thread quick actions">
    {actions.map(({ key, action }) => <QuickAction key={key} action={action} />)}
  </span>;
}

function QuickAction({ action }: { action: PluginBoundThreadAction }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const run = async (value?: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try { await action.run(value); setOpen(false); }
    catch (error) { toast.error(`Could not ${action.label.toLowerCase()}`, {
      description: error instanceof Error ? error.message : undefined,
    }); }
    finally { pendingRef.current = false; setPending(false); }
  };
  const button = <button type="button" className={BUTTON_CLASS}
    aria-label={action.label} disabled={action.disabled || pending}
    onClick={action.choices ? undefined : () => void run()}>
    <HostIcon name={action.icon} className="size-3.5" aria-hidden="true" />
  </button>;
  if (!action.choices) return <Tooltip label={action.label}>{button}</Tooltip>;
  return <Popover open={open} onOpenChange={setOpen}>
    <Tooltip label={action.label}><PopoverTrigger asChild>{button}</PopoverTrigger></Tooltip>
    <PopoverContent className="max-w-64 p-1" align="end" aria-label={action.label}>
      <p className="px-2 py-1 text-xs font-medium">{action.choices.heading ?? action.label}</p>
      {action.detail ? <p className="px-2 pb-1 text-xs text-muted-foreground">{action.detail}</p> : null}
      {action.choices.items.map(choice => <button key={choice.id} type="button"
        aria-pressed={choice.selected === true} disabled={pending || choice.disabled}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        onClick={() => void run(choice.id)}>
        {choice.icon ? <HostIcon name={choice.icon} className="size-3.5" aria-hidden="true" /> : null}
        {choice.label}
      </button>)}
      {action.choices.hint ? <p className="px-2 py-1 text-xs text-muted-foreground">{action.choices.hint}</p> : null}
    </PopoverContent>
  </Popover>;
}

export function QuickActionSettings({ keys, onChange }: {
  keys: readonly string[];
  onChange: (keys: string[]) => void;
}) {
  const registrations = useThreadActionRegistrations();
  return <div className="grid gap-2 sm:grid-cols-2">
    {Array.from({ length: MAX_QUICK_ACTIONS }, (_, index) => {
      const value = keys[index] ?? "";
      return <label key={index} className="flex min-w-0 items-center gap-2 text-xs">
        <span className="shrink-0">Button {index + 1}</span>
        <select aria-label={`Quick button ${index + 1}`} value={value}
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={event => {
            const next = [...keys];
            next[index] = event.target.value;
            onChange(next.filter(Boolean));
          }}>
          <option value="">None</option>
          {value && !registrations.some(item => item.key === value)
            ? <option value={value}>Unavailable: {value}</option> : null}
          {registrations.filter(item => item.key === value || !keys.includes(item.key)).map(item =>
            <option key={item.key} value={item.key}>{item.title}</option>)}
        </select>
      </label>;
    })}
  </div>;
}
