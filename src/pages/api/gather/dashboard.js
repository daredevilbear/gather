import { getToken } from "next-auth/jwt";

import { validEditorOrigin } from "utils/gather/admin";
import { validPersonalLayout } from "utils/gather/personal-layout";
import { userAccess, usersStore } from "utils/gather/users-store";

export const config = { api: { bodyParser: { sizeLimit: "128kb" } } };
export function validDashboard(value) {
  return (
    value &&
    typeof value.title === "string" &&
    value.title.trim() &&
    value.title.length <= 120 &&
    Object.keys(value).every((key) => ["title", "links", "layout"].includes(key)) &&
    (value.layout === undefined || value.layout === null || validPersonalLayout(value.layout)) &&
    Array.isArray(value.links) &&
    value.links.length <= 100 &&
    value.links.every((link) => {
      if (
        !link ||
        Object.keys(link).some((key) => !["name", "url", "description", "tab"].includes(key)) ||
        typeof link.name !== "string" ||
        !link.name.trim() ||
        link.name.length > 120 ||
        typeof link.description !== "string" ||
        link.description.length > 500 ||
        typeof link.tab !== "string" ||
        link.tab.length > 80 ||
        typeof link.url !== "string" ||
        link.url.length > 2048
      )
        return false;
      try {
        const url = new URL(link.url);
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
      } catch {
        return false;
      }
    })
  );
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.GATHER_AUTH_SECRET });
  if (!token?.sub) return res.status(401).json({ error: "Sign in to open your dashboard." });
  let store;
  try {
    const access = userAccess(token.sub);
    if (!access.enabled) return res.status(403).json({ error: "Your Gather access is disabled." });
    if (!["GET", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).end();
    }
    if (req.method === "POST") {
      if (!validEditorOrigin(req)) return res.status(403).json({ error: "Invalid request origin." });
      if (!["editor", "admin"].includes(access.role))
        return res
          .status(403)
          .json({ error: "An editor or administrator role is required to customize your dashboard." });
      if (
        !validDashboard(req.body?.dashboard) ||
        !Number.isSafeInteger(req.body.revision) ||
        req.body.revision < 0 ||
        Object.keys(req.body).some((key) => !["dashboard", "revision"].includes(key))
      )
        return res.status(400).json({ error: "Check the dashboard title, links and layout." });
    }
    store = usersStore();
    const actor = store.identify(token);
    if (!actor.enabled) return res.status(403).json({ error: "Your Gather access is disabled." });
    const result =
      req.method === "GET"
        ? store.dashboard(token.sub)
        : store.saveDashboard(token.sub, req.body.dashboard, req.body.revision, actor.name);
    return res.json({ ...result, canEdit: ["editor", "admin"].includes(actor.role) });
  } catch (e) {
    const conflict = e.message === "This dashboard changed. Reload before saving.";
    return res
      .status(conflict ? 409 : 500)
      .json({ error: conflict ? e.message : "Your dashboard is temporarily unavailable." });
  } finally {
    store?.close();
  }
}
