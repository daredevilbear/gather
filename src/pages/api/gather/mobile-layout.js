import { renderDocuments } from "utils/gather/dashboard-documents";
import { workspaceStore } from "utils/gather/dashboard-workspace";
import { mobileCatalog } from "utils/gather/mobile-layout";
import { sharedDashboard, workspaceIdentity, workspaceTarget } from "utils/gather/workspace-server";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  let store;
  try {
    const actor = await workspaceIdentity(req);
    if (req.method !== "GET") return res.status(405).end();
    store = workspaceStore();
    const target = store.current(actor.subject);
    const shared = await sharedDashboard();
    const workspace = target === "shared" ? null : store.get(workspaceTarget(store, actor.subject, target));
    if (target !== "shared" && !workspace) return res.status(404).json({ error: "Create your dashboard first." });
    return res.json({
      target,
      catalog: mobileCatalog(workspace ? renderDocuments(workspace.documents, shared, shared.settings) : shared),
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.status ? e.message : "Could not load dashboard layout." });
  } finally {
    store?.close();
  }
}
