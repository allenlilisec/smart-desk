import { describe, it, expect } from "vitest";
import {
  evaluateRouteAccess,
  getRequestAuth,
  isPublicPath,
  requiredRoleForPath,
} from "../auth/route-guard";

describe("route-guard", () => {
  it("treats healthz and login as public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/healthz")).toBe(true);
    expect(isPublicPath("/portal")).toBe(false);
  });

  it("maps route prefixes to minimum roles", () => {
    expect(requiredRoleForPath("/admin/settings")).toBe("admin");
    expect(requiredRoleForPath("/dashboard")).toBe("manager");
    expect(requiredRoleForPath("/agent")).toBe("agent");
    expect(requiredRoleForPath("/portal/new")).toBe("requester");
  });

  it("uses Authorization header or non-sensitive session marker as coarse auth presence", () => {
    const fromHeader = getRequestAuth(() => undefined, "Bearer header-token");
    expect(fromHeader.hasSession).toBe(true);

    const fromCookie = getRequestAuth((name) => (name === "sd_session" ? "1" : undefined));
    expect(fromCookie.hasSession).toBe(true);
  });

  it("redirects unauthenticated users away from protected routes", () => {
    expect(evaluateRouteAccess("/portal", { hasSession: false })).toBe("login");
  });

  it("does not trust writable role cookies for middleware authorization", () => {
    expect(evaluateRouteAccess("/admin", { hasSession: true })).toBe("allow");
    expect(evaluateRouteAccess("/dashboard", { hasSession: true })).toBe("allow");
  });

  it("allows routes when coarse auth presence exists", () => {
    expect(evaluateRouteAccess("/portal", { hasSession: true })).toBe("allow");
    expect(evaluateRouteAccess("/agent", { hasSession: true })).toBe("allow");
    expect(evaluateRouteAccess("/admin", { hasSession: true })).toBe("allow");
  });
});
