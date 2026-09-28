export type MapTypePresentationBaseline = {
  center: { lat: number; lng: number };
  zoom: number;
};

export type MapTypeIdleSuppressionState = {
  generation: number;
  pending: boolean;
  desiredMapType: string | null;
  baseline: MapTypePresentationBaseline | null;
  observedRuntimeMapType: string | null;
};

export function createMapTypeIdleSuppressionState(): MapTypeIdleSuppressionState {
  return {
    generation: 0,
    pending: false,
    desiredMapType: null,
    baseline: null,
    observedRuntimeMapType: null,
  };
}

export function beginMapTypeIdleSuppression(
  state: MapTypeIdleSuppressionState,
  desiredMapType: string,
  baseline: MapTypePresentationBaseline,
) {
  state.generation += 1;
  state.pending = true;
  state.desiredMapType = desiredMapType;
  state.baseline = baseline;
  state.observedRuntimeMapType = null;
  return state.generation;
}

export function confirmMapTypeChange(
  state: MapTypeIdleSuppressionState,
  runtimeMapType?: string | null,
) {
  if (!state.pending) return;
  state.observedRuntimeMapType = runtimeMapType ?? state.observedRuntimeMapType;
}

export function consumeMapTypeIdleSuppression(
  state: MapTypeIdleSuppressionState,
  runtimeMapType?: string | null,
) {
  if (!state.pending) return false;

  const runtime = runtimeMapType ?? state.observedRuntimeMapType;
  const settledLatest = runtime != null
    && state.desiredMapType != null
    && runtime === state.desiredMapType;

  if (settledLatest) {
    cancelMapTypeIdleSuppression(state);
  } else if (runtime != null) {
    state.observedRuntimeMapType = runtime;
  }

  return true;
}

export function cancelMapTypeIdleSuppression(state: MapTypeIdleSuppressionState) {
  state.pending = false;
  state.desiredMapType = null;
  state.baseline = null;
  state.observedRuntimeMapType = null;
}
