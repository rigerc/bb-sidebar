import { useEffect, useId, useRef, useState } from "react";
import { useBbNavigate, useSdk } from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { Tooltip } from "./components/Tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "./components/Popover";
import { SettingsSelect, secondaryButtonClass } from "./settings-ui";
import type { SidebarLayout, SidebarQuickAction } from "./sidebar-layout";

const buttonClass = "inline-flex min-h-8 min-w-8 items-center justify-center gap-1.5 rounded px-2 text-xs text-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function SidebarQuickActions({ actions, layout, projectId, onNavigate }: {
  actions: readonly SidebarQuickAction[]; layout: SidebarLayout;
  projectId?: string; onNavigate: () => void;
}) {
  const navigate = useBbNavigate();
  if (!actions.length) return null;
  return <div role="toolbar" aria-label="Sidebar quick actions" className="flex shrink-0 flex-wrap items-center gap-1 px-2 py-1">
    {actions.map(action => action === "new-thread" ?
      <Tooltip key={action} label="New thread"><button type="button" aria-label="New thread" className={buttonClass}
        onClick={() => { navigate.toCompose({ ...(projectId ? { projectId } : {}), focusPrompt: true }); onNavigate(); }}>
        <Icon name="Edit" className="size-3.5" aria-hidden />{layout.quickActionLabels ? "New thread" : null}
      </button></Tooltip> : <NewProject key={action} labels={layout.quickActionLabels} onNavigate={onNavigate} />)}
  </div>;
}

function NewProject({ labels, onNavigate }: { labels: boolean; onNavigate: () => void }) {
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [hosts, setHosts] = useState<{ id: string; name: string }[]>([]);
  const [hostId, setHostId] = useState("");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void sdk.hosts.list({ signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const available = result.filter(host => host.status === "connected" && host.lifecycle.phase === "active");
      setHosts(available);
      setHostId(current => available.some(host => host.id === current) ? current : available[0]?.id ?? "");
    }).catch(() => {
      if (!controller.signal.aborted) { setHosts([]); setHostId(""); setError("Could not load machines. Try again."); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, attempt, sdk]);

  const create = async () => {
    if (pending.current || !name.trim() || !path.trim() || !hostId || loading) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const project = await sdk.projects.create({ name: name.trim(), source: { type: "local_path", hostId, path: path.trim() } });
      setOpen(false); setName(""); setPath("");
      navigate.toProject(project.id); onNavigate();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create the project. Try again.");
    } finally { pending.current = false; setBusy(false); }
  };
  const inputClass = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
  return <Popover modal open={open} onOpenChange={next => { if (!pending.current) setOpen(next); }}>
    <Tooltip label="New project"><PopoverTrigger asChild><button type="button" aria-label="New project" className={buttonClass}>
      <Icon name="FolderGit" className="size-3.5" aria-hidden />{labels ? "New project" : null}
    </button></PopoverTrigger></Tooltip>
    <PopoverContent aria-label="New project" collisionPadding={8} className="w-80 max-w-[calc(100vw-2rem)] p-3">
      <form aria-label="Create project" aria-busy={busy} className="space-y-3" onSubmit={event => { event.preventDefault(); void create(); }}>
        <h2 className="text-sm font-medium">New project</h2>
        <p className="text-xs text-muted-foreground">Add an existing folder on a connected machine to BB.</p>
        <div className="space-y-1"><label htmlFor={`${id}-name`} className="text-xs">Project name</label>
          <input id={`${id}-name`} required maxLength={255} value={name} disabled={busy} onChange={event => setName(event.target.value)} className={inputClass} /></div>
        <div className="space-y-1"><label htmlFor={`${id}-machine`} className="text-xs">Machine</label>
          <SettingsSelect id={`${id}-machine`} value={hostId} disabled={busy || loading || !hosts.length} onChange={event => setHostId(event.target.value)} className="w-full">
            {!hosts.length ? <option value="">{loading ? "Loading machines…" : "No connected machines"}</option> : null}
            {hosts.map(host => <option key={host.id} value={host.id}>{host.name}</option>)}
          </SettingsSelect></div>
        <div className="space-y-1"><label htmlFor={`${id}-path`} className="text-xs">Folder path</label>
          <input id={`${id}-path`} required value={path} disabled={busy} placeholder="/path/to/project" onChange={event => setPath(event.target.value)} className={inputClass} /></div>
        {error ? <p role="alert" className="break-words text-xs text-destructive-text">{error}</p> : null}
        {!loading && !hosts.length ? <button type="button" onClick={() => setAttempt(current => current + 1)} className={secondaryButtonClass}>Refresh machines</button> : null}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={busy || loading || !hostId || !name.trim() || !path.trim()} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50">{busy ? "Creating…" : "Create project"}</button>
        </div>
      </form>
    </PopoverContent>
  </Popover>;
}
