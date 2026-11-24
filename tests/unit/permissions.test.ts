import { describe, expect, it } from "vitest";

import { can, PERMISSION_MATRIX, PERMISSIONS, permissionsFor } from "@/modules/staff/permissions";
import { STAFF_ROLES, type StaffRole } from "@/modules/staff/roles";

// Expected matrix from docs/progress/phase-1b-plan.md §E — every cell is asserted.
const EXPECTED: Record<string, Record<StaffRole, boolean>> = {
  "customer.read": { OWNER: true, MANAGER: true, SERVICE_ADVISOR: true, TECHNICIAN: true },
  "customer.contacts.read": {
    OWNER: true,
    MANAGER: true,
    SERVICE_ADVISOR: true,
    TECHNICIAN: false,
  },
  "customer.create": { OWNER: true, MANAGER: true, SERVICE_ADVISOR: true, TECHNICIAN: false },
  "customer.update": { OWNER: true, MANAGER: true, SERVICE_ADVISOR: true, TECHNICIAN: false },
  "customer.contacts.manage": {
    OWNER: true,
    MANAGER: true,
    SERVICE_ADVISOR: true,
    TECHNICIAN: false,
  },
  "customer.archive": { OWNER: true, MANAGER: true, SERVICE_ADVISOR: false, TECHNICIAN: false },
  "vehicle.read": { OWNER: true, MANAGER: true, SERVICE_ADVISOR: true, TECHNICIAN: true },
  "vehicle.create": { OWNER: true, MANAGER: true, SERVICE_ADVISOR: true, TECHNICIAN: false },
  "vehicle.update": { OWNER: true, MANAGER: true, SERVICE_ADVISOR: true, TECHNICIAN: false },
  "vehicle.registration.change": {
    OWNER: true,
    MANAGER: true,
    SERVICE_ADVISOR: true,
    TECHNICIAN: false,
  },
  "vehicle.ownership.transfer": {
    OWNER: true,
    MANAGER: true,
    SERVICE_ADVISOR: true,
    TECHNICIAN: false,
  },
  "vehicle.archive": { OWNER: true, MANAGER: true, SERVICE_ADVISOR: false, TECHNICIAN: false },
  "activity.read": { OWNER: true, MANAGER: true, SERVICE_ADVISOR: true, TECHNICIAN: false },
};

describe("permission matrix", () => {
  it("covers every permission", () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual([...PERMISSIONS].sort());
    expect(Object.keys(EXPECTED).sort()).toEqual([...PERMISSIONS].sort());
  });

  for (const permission of PERMISSIONS) {
    for (const role of STAFF_ROLES) {
      it(`${role} ${EXPECTED[permission]![role] ? "can" : "cannot"} ${permission}`, () => {
        expect(can(role, permission)).toBe(EXPECTED[permission]![role]);
      });
    }
  }

  it("technicians cannot transfer ownership or read contacts", () => {
    const tech = permissionsFor("TECHNICIAN");
    expect(tech.has("vehicle.ownership.transfer")).toBe(false);
    expect(tech.has("customer.contacts.read")).toBe(false);
  });
});
