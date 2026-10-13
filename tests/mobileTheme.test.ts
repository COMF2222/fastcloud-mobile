import test from "node:test";
import assert from "node:assert/strict";
import { mobileTheme } from "../src/mobileTheme.ts";
import { contrast } from "../src/themePalette.ts";
test("light and dark navigation, solid player and dialogs remain readable with imported custom colours", () => {
  for (const light of [true, false])
    for (const opacity of [0, 0.05, 0.5, 1])
      for (const color of [
        [0, 0, 0],
        [255, 255, 255],
        [185, 156, 223],
        [255, 0, 0],
      ]) {
        const theme = mobileTheme(
          {
            panel_rgb: color,
            panel_opacity: opacity,
            text_rgb: [255, 255, 255],
            muted_text_rgb: [245, 245, 245],
            accent_rgb: [255, 255, 255],
          },
          light,
        );
        for (const background of theme.backgrounds) {
          assert.ok(
            contrast(background, theme.text) >= 4.5,
            `${light} ${opacity} text`,
          );
          assert.ok(
            contrast(background, theme.muted) >= 4.5,
            `${light} ${opacity} muted`,
          );
          assert.ok(
            contrast(background, theme.accent) >= 4.5,
            `${light} ${opacity} accent`,
          );
        }
        assert.ok(contrast(theme.accent, theme.onAccent) >= 4.5);
      }
});
