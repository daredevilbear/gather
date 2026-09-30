import { getToken } from "next-auth/jwt";

import { CONF_DIR } from "utils/config/config";
import { validEditorOrigin } from "utils/gather/admin";
import { preferencesStore } from "utils/gather/preferences-store";

export const config = { api: { bodyParser: { sizeLimit: "2kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.HOMEPAGE_AUTH_SECRET });
  if (typeof token?.sub !== "string" || !token.sub) return res.status(401).json({ error: "Sign in to manage your preferences." });
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (req.method === "POST" && !validEditorOrigin(req)) return res.status(403).json({ error: "Invalid request origin." });
  if (req.method === "POST" && (!req.body || Object.keys(req.body).some((key) => key !== "widgetsPosition") ||
    !["above", "below"].includes(req.body.widgetsPosition))) return res.status(400).json({ error: "Choose above or below tabs." });
  let store;
  try {
    store = preferencesStore(CONF_DIR);
    return res.json(req.method === "GET" ? store.read(token.sub) : store.save(token.sub, req.body));
  } catch {
    return res.status(500).json({ error: "Could not access your preferences. Try again." });
  } finally {
    store?.close();
  }
}
