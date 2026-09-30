import * as yaml from "js-yaml";

import { validEditorOrigin } from "utils/gather/admin";
import { seedDocuments, validateDashboardDocument } from "utils/gather/dashboard-documents";
import { DASHBOARD_FILES, workspaceStore } from "utils/gather/dashboard-workspace";
import { applyPersonalLayout } from "utils/gather/personal-layout";
import { usersStore } from "utils/gather/users-store";
import { sharedDashboard, workspaceIdentity, workspaceTarget } from "utils/gather/workspace-server";

export const config = { api: { bodyParser: { sizeLimit: "512kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  let store;
  try {
    const actor = await workspaceIdentity(req);
    if (!["GET", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).end();
    }
    if (req.method === "POST" && !validEditorOrigin(req))
      return res.status(403).json({ error: "Invalid request origin." });
    store = workspaceStore();
    let workspace = store.get(actor.subject);
    if (!workspace) {
      const shared = await sharedDashboard();
      const users = usersStore();
      let legacy;
      try {
        legacy = users.dashboard(actor.subject).dashboard;
      } finally {
        users.close();
      }
      const initial = applyPersonalLayout(
        shared.settings,
        shared.services,
        shared.bookmarks,
        shared.widgets,
        legacy.layout,
      );
      const docs = seedDocuments(initial.settings, initial.services, initial.bookmarks, initial.widgets);
      if (legacy.links?.length) {
        const entries = yaml.load(docs["services.yaml"]);
        const existing = new Set(entries.map((entry) => Object.keys(entry)[0]));
        let name = "Personal links";
        for (let n = 2; existing.has(name); n++) name = `Personal links (${n})`;
        entries.push({
          [name]: legacy.links.map((link) => ({ [link.name]: { href: link.url, description: link.description } })),
        });
        docs["services.yaml"] = yaml.dump(entries);
      }
      workspace = store.initialize(actor.subject, docs);
      if (legacy.layout) store.select(actor.subject, "mine");
    }
    if (req.method === "POST") {
      const { action, file, text, revision, target, enabled, backup } = req.body || {};
      if (action !== "current" && !["editor", "admin"].includes(actor.role))
        return res.status(403).json({ error: "Editor access is required to customize or share a dashboard." });
      if (action === "current") {
        if (target !== "shared") workspaceTarget(store, actor.subject, target);
        store.select(actor.subject, target);
      } else if (action === "sharing") {
        if (typeof enabled !== "boolean") return res.status(400).json({ error: "Choose a sharing setting." });
        store.sharing(actor.subject, enabled);
      } else if (["save", "validate", "restore"].includes(action)) {
        if (!DASHBOARD_FILES.includes(file)) return res.status(400).json({ error: "Unsupported dashboard section." });
        const nextText = action === "restore" ? store.version(actor.subject, backup)[file] : text;
        validateDashboardDocument(file, nextText);
        if (action !== "validate") {
          if (!Number.isSafeInteger(revision)) return res.status(400).json({ error: "Reload before saving." });
          workspace = store.save(actor.subject, { ...workspace.documents, [file]: nextText }, revision);
        }
      } else return res.status(400).json({ error: "Unknown dashboard action." });
    }
    workspace = store.get(actor.subject);
    const file = req.query.file || req.body?.file;
    if (file === "shared-services" && req.method === "GET") {
      const shared = await sharedDashboard();
      const list = (groups) =>
        groups.flatMap((group) => [
          ...(group.services || []).map((service) => ({ group: group.name, name: service.name })),
          ...list(group.groups || []),
        ]);
      return res.json({ services: list(shared.services) });
    }
    if (file) {
      if (!DASHBOARD_FILES.includes(file)) return res.status(400).json({ error: "Unsupported dashboard section." });
      return res.json({
        text: workspace.documents[file],
        backups: store.backups(actor.subject),
        revision: workspace.revision,
        applied: true,
        capabilities: { system: false },
      });
    }
    return res.json({
      current: store.current(actor.subject),
      share: workspace.share,
      revision: workspace.revision,
      canEdit: ["editor", "admin"].includes(actor.role),
    });
  } catch (e) {
    return res
      .status(e.status || (e.message.includes("Reload before saving") ? 409 : 400))
      .json({ error: e.status === 500 ? "Dashboard unavailable." : e.message });
  } finally {
    store?.close();
  }
}
