import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultPlacement as center,
  normalizePlacement,
  mediaGeometry,
  panPlacement,
  zoomPlacement,
  placementStyle,
} from "../src/wallpaperPlacement.ts";
const frame = { width: 400, height: 800 },
  landscape = { width: 1600, height: 900 };
test("old wallpaper records remain centered and corrupt placement cannot create broken CSS", () => {
  assert.deepEqual(normalizePlacement(undefined), center);
  assert.deepEqual(
    normalizePlacement({ x: NaN, y: Infinity, zoom: "3", fit: "invalid" }),
    center,
  );
  assert.deepEqual(
    normalizePlacement({ x: -1, y: 101, zoom: 50, fit: "contain" }),
    { x: 0, y: 100, zoom: 3, fit: "contain" },
  );
  assert.equal(
    mediaGeometry({ width: 0, height: 800 }, landscape, center),
    null,
  );
});
test("drag moves the selected image area and stays inside the image bounds", () => {
  const before = mediaGeometry(frame, landscape, center)!;
  const afterValue = panPlacement(center, frame, landscape, { x: 80, y: 80 });
  const after = mediaGeometry(frame, landscape, afterValue)!;
  assert.ok(Math.abs(after.left - before.left - 80) < 0.001);
  assert.equal(after.top, 0); // Cover already fits this axis exactly.
  assert.equal(panPlacement(center, frame, landscape, { x: 5000, y: 0 }).x, 0);
  assert.equal(
    panPlacement(center, frame, landscape, { x: -5000, y: 0 }).x,
    100,
  );
});
test("pinch zoom keeps the touched image point under the moving midpoint", () => {
  const start = { ...center, zoom: 1.5 },
    anchor = { x: 150, y: 300 },
    destination = { x: 180, y: 320 };
  const old = mediaGeometry(frame, landscape, start)!;
  const next = zoomPlacement(start, frame, landscape, 2, anchor, destination);
  const result = mediaGeometry(frame, landscape, next)!;
  assert.ok(
    Math.abs(
      (anchor.x - old.left) / old.width -
        (destination.x - result.left) / result.width,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      (anchor.y - old.top) / old.height -
        (destination.y - result.top) / result.height,
    ) < 1e-9,
  );
  assert.equal(zoomPlacement(start, frame, landscape, 99, anchor).zoom, 3);
});
test("fit retains the full image and saved CSS uses the same normalized framing after rotation", () => {
  const fit = { ...center, fit: "contain" as const };
  const geometry = mediaGeometry(frame, landscape, fit)!;
  assert.equal(geometry.width, frame.width);
  assert.ok(geometry.height < frame.height);
  const saved = JSON.parse(
    JSON.stringify({ ...center, x: 23, y: 67, zoom: 1.4 }),
  );
  assert.deepEqual(placementStyle(saved), {
    objectFit: "cover",
    objectPosition: "23% 67%",
    transform: "scale(1.4)",
    transformOrigin: "23% 67%",
  });
  const rotated = mediaGeometry({ width: 800, height: 400 }, landscape, saved)!;
  assert.ok(rotated.width >= 800 && rotated.height >= 400);
});
