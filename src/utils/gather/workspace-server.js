import { userAccess } from "./users-store";

import { bookmarksResponse, servicesResponse, widgetsResponse } from "utils/config/api-response";
import { getSettings } from "utils/config/config";
export async function sharedDashboard() {
  const [settings, services, bookmarks, widgets] = await Promise.all([
    getSettings(),
    servicesResponse(),
    bookmarksResponse(),
    widgetsResponse(),
  ]);
  return { settings, services, bookmarks, widgets };
}
export function workspaceTarget(store, actor, target) {
  if (target === "mine") return actor;
  const owner = typeof target === "string" && /^[a-f0-9]{48}$/.test(target) ? store.shared(target) : null;
  if (!owner || !userAccess(owner).enabled)
    throw Object.assign(Error("This dashboard is no longer shared."), { status: 404 });
  return owner;
}

export { workspaceIdentity } from "./workspace-identity";
