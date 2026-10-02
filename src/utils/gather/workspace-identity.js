import { getToken } from "next-auth/jwt";

import { userAccess } from "./users-store";
export async function workspaceIdentity(req) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.GATHER_AUTH_SECRET });
  if (!token?.sub) throw Object.assign(Error("Sign in to use dashboards."), { status: 401 });
  const access = userAccess(token.sub);
  if (!access.enabled) throw Object.assign(Error("Your Gather access is disabled."), { status: 403 });
  return { subject: token.sub, ...access };
}
