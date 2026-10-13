import test from "node:test";
import assert from "node:assert/strict";
import { stationSeeds, stationOpening } from "../src/station.ts";
import type { Track } from "../src/types.ts";
const track = (id: number, access = "playable") =>
  ({ id, title: `Song ${id}`, access }) as Track;
test("collection seeds sample all parts, rotate, and ignore duplicate and restricted tracks", () => {
  const tracks = Array.from({ length: 100 }, (_, i) => track(i + 1));
  const seeds = stationSeeds(tracks, 0);
  assert.equal(seeds.length, 16);
  assert.ok(seeds.some((track) => track.id > 90));
  assert.notEqual(stationSeeds(tracks, 0.5)[0].id, seeds[0].id);
  assert.deepEqual(
    stationSeeds(
      [track(1), track(1), track(2, "preview"), track(3, "blocked")],
      0,
    ).map((track) => track.id),
    [1],
  );
});
test("a track starts with the selected song; collection and artist openings are bounded", () => {
  const seeds = stationSeeds(
    Array.from({ length: 100 }, (_, i) => track(i + 1)),
    0,
  );
  assert.deepEqual(
    stationOpening(seeds, "track").map((track) => track.id),
    [1],
  );
  assert.equal(stationOpening(seeds, "collection").length, 1);
  assert.equal(stationOpening(seeds, "artist").length, 1);
  assert.deepEqual(stationOpening([], "track"), []);
});
