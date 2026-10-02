import { getToken } from "next-auth/jwt";

import { CONF_DIR } from "utils/config/config";
import { isAuthEnabled } from "utils/env";
import { ConfigError } from "utils/gather/config-store";
import { iconStore } from "utils/gather/icon-store";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  if (
    isAuthEnabled() &&
    !(await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.GATHER_AUTH_SECRET }))
  )
    return res.status(401).end();
  try {
    const image = await iconStore(CONF_DIR).read(req.query.name);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    return req.method === "HEAD" ? res.status(200).end() : res.status(200).send(image);
  } catch (e) {
    return res.status(e instanceof ConfigError ? e.status : 500).end();
  }
}
