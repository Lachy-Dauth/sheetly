/**
 * Lightweight performance counters for hot paths. Zero overhead when
 * disabled. Enable via `setProfilingEnabled(true)` from tests or devtools.
 *
 * Counts only the events that proved expensive during M12 profiling:
 *   - formula parse calls (cache miss vs. hit)
 *   - format resolutions (cache miss vs. hit)
 *   - formula evaluations
 *   - recalc invocations
 */

export interface ProfileSnapshot {
  parseMiss: number;
  parseHit: number;
  formatMiss: number;
  formatHit: number;
  evalCalls: number;
  recalcCalls: number;
}

let enabled = false;
const counters: ProfileSnapshot = {
  parseMiss: 0,
  parseHit: 0,
  formatMiss: 0,
  formatHit: 0,
  evalCalls: 0,
  recalcCalls: 0,
};

export function setProfilingEnabled(on: boolean): void {
  enabled = on;
}

export function isProfilingEnabled(): boolean {
  return enabled;
}

export function recordParse(hit: boolean): void {
  if (!enabled) return;
  if (hit) counters.parseHit++;
  else counters.parseMiss++;
}

export function recordFormat(hit: boolean): void {
  if (!enabled) return;
  if (hit) counters.formatHit++;
  else counters.formatMiss++;
}

export function recordEval(): void {
  if (!enabled) return;
  counters.evalCalls++;
}

export function recordRecalc(): void {
  if (!enabled) return;
  counters.recalcCalls++;
}

export function getProfile(): ProfileSnapshot {
  return { ...counters };
}

export function resetProfile(): void {
  counters.parseMiss = 0;
  counters.parseHit = 0;
  counters.formatMiss = 0;
  counters.formatHit = 0;
  counters.evalCalls = 0;
  counters.recalcCalls = 0;
}
