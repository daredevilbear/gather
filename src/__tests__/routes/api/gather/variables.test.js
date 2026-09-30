import handler from "pages/api/gather/variables";
import { administrator, validEditorOrigin } from "utils/gather/admin";
import { variablesAvailable, variablesStore } from "utils/gather/variables-store";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("utils/gather/admin", () => ({ administrator: vi.fn(), validEditorOrigin: vi.fn() }));
vi.mock("utils/config/config", () => ({ CONF_DIR: "/test" }));
vi.mock("utils/gather/variables-store", async (original) => ({
  ...(await original()),
  variablesAvailable: vi.fn(),
  variablesStore: vi.fn(),
}));
const store = { list: vi.fn().mockReturnValue([]), save: vi.fn(), toggle: vi.fn(), close: vi.fn() };
const res = () => {
  const r = {
    setHeader: vi.fn(),
    json: vi.fn(),
    status: vi.fn(),
    end: vi.fn(),
    revalidate: vi.fn().mockResolvedValue(),
  };
  r.status.mockReturnValue(r);
  return r;
};
beforeEach(() => {
  vi.clearAllMocks();
  administrator.mockResolvedValue(true);
  validEditorOrigin.mockReturnValue(true);
  variablesAvailable.mockReturnValue(true);
  variablesStore.mockReturnValue(store);
});
it("requires admin authorization and CSRF checks before reading or writing the vault", async () => {
  administrator.mockResolvedValue(false);
  const denied = res();
  await handler({ method: "GET" }, denied);
  expect(denied.status).toHaveBeenCalledWith(403);
  expect(variablesStore).not.toHaveBeenCalled();
  administrator.mockResolvedValue(true);
  validEditorOrigin.mockReturnValue(false);
  const csrf = res();
  await handler({ method: "POST" }, csrf);
  expect(csrf.status).toHaveBeenCalledWith(403);
  expect(variablesStore).not.toHaveBeenCalled();
});
it("rejects reserved names and offers no plaintext fallback without a key", async () => {
  const invalid = res();
  await handler(
    { method: "POST", body: { action: "save", name: "NEXTAUTH_SECRET", kind: "secret", value: "x" } },
    invalid,
  );
  expect(invalid.status).toHaveBeenCalledWith(400);
  expect(store.save).not.toHaveBeenCalled();
  variablesAvailable.mockReturnValue(false);
  const unavailable = res();
  await handler({ method: "POST" }, unavailable);
  expect(unavailable.status).toHaveBeenCalledWith(503);
});
