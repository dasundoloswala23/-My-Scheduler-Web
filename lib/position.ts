/**
 * Fractional ordering, identical to the Flutter app's Position helper, so both
 * clients agree on card order. A drop writes the midpoint of its neighbours,
 * which keeps a move to a single document write.
 */
export const POSITION_STEP = 1000;

export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return POSITION_STEP;
  if (prev === null) return next! - POSITION_STEP;
  if (next === null) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

/** Two neighbours too close for a double to split again. */
export function needsRebalance(prev: number | null, next: number | null): boolean {
  if (prev === null || next === null) return false;
  return Math.abs(next - prev) < 0.0001;
}

export function rebalanced(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP);
}
