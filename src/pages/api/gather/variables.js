import { CONF_DIR } from "utils/config/config";
import { administrator, validEditorOrigin } from "utils/gather/admin";
import { VARIABLE_NAME, variablesAvailable, variablesStore } from "utils/gather/variables-store";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!(await administrator(req))) return res.status(403).json({ error: "Administrator access is required." });
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }
  if (req.method === "POST" && !validEditorOrigin(req))
    return res.status(403).json({ error: "Invalid request origin." });
  if (!variablesAvailable())
    return res
      .status(req.method === "GET" ? 200 : 503)
      .json({
        available: false,
        variables: [],
        error: "The Gather app encryption key must be mounted before managing variables.",
      });
  let store;
  try {
    if (req.method === "POST") {
      const body = req.body || {};
      if (
        !VARIABLE_NAME.test(body.name) ||
        !["save", "toggle"].includes(body.action) ||
        (body.action === "save" &&
          (!["secret", "variable"].includes(body.kind) ||
            typeof body.value !== "string" ||
            !body.value.length ||
            body.value.length > 8192)) ||
        (body.action === "toggle" && typeof body.enabled !== "boolean")
      )
        return res.status(400).json({ error: "Enter a valid name, type and value." });
      if (Object.hasOwn(process.env, body.name))
        return res
          .status(409)
          .json({ error: "This name is already set by the server environment. Use a different name." });
      store = variablesStore(CONF_DIR);
      if (body.action === "save") {
        if (store.list().some((item) => item.name === body.name && item.kind !== body.kind))
          return res.status(409).json({ error: "Use a new name to change a secret or variable type." });
        store.save(body.name, body.kind, body.value);
      } else store.toggle(body.name, body.enabled);
      let applied = true;
      try {
        await res.revalidate("/");
      } catch {
        applied = false;
      }
      return res.json({ available: true, variables: store.list(), applied });
    }
    store = variablesStore(CONF_DIR);
    return res.json({ available: true, variables: store.list() });
  } catch {
    return res
      .status(500)
      .json({ error: "Variable storage is unavailable. Check the app encryption key and storage permissions." });
  } finally {
    store?.close();
  }
}
