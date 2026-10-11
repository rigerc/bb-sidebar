export const SIDEBAR_QUICK_ACTIONS = ["new-thread", "new-project"] as const;
export type SidebarQuickAction = typeof SIDEBAR_QUICK_ACTIONS[number];
export const DEFAULT_SIDEBAR_QUICK_ACTIONS: SidebarQuickAction[] = ["new-thread", "new-project"];

export interface SidebarLayout {
  density: "compact" | "standard" | "spacious";
  showProjectFilter: boolean;
  showLocation: boolean;
  showProvider: boolean;
  showPorts: boolean;
  quickActionLabels: boolean;
  quickActionPlacement: "top" | "bottom";
  rowActionsVisibility: "hover" | "always";
  holdToSelect: boolean;
}

export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = {
  density: "standard", showProjectFilter: true, showLocation: true,
  showProvider: true, showPorts: true, quickActionLabels: true,
  quickActionPlacement: "top", rowActionsVisibility: "hover", holdToSelect: true,
};

/** Fill gaps in older settings and discard malformed cached values. */
export function sidebarLayoutOf(value: unknown): SidebarLayout {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_SIDEBAR_LAYOUT };
  for (const key of Object.keys(result) as (keyof SidebarLayout)[]) {
    const candidate = source[key];
    if (typeof result[key] === "boolean" && typeof candidate === "boolean") {
      Object.assign(result, { [key]: candidate });
    }
  }
  if (["compact", "standard", "spacious"].includes(String(source.density))) result.density = source.density as SidebarLayout["density"];
  if (source.quickActionPlacement === "top" || source.quickActionPlacement === "bottom") result.quickActionPlacement = source.quickActionPlacement;
  if (source.rowActionsVisibility === "hover" || source.rowActionsVisibility === "always") result.rowActionsVisibility = source.rowActionsVisibility;
  return result;
}

export function sidebarQuickActionsOf(value: unknown): SidebarQuickAction[] {
  if (!Array.isArray(value)) return [...DEFAULT_SIDEBAR_QUICK_ACTIONS];
  return [...new Set(value.filter((key): key is SidebarQuickAction => SIDEBAR_QUICK_ACTIONS.includes(key)))];
}
