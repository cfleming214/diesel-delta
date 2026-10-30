// Request log for the admin dashboard and load-test reports.
export type RequestRecord = { at: number; route: string; status: number; ms: number };

export function createMetrics(capacity = 50_000) {
  const requests: RequestRecord[] = [];
  return {
    requests,
    record(r: RequestRecord) {
      requests.push(r);
      if (requests.length > capacity) requests.splice(0, requests.length - capacity);
    },
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
