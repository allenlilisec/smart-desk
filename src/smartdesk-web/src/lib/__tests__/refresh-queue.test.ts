import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueueRefresh, resetRefreshQueueForTests } from "../auth/refresh-queue";

beforeEach(() => {
  resetRefreshQueueForTests();
});

describe("RefreshQueue", () => {
  it("runs only one refresh at a time and shares the result", async () => {
    const refreshFn = vi.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(true), 20);
        })
    );

    const [first, second] = await Promise.all([
      enqueueRefresh(refreshFn),
      enqueueRefresh(refreshFn),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });

  it("allows a new refresh after the previous one settles", async () => {
    const refreshFn = vi.fn().mockResolvedValue(true);

    await enqueueRefresh(refreshFn);
    await enqueueRefresh(refreshFn);

    expect(refreshFn).toHaveBeenCalledTimes(2);
  });
});
