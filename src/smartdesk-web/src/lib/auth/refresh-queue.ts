/**
 * Ensures concurrent 401 responses share a single in-flight /auth/refresh request.
 */
let refreshPromise: Promise<boolean> | null = null;

export function enqueueRefresh(refreshFn: () => Promise<boolean>): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshFn().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Test-only reset for queue state between cases. */
export function resetRefreshQueueForTests(): void {
  refreshPromise = null;
}
