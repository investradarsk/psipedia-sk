export type MapTypeIdleSuppressionState = {
  phase: "clear" | "awaiting-map-type-change" | "awaiting-idle";
  generation: number;
};

export function createMapTypeIdleSuppressionState(): MapTypeIdleSuppressionState {
  return { phase: "clear", generation: 0 };
}

export function beginMapTypeIdleSuppression(state: MapTypeIdleSuppressionState) {
  state.generation += 1;
  state.phase = "awaiting-map-type-change";
}

export function confirmMapTypeChange(state: MapTypeIdleSuppressionState) {
  if (state.phase === "awaiting-map-type-change") {
    state.phase = "awaiting-idle";
  }
}

export function consumeMapTypeIdleSuppression(state: MapTypeIdleSuppressionState) {
  if (state.phase !== "awaiting-idle") return false;
  state.phase = "clear";
  return true;
}

export function cancelMapTypeIdleSuppression(state: MapTypeIdleSuppressionState) {
  state.phase = "clear";
}
