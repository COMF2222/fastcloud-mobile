import test from "node:test";
import assert from "node:assert/strict";
import { formatTime } from "../src/formatTime.ts";

test("playback timestamps retain minutes and seconds below an hour", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(61_999), "1:01");
  assert.equal(formatTime(3_599_999), "59:59");
});

test("long tracks display hours in both elapsed and total timestamps", () => {
  assert.equal(formatTime(3_600_000), "1:00:00");
  assert.equal(formatTime(140 * 60_000), "2:20:00");
  assert.equal(formatTime(140 * 60_000 + 9_999), "2:20:09");
  assert.equal(formatTime(25 * 3_600_000), "25:00:00");
});

test("invalid or negative playback timestamps remain safe", () => {
  for (const value of [-1, NaN, Infinity, -Infinity]) {
    assert.equal(formatTime(value), "0:00");
  }
});
