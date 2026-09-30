// Build browser-safe metadata from this fork's own integration examples.
// Runtime server widget modules must never be imported into the editor bundle.
import fs from "node:fs";

import * as yaml from "js-yaml";
const registry = fs.readFileSync("src/widgets/widgets.js", "utf8").split("const widgets = {")[1].split("};")[0];
const ids = [...registry.matchAll(/^  (\w+)[,:]/gm)].map((m) => m[1]);
const catalog = new Map(ids.map((id) => [id, { id, name: id, fields: [] }]));
for (const file of fs.readdirSync("docs/widgets/services")) {
  if (!file.endsWith(".md")) continue;
  const text = fs.readFileSync(`docs/widgets/services/${file}`, "utf8");
  for (const match of text.matchAll(/```ya?ml\n([\s\S]*?)```/g)) {
    let example;
    try {
      example = yaml.load(match[1])?.widget;
    } catch {
      continue;
    }
    if (!example?.type || !catalog.has(example.type)) continue;
    const item = catalog.get(example.type);
    if (item.doc) continue;
    item.name = text.match(/^title: (.+)$/m)?.[1].replaceAll('"', "") || example.type;
    item.doc = file.replace(/\.md$/, "");
    const setupUrl = text.match(/^setup_url: (https:\/\/\S+)$/m)?.[1];
    if (setupUrl) item.docUrl = setupUrl;
    item.fields = Object.entries(example)
      .filter(([key, val]) => key !== "type" && val !== null && typeof val !== "object")
      .map(([key, val]) => ({
        key,
        kind:
          typeof val === "boolean"
            ? "boolean"
            : typeof val === "number"
              ? "number"
              : /password|secret|token|apikey|^key$/i.test(key)
                ? "password"
                : /url$/i.test(key)
                  ? "url"
                  : "text",
      }));
  }
}
fs.writeFileSync(
  "src/components/settings/widget-catalog.json",
  JSON.stringify(
    [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name)),
    null,
    2,
  ) + "\n",
);
console.log(`Catalogued ${catalog.size} integrations`);
