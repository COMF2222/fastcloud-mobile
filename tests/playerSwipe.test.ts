import test from "node:test";
import assert from "node:assert/strict";
import { playerSwipe } from "../src/playerSwipe.ts";

test("horizontal swipes select the next or previous track on both player sizes", () => {
  assert.equal(playerSwipe(-60, 5, 300, 220), "next");
  assert.equal(playerSwipe(100, -10, 500, 400), "previous");
});

test("taps, lyric scrolling, diagonal motion and held touches do not skip music", () => {
  for (const [dx, dy, duration, width] of [[8, 2, 100, 220], [20, 90, 300, 400], [80, 80, 400, 400], [-100, 2, 1500, 400], [100, 0, -1, 400], [NaN, 0, 300, 400]]) {
    assert.equal(playerSwipe(dx, dy, duration, width), null);
  }
});
