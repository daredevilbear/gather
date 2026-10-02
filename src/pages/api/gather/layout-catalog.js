import { getToken } from "next-auth/jwt";

import { bookmarksResponse, servicesResponse, widgetsResponse } from "utils/config/api-response";
import { getSettings } from "utils/config/config";
import { layoutCatalog } from "utils/gather/personal-layout";
import { userAccess } from "utils/gather/users-store";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.GATHER_AUTH_SECRET });
  if (!token?.sub) return res.status(401).json({ error: "Sign in to arrange your dashboard." });
  if (!userAccess(token.sub).enabled) return res.status(403).json({ error: "Your Gather access is disabled." });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  try {
    const [settings, services, bookmarks, widgets] = await Promise.all([
      getSettings(),
      servicesResponse(),
      bookmarksResponse(),
      widgetsResponse(),
    ]);
    return res.json(layoutCatalog(settings, services, bookmarks, widgets));
  } catch {
    return res.status(500).json({ error: "Could not load the shared dashboard catalog." });
  }
}
