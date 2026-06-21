import { describe, it, expect, beforeEach } from "vitest";
import {
  clearSession,
  getAccessToken,
  getStoredMe,
  saveAccessToken,
  saveSession,
} from "../auth";
import type { Me, TokenPair } from "../types";

const mockTokens: TokenPair = {
  access_token: "test-access-token",
  token_type: "bearer",
  expires_in: 3600,
};

const mockMe: Me = {
  user_id: "user-1",
  username: "testuser",
  display_name: "Test User",
  org_id: "org-1",
  roles: ["agent"],
};

beforeEach(() => {
  clearSession();
  sessionStorage.clear();
  localStorage.clear();
  document.cookie = "sd_access_token=; Path=/; Max-Age=0";
  document.cookie = "sd_roles=; Path=/; Max-Age=0";
  document.cookie = "sd_session=; Path=/; Max-Age=0";
});

describe("saveSession", () => {
  it("stores access_token in memory only, not web storage or readable cookies", () => {
    saveSession(mockTokens, mockMe);

    expect(getAccessToken()).toBe("test-access-token");
    expect(sessionStorage.getItem("sd_access_token")).toBeNull();
    expect(localStorage.getItem("sd_access_token")).toBeNull();
    expect(document.cookie).not.toContain("sd_access_token");
    expect(document.cookie).not.toContain("test-access-token");
  });

  it("does NOT store refresh_token anywhere (managed by HttpOnly Cookie)", () => {
    saveSession(mockTokens, mockMe);

    expect(sessionStorage.getItem("sd_refresh_token")).toBeNull();
    expect(localStorage.getItem("sd_refresh_token")).toBeNull();
  });

  it("stores me in sessionStorage, not localStorage", () => {
    saveSession(mockTokens, mockMe);

    expect(sessionStorage.getItem("sd_me")).not.toBeNull();
    expect(localStorage.getItem("sd_me")).toBeNull();
  });
});

describe("getAccessToken", () => {
  it("reads from memory", () => {
    saveAccessToken("abc");
    expect(getAccessToken()).toBe("abc");
  });

  it("ignores sessionStorage", () => {
    sessionStorage.setItem("sd_access_token", "abc");
    expect(getAccessToken()).toBeNull();
  });

  it("returns null when nothing stored", () => {
    expect(getAccessToken()).toBeNull();
  });

  it("returns null even if localStorage has the key (no localStorage read)", () => {
    localStorage.setItem("sd_access_token", "old-token");
    expect(getAccessToken()).toBeNull();
  });
});

describe("getStoredMe", () => {
  it("reads from sessionStorage", () => {
    sessionStorage.setItem("sd_me", JSON.stringify(mockMe));
    expect(getStoredMe()).toEqual(mockMe);
  });

  it("returns null when nothing stored", () => {
    expect(getStoredMe()).toBeNull();
  });
});

describe("clearSession", () => {
  it("removes access_token from memory and clears cached me", () => {
    saveSession(mockTokens, mockMe);
    clearSession();

    expect(getAccessToken()).toBeNull();
    expect(sessionStorage.getItem("sd_access_token")).toBeNull();
    expect(sessionStorage.getItem("sd_me")).toBeNull();
  });

  it("removes legacy readable auth cookies", () => {
    document.cookie = "sd_access_token=legacy; Path=/";
    document.cookie = "sd_roles=agent; Path=/";
    document.cookie = "sd_session=1; Path=/";
    clearSession();

    expect(document.cookie).not.toContain("sd_access_token");
    expect(document.cookie).not.toContain("sd_roles");
    expect(document.cookie).not.toContain("sd_session");
  });

  it("does NOT remove sd_refresh_token from anywhere (Cookie cleared by gateway)", () => {
    sessionStorage.setItem("sd_refresh_token", "should-not-exist");
    localStorage.setItem("sd_refresh_token", "should-not-exist");
    clearSession();

    // clearSession must NOT touch refresh tokens at all
    // (they are HttpOnly cookies managed by the gateway)
    expect(localStorage.getItem("sd_refresh_token")).not.toBeNull();
  });
});

describe("OQ-W2 regression: localStorage must never hold tokens after any auth operation", () => {
  it("localStorage is clean after saveSession", () => {
    saveSession(mockTokens, mockMe);
    expect(localStorage.getItem("sd_access_token")).toBeNull();
    expect(localStorage.getItem("sd_refresh_token")).toBeNull();
  });

  it("localStorage is clean after clearSession", () => {
    saveSession(mockTokens, mockMe);
    clearSession();
    expect(localStorage.getItem("sd_access_token")).toBeNull();
    expect(localStorage.getItem("sd_refresh_token")).toBeNull();
  });
});
