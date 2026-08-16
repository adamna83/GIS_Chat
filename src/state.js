/**
 * Central shared application state.
 */
export const state = {
  map: null,
  basemap: null,
  layers: new Map(),
  seq: 0,
  /** chat history for the agent: [{role, content, tool_calls?, name?}] */
  history: [],
};

export function nextId(prefix) {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

/** Tiny pub/sub so UI panels can refresh when layers change. */
const listeners = new Set();

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn();
}
