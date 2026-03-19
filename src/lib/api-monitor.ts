/**
 * Lightweight API call monitor for debugging bandwidth usage.
 * Only active in development or when explicitly enabled.
 */

interface ApiCallRecord {
  url: string;
  method: string;
  timestamp: number;
  status?: number;
  cached?: boolean;
}

class ApiMonitor {
  private calls: ApiCallRecord[] = [];
  private enabled = false;
  private windowStart = Date.now();

  enable() {
    this.enabled = true;
    this.windowStart = Date.now();
    this.calls = [];
    console.log('[ApiMonitor] Monitoring enabled');
  }

  disable() {
    this.enabled = false;
    console.log('[ApiMonitor] Monitoring disabled');
  }

  record(url: string, method: string, status?: number, cached = false) {
    if (!this.enabled) return;
    this.calls.push({ url, method, timestamp: Date.now(), status, cached });
  }

  getStats() {
    const now = Date.now();
    const windowMs = now - this.windowStart;
    const windowMin = Math.max(1, windowMs / 60000);

    // Group by endpoint
    const endpoints = new Map<string, number>();
    let errors = 0;
    let cachedCount = 0;

    this.calls.forEach(c => {
      // Extract path from full URL
      const path = c.url.replace(/https?:\/\/[^/]+/, '').split('?')[0];
      endpoints.set(path, (endpoints.get(path) || 0) + 1);
      if (c.status && c.status >= 400) errors++;
      if (c.cached) cachedCount++;
    });

    return {
      totalCalls: this.calls.length,
      callsPerMinute: Math.round(this.calls.length / windowMin * 10) / 10,
      errors,
      cachedHits: cachedCount,
      topEndpoints: Array.from(endpoints.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, count]) => ({ path, count })),
      windowMinutes: Math.round(windowMin * 10) / 10,
    };
  }

  report() {
    const stats = this.getStats();
    console.group('[ApiMonitor] Report');
    console.log(`Total calls: ${stats.totalCalls} in ${stats.windowMinutes}min (${stats.callsPerMinute}/min)`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Cache hits: ${stats.cachedHits}`);
    console.table(stats.topEndpoints);
    console.groupEnd();
    return stats;
  }

  reset() {
    this.calls = [];
    this.windowStart = Date.now();
  }
}

export const apiMonitor = new ApiMonitor();

// Auto-enable in development
if (import.meta.env.DEV) {
  apiMonitor.enable();
}

// Expose globally for debugging
if (typeof window !== 'undefined') {
  (window as any).__apiMonitor = apiMonitor;
}
