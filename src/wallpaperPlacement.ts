export type Placement = {
  fit: "cover" | "contain";
  x: number;
  y: number;
  zoom: number;
};
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export const defaultPlacement: Placement = {
  fit: "cover",
  x: 50,
  y: 50,
  zoom: 1,
};
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export function normalizePlacement(value: unknown): Placement {
  const row =
    value && typeof value === "object" ? (value as Partial<Placement>) : {};
  const number = (key: "x" | "y" | "zoom", min: number, max: number) =>
    typeof row[key] === "number" && Number.isFinite(row[key])
      ? clamp(row[key], min, max)
      : defaultPlacement[key];
  return {
    fit: row.fit === "contain" ? "contain" : "cover",
    x: number("x", 0, 100),
    y: number("y", 0, 100),
    zoom: number("zoom", 1, 3),
  };
}
export function mediaGeometry(frame: Size, media: Size, value: Placement) {
  const placement = normalizePlacement(value);
  if (
    ![frame.width, frame.height, media.width, media.height].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;
  const scale =
    (placement.fit === "cover" ? Math.max : Math.min)(
      frame.width / media.width,
      frame.height / media.height,
    ) * placement.zoom;
  const width = media.width * scale,
    height = media.height * scale;
  return {
    width,
    height,
    left: ((frame.width - width) * placement.x) / 100,
    top: ((frame.height - height) * placement.y) / 100,
  };
}
function align(offset: number, remaining: number, fallback: number) {
  return Math.abs(remaining) < 0.5
    ? fallback
    : clamp((offset / remaining) * 100, 0, 100);
}
export function panPlacement(
  value: Placement,
  frame: Size,
  media: Size,
  delta: Point,
): Placement {
  const geometry = mediaGeometry(frame, media, value);
  if (!geometry) return value;
  return normalizePlacement({
    ...value,
    x: align(geometry.left + delta.x, frame.width - geometry.width, value.x),
    y: align(geometry.top + delta.y, frame.height - geometry.height, value.y),
  });
}
/** Keep the touched image point under the moving pinch midpoint. */
export function zoomPlacement(
  value: Placement,
  frame: Size,
  media: Size,
  zoom: number,
  anchor: Point,
  destination = anchor,
): Placement {
  const before = mediaGeometry(frame, media, value);
  const next = normalizePlacement({ ...value, zoom });
  const after = mediaGeometry(frame, media, next);
  if (!before || !after) return next;
  const imageX = (anchor.x - before.left) / before.width,
    imageY = (anchor.y - before.top) / before.height;
  return {
    ...next,
    x: align(
      destination.x - imageX * after.width,
      frame.width - after.width,
      next.x,
    ),
    y: align(
      destination.y - imageY * after.height,
      frame.height - after.height,
      next.y,
    ),
  };
}
export function placementStyle(value: Placement) {
  const p = normalizePlacement(value);
  const position = `${p.x}% ${p.y}%`;
  return {
    objectFit: p.fit,
    objectPosition: position,
    transform: `scale(${p.zoom})`,
    transformOrigin: position,
  };
}
