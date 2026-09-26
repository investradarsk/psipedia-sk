export type MapDebugEntry = {
  t: number;
  event: string;
  data?: Record<string, unknown>;
};

declare global {
  interface Window {
    __PSIPEDIA_MAP_DEBUG_ENABLED__?: boolean;
    __PSIPEDIA_MAP_DEBUG__?: MapDebugEntry[];
  }
}

export function traceMapDebug(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.__PSIPEDIA_MAP_DEBUG_ENABLED__) return;
  const trace = window.__PSIPEDIA_MAP_DEBUG__ ?? [];
  window.__PSIPEDIA_MAP_DEBUG__ = trace;
  trace.push({
    t: Number(performance.now().toFixed(3)),
    event,
    data,
  });
  if (trace.length > 250) trace.splice(0, trace.length - 250);
}
