// Preserve Homepage layout tabs while allowing empty tabs and explicit ordering.
export function dashboardTabs(settings = {}) {
  const configured = Array.isArray(settings.gather?.tabs) ? settings.gather.tabs : [];
  const assigned = Object.values(settings.layout || {}).map((group) => group?.tab);
  return [...new Set([...configured, ...assigned].filter((tab) => typeof tab === "string" && tab.trim()))];
}

export function renameDashboardTab(settings, previous, next) {
  const tabs = dashboardTabs(settings).map((tab) => tab === previous ? next : tab).filter(Boolean);
  const layout = Object.fromEntries(Object.entries(settings.layout || {}).map(([group, options]) => {
    if (options?.tab !== previous) return [group, options];
    const updated = { ...options };
    if (next) updated.tab = next;
    else delete updated.tab;
    return [group, updated];
  }));
  return { ...settings, gather: { ...settings.gather, tabs }, layout };
}
