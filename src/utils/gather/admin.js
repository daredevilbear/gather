import { getToken } from "next-auth/jwt";

import { isAuthEnabled } from "utils/env";

export async function administrator(req) {
  if (!isAuthEnabled() || process.env.GATHER_EDITOR_ENABLED !== "true") return false;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.HOMEPAGE_AUTH_SECRET });
  const allowed = (process.env.GATHER_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Boolean(token?.sub && allowed.includes(token.sub));
}
export function validEditorOrigin(req) {
  const configured = process.env.HOMEPAGE_EXTERNAL_URL || process.env.NEXTAUTH_URL;
  try {
    return req.headers.origin === new URL(configured).origin && req.headers["x-gather-editor"] === "1";
  } catch {
    return false;
  }
}
