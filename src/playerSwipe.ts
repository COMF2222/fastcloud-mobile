export type SwipeAction = "next" | "previous";

export function playerSwipe(
  dx: number,
  dy: number,
  durationMs: number,
  width: number,
): SwipeAction | null {
  if (![dx, dy, durationMs, width].every(Number.isFinite)) return null;
  const threshold = Math.min(80, Math.max(42, width * 0.15));
  if (durationMs < 0 || durationMs > 1200 || Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "previous";
}
