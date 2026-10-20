import { getToken } from "next-auth/jwt";
import handler from "pages/api/gather/backups";
import { systemAdministrator, validEditorOrigin } from "utils/gather/admin";
import { backupAction, listBackups, queueBackup } from "utils/gather/backup-store";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("utils/gather/admin", () => ({ systemAdministrator: vi.fn(), validEditorOrigin: vi.fn() }));
vi.mock("utils/gather/backup-store", () => ({
  backupAction: vi.fn(),
  listBackups: vi.fn(),
  queueBackup: vi.fn(),
  jobDirectory: vi.fn(),
  readJob: vi.fn(),
}));
function response() {
  const res = { setHeader: vi.fn(), json: vi.fn(), status: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  systemAdministrator.mockResolvedValue(true);
  validEditorOrigin.mockReturnValue(true);
  getToken.mockResolvedValue({ sub: "protected-admin" });
});
it("requires protected server administration before accessing backups", async () => {
  systemAdministrator.mockResolvedValue(false);
  const res = response();
  await handler({ method: "GET", query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(listBackups).not.toHaveBeenCalled();
});
it("scopes lists and operations to the authenticated identity and rejects cross-origin mutations", async () => {
  await handler({ method: "GET", query: {} }, response());
  expect(listBackups).toHaveBeenCalledWith("protected-admin");
  validEditorOrigin.mockReturnValue(false);
  const res = response();
  await handler({ method: "POST", body: { action: "backup", password: "disposable-passphrase", owner: "other" } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(queueBackup).not.toHaveBeenCalled();
  validEditorOrigin.mockReturnValue(true);
  await handler(
    { method: "POST", body: { action: "backup", password: "disposable-passphrase", owner: "other" } },
    response(),
  );
  expect(queueBackup).toHaveBeenCalledWith("backup", "disposable-passphrase", "protected-admin", undefined);
  await handler({ method: "POST", body: { action: "restore", id: "snapshot" } }, response());
  expect(backupAction).toHaveBeenCalledWith("restore", "snapshot", { sub: "protected-admin" });
});
