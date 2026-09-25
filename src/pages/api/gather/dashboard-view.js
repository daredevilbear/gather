import { renderDocuments } from "utils/gather/dashboard-documents";
import { workspaceStore } from "utils/gather/dashboard-workspace";
import { sharedDashboard, workspaceIdentity, workspaceTarget } from "utils/gather/workspace-server";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  let store;
  try {
    const actor = await workspaceIdentity(req);
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).end();
    }
    store = workspaceStore();
    const target = req.query.dashboard || store.current(actor.subject);
    if (target === "shared") return res.json({ target, view: null, legacy: !store.get(actor.subject) });
    const owner = workspaceTarget(store, actor.subject, target);
    const workspace = store.get(owner);
    if (!workspace) return res.status(404).json({ error: "Create your dashboard in My dashboard first." });
    const shared = await sharedDashboard();
    return res.json({ target, view: renderDocuments(workspace.documents, shared, shared.settings) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.status ? e.message : "Could not load this dashboard." });
  } finally {
    store?.close();
  }
}
