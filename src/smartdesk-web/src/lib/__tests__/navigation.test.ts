import { describe, expect, it } from "vitest";
import { navItemsForRoles } from "../navigation";

describe("navItemsForRoles", () => {
  it("Given a requester When shell nav is built Then only the portal is visible", () => {
    expect(navItemsForRoles(["requester"]).map((item) => item.href)).toEqual(["/portal"]);
  });

  it("Given an agent role When shell nav is built Then the workspace is visible first", () => {
    expect(navItemsForRoles(["agent"]).map((item) => item.href)).toEqual([
      "/agent",
      "/portal",
    ]);
  });

  it("Given an elevated service role When shell nav is built Then the workspace is visible", () => {
    expect(navItemsForRoles(["manager"]).map((item) => item.href)).toContain("/agent");
  });
});
