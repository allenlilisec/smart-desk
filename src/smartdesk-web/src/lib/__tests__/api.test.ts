import { describe, it, expect, beforeEach, vi } from "vitest";

// Force real (non-mock) mode so request() and tryRefresh() are exercised.
vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.resetModules();
});

describe("tryRefresh: sends no body, uses credentials:include, stores token in memory", () => {
  it("refresh call has no body and includes credentials:include", async () => {
    const fetchSpy = vi.fn();
    // First call: 401 from getMe → triggers tryRefresh
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ code: "unauthorized", message: "" }),
    });
    // Second call: the refresh endpoint
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "refreshed-token" }),
    });
    // Third call: retry of getMe after successful refresh
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        user_id: "u1",
        username: "alice",
        display_name: "Alice",
        org_id: "o1",
        roles: ["agent"],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { api } = await import("../api");
    await api.getMe();

    const refreshCall = fetchSpy.mock.calls.find((call) =>
      String(call[0]).includes("/auth/refresh")
    );
    expect(refreshCall).toBeTruthy();
    const [, refreshOpts] = refreshCall!;
    expect(refreshOpts.method).toBe("POST");
    expect(refreshOpts.credentials).toBe("include");
    // No body — refresh_token travels as HttpOnly Cookie, not in request body
    expect(refreshOpts.body).toBeUndefined();
  });

  it("stores new access_token in memory, never in web storage", async () => {
    const fetchSpy = vi.fn();
    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ code: "unauthorized", message: "" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "refreshed-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user_id: "u1",
          username: "alice",
          display_name: "Alice",
          org_id: "o1",
          roles: ["agent"],
        }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    const { api } = await import("../api");
    const { getAccessToken } = await import("../auth");
    await api.getMe();

    expect(getAccessToken()).toBe("refreshed-token");
    expect(sessionStorage.getItem("sd_access_token")).toBeNull();
    expect(localStorage.getItem("sd_access_token")).toBeNull();
    expect(localStorage.getItem("sd_refresh_token")).toBeNull();
  });
});

describe("RefreshQueue: concurrent 401 only triggers one refresh", () => {
  it("deduplicates parallel refresh calls", async () => {
    const { saveAccessToken } = await import("../auth");
    saveAccessToken("expired-token");
    const fetchSpy = vi.fn();
    let meCalls = 0;

    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: "refreshed-token" }),
        };
      }

      if (url.includes("/auth/me")) {
        meCalls += 1;
        if (meCalls <= 2) {
          return {
            ok: false,
            status: 401,
            statusText: "Unauthorized",
            json: async () => ({ code: "unauthorized", message: "" }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user_id: "u1",
            username: "alice",
            display_name: "Alice",
            org_id: "o1",
            roles: ["agent"],
          }),
        };
      }

      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ code: "unauthorized", message: "" }),
      };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { api } = await import("../api");
    await Promise.all([api.getMe(), api.getMe()]);

    const refreshCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("/auth/refresh")
    );
    expect(refreshCalls).toHaveLength(1);
  });
});

describe("OQ-W2 regression: storage APIs must never hold tokens after any api operation", () => {
  it("login stores access_token in memory only", async () => {
    const fetchSpy = vi.fn();
    // login call
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "login-token",
        token_type: "bearer",
        expires_in: 3600,
      }),
    });
    // getMe call within login
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        user_id: "u1",
        username: "alice",
        display_name: "Alice",
        org_id: "o1",
        roles: ["agent"],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { api } = await import("../api");
    const { getAccessToken } = await import("../auth");
    await api.login("alice", "password");

    expect(getAccessToken()).toBe("login-token");
    expect(localStorage.getItem("sd_access_token")).toBeNull();
    expect(localStorage.getItem("sd_refresh_token")).toBeNull();
    expect(sessionStorage.getItem("sd_access_token")).toBeNull();
    expect(sessionStorage.getItem("sd_refresh_token")).toBeNull();
  });
});

describe("OQ-W2 mock contract", () => {
  it("mock login response omits refresh_token from JSON", async () => {
    const { mockApi } = await import("../mock");
    const { tokens } = await mockApi.login("alice", "password");

    expect("refresh_token" in tokens).toBe(false);
  });
});

describe("all non-mock fetch requests include credentials:include", () => {
  it("getMe includes credentials:include", async () => {
    const { saveAccessToken } = await import("../auth");
    saveAccessToken("tok");
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user_id: "u1",
        username: "alice",
        display_name: "Alice",
        org_id: "o1",
        roles: ["agent"],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { api } = await import("../api");
    await api.getMe();

    expect(fetchSpy).toHaveBeenCalled();
    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.credentials).toBe("include");
  });
});
