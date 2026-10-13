import test from "node:test";
import assert from "node:assert/strict";
import { artist, type Track } from "../src/types.ts";
test("missing and placeholder credits fall back to metadata or the uploader", () => {
  const track = {
    metadata_artist: "Lil Peep",
    user: { username: "Uploader" },
    publisher_metadata: { artist: "null" },
  } as Track;
  assert.equal(artist(track), "Lil Peep");
  track.metadata_artist = " undefined ";
  assert.equal(artist(track), "Uploader");
  track.publisher_metadata!.artist = "CUPSIZE";
  assert.equal(artist(track), "CUPSIZE");
  assert.equal(artist({} as Track), "—");
});
