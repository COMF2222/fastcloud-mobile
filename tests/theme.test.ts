import test from "node:test";
import assert from "node:assert/strict";
import { panelPalette, contrast } from "../src/themePalette.ts";

test("opaque custom panels remain opaque and readable in both themes", () => {
  for (const light of [false, true]) {
    for (const colour of [
      [185, 156, 223],
      [255, 0, 0],
      [0, 255, 255],
      [255, 255, 255],
      [0, 0, 0],
    ]) {
      const palette = panelPalette(colour, 1, light);
      assert.equal(palette.alpha, 1);
      assert.deepEqual(palette.background, palette.surface);
      for (const background of palette.backgrounds) {
        assert.ok(contrast(background, palette.text) >= 4.5);
        assert.ok(contrast(background, palette.muted) >= 4.5);
      }
    }
  }
});
