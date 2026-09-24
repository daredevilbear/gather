// Shared browser/server metadata. Keep credentials out of this module.
export const CONNECTION_FILES = ["docker.yaml", "kubernetes.yaml", "proxmox.yaml", "vcenter.yaml"];
export const HOMEPAGE_FILES = [
  "settings.yaml",
  "services.yaml",
  "bookmarks.yaml",
  "widgets.yaml",
  ...CONNECTION_FILES,
  "custom.css",
  "custom.js",
];
