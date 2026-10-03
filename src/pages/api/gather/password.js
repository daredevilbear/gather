import { validEditorOrigin } from "utils/gather/admin";
import { localAccountsEnabled, usersStore } from "utils/gather/users-store";
import { workspaceIdentity } from "utils/gather/workspace-identity";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!validEditorOrigin(req)) return res.status(403).json({ error: "Invalid request origin." });
  if (!localAccountsEnabled()) return res.status(409).json({ error: "This installation does not use local accounts." });
  let store;
  try {
    const actor = await workspaceIdentity(req);
    store = usersStore();
    await store.changePassword(actor.subject, req.body?.currentPassword, req.body?.password);
    return res.json({ changed: true });
  } catch (e) {
    const safe = [
      "Choose a password of 12–1024 characters without line breaks.",
      "Current password is incorrect or sign-in is temporarily locked. Try again in a minute.",
      "Password changed. Sign in again.",
    ];
    return res.status(e.status || (safe.includes(e.message) ? 400 : 500)).json({
      error: safe.includes(e.message)
        ? e.message
        : e.status
          ? "Sign in again to change your password."
          : "Password change is temporarily unavailable.",
    });
  } finally {
    store?.close();
  }
}
