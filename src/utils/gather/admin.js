import { getToken } from "next-auth/jwt";

import { bootstrapAdmin, userAccess } from "./users-store";

import { isAuthEnabled } from "utils/env";

export async function administrator(req) {
  if (!isAuthEnabled() || process.env.GATHER_EDITOR_ENABLED !== "true") return false;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.GATHER_AUTH_SECRET });
  const allowed = (process.env.GATHER_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!token?.sub) return false;
  if (allowed.includes(token.sub)) return true;
  const access = userAccess(token.sub);
  return access.enabled && access.role === "admin";
}
export function validEditorOrigin(req) {
  const configured = process.env.GATHER_EXTERNAL_URL || process.env.NEXTAUTH_URL;
  try {
    return req.headers.origin === new URL(configured).origin && req.headers["x-gather-editor"] === "1";
  } catch {
    return false;
  }
}

export async function systemAdministrator(req) {
  if (!(await administrator(req))) return false;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.GATHER_AUTH_SECRET });
  return bootstrapAdmin(token?.sub);
}
