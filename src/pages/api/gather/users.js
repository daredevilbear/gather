import { getToken } from "next-auth/jwt";

import { administrator, validEditorOrigin } from "utils/gather/admin";
import { usersStore } from "utils/gather/users-store";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!(await administrator(req))) return res.status(403).json({ error: "Administrator access is required." });
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }
  if (req.method === "POST" && !validEditorOrigin(req))
    return res.status(403).json({ error: "Invalid request origin." });
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.HOMEPAGE_AUTH_SECRET });
  if (!token?.sub) return res.status(401).json({ error: "Sign in again." });
  const canAddUsers = Boolean(
    process.env.HOMEPAGE_OIDC_ISSUER && process.env.HOMEPAGE_OIDC_CLIENT_ID && process.env.HOMEPAGE_OIDC_CLIENT_SECRET,
  );
  if (req.method === "POST" && req.body?.action === "add" && !canAddUsers)
    return res.status(409).json({
      error:
        "Configure OIDC sign-in before adding individual users. A shared password identifies everyone as one account.",
    });
  let store;
  try {
    store = usersStore();
    const actor = store.identify(token);
    if (req.method === "POST") {
      if (req.body?.action === "add") store.add(req.body, actor.name);
      else if (req.body?.action === "update") store.update(req.body.id, req.body, token.sub, actor.name);
      else return res.status(400).json({ error: "Unsupported user action." });
    }
    return res.json({ users: store.list(), activity: store.activity(), canAddUsers, currentUserId: actor.id });
  } catch (e) {
    const safe = [
      "Enter a name, email and valid role.",
      "A user with this email already exists.",
      "Choose a valid role and access status.",
      "User not found.",
      "This administrator is protected by the server configuration.",
      "Ask another administrator to change your own access.",
    ];
    return res
      .status(safe.includes(e.message) ? 400 : 500)
      .json({ error: safe.includes(e.message) ? e.message : "User management is temporarily unavailable." });
  } finally {
    store?.close();
  }
}
