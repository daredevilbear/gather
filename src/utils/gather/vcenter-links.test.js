import { expect, it } from "vitest";
import { resolveVcenterLinks, vcenterObjectUrl } from "./vcenter-links";
const uuid = "12345678-1234-1234-1234-123456789abc";
it("targets each exact VM or host using its vCenter instance UUID", () => {
  expect(vcenterObjectUrl("https://vc.test", uuid, "vm-12")).toBe(
    `https://vc.test/ui/app/vm;nav=h/urn:vmomi:VirtualMachine:vm-12:${uuid}/summary`,
  );
  expect(vcenterObjectUrl("https://vc.test", uuid, undefined, "host-4")).toContain(`HostSystem:host-4:${uuid}/summary`);
  expect(() => vcenterObjectUrl("https://vc.test", undefined, "vm-12")).toThrow();
  expect(() => vcenterObjectUrl("https://vc.test", uuid, "../other")).toThrow();
});
it("repairs existing generic links in nested groups while keeping custom service URLs", () => {
  const service = { vcenterServer: "lab", vcenterVM: "vm-12", href: "https://vc.test/ui" };
  const custom = { ...service, href: "https://app.test/ui" };
  const explicit = { ...service, href: "https://vc.test/ui/app/custom" };
  const groups = [{ services: [custom, explicit], groups: [{ services: [service] }] }];
  resolveVcenterLinks(groups, { lab: { url: "https://vc.test" } });
  expect(service.href).toBe("/api/vcenter/open?instance=lab&vm=vm-12");
  expect(custom.href).toBe("https://app.test/ui");
  expect(explicit.href).toBe("https://vc.test/ui/app/custom");
});
