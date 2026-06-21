import { describe, it, expect } from "vitest";
import { can, canAny, isAtLeast, ROLE_HIERARCHY } from "../rbac";
import type { Role } from "../types";

describe("RBAC", () => {
  it("ROLE_HIERARCHY order is requester < agent < lead < manager < admin", () => {
    expect(ROLE_HIERARCHY).toEqual(["requester", "agent", "lead", "manager", "admin"]);
  });

  it("isAtLeast respects hierarchy", () => {
    expect(isAtLeast("admin", "agent")).toBe(true);
    expect(isAtLeast("manager", "manager")).toBe(true);
    expect(isAtLeast("agent", "lead")).toBe(false);
    expect(isAtLeast("requester", "admin")).toBe(false);
  });

  it("can returns true if any role meets requirement", () => {
    expect(can(["requester", "agent"], "agent")).toBe(true);
    expect(can(["lead"], "agent")).toBe(true);
    expect(can(["requester"], "agent")).toBe(false);
  });

  it("canAny returns true if any required role is met", () => {
    expect(canAny(["requester"], ["agent", "requester"])).toBe(true);
    expect(canAny(["manager"], ["admin"])).toBe(false);
  });
});
