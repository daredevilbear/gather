import { expect, it } from "vitest";
import { addVcenterServices, listVcenterServices, removeVcenterService } from "./vcenter-services";
it("merges VM cards and a summary, preserves content and avoids duplicates or name overwrites", () => {
  const source = [{ Home: [{ App: { href: "https://app.test", widget: { type: "custom" } } }] }];
  const machines = [
    { id: "vm-1", name: "App" },
    { id: "vm-2", name: "App" },
  ];
  const first = addVcenterServices(source, "Home", "lab", machines, true, "https://vc.test/ui");
  expect(first.added).toBe(3);
  expect(source[0].Home).toHaveLength(1);
  expect(first.services[0].Home[0]).toEqual(source[0].Home[0]);
  expect(first.services[0].Home[1]["App (2)"].vcenterVM).toBe("vm-1");
  expect(first.services[0].Home[2]["App (3)"].vcenterVM).toBe("vm-2");
  expect(addVcenterServices(first.services, "Home", "lab", machines, true, "https://vc.test/ui").added).toBe(0);
  expect(() => addVcenterServices(source, "Missing", "lab", machines, false, "")).toThrow("existing service group");
});

it("adds hosts without colliding with VM names and skips previously linked hosts", () => {
  const source = [{ Home: [{ ESXi: { vcenterServer: "lab", vcenterVM: "vm-1" } }] }];
  const hosts = [{ id: "host-1", name: "ESXi" }];
  const result = addVcenterServices(source, "Home", "lab", [], false, "https://vc.test/ui", hosts);
  expect(result.added).toBe(1);
  expect(result.services[0].Home[1]["ESXi (2)"].vcenterHost).toBe("host-1");
  expect(addVcenterServices(result.services, "Home", "lab", [], false, "https://vc.test/ui", hosts).added).toBe(0);
});

it("removes only the chosen nested card and rejects a changed selection", () => {
  const source = [
    {
      Home: [{ Nested: [{ VM: { vcenterServer: "lab", vcenterVM: "vm-1" } }, { Keep: { href: "https://app.test" } }] }],
    },
  ];
  const cards = listVcenterServices(source, "lab");
  expect(cards[0].group).toBe("Home / Nested");
  const result = removeVcenterService(source, cards[0]);
  expect(result[0].Home[0].Nested).toEqual([source[0].Home[0].Nested[1]]);
  expect(source[0].Home[0].Nested).toHaveLength(2);
  source[0].Home[0].Nested[0] = { Different: { vcenterServer: "lab", vcenterVM: "vm-2" } };
  expect(() => removeVcenterService(source, cards[0])).toThrow("changed");
});
