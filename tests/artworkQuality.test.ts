import test from "node:test";
import assert from "node:assert/strict";
import { artworkCandidates } from "../src/artworkQuality.ts";

test("full player requests original cover and falls back to supported CDN sizes", () => {
  const source = "https://i1.sndcdn.com/artworks-example-large.jpg";
  assert.deepEqual(artworkCandidates(source, 1080), [source.replace("-large", "-original"), source.replace("-large", "-t1080x1080"), source.replace("-large", "-t500x500"), source]);
  assert.equal(artworkCandidates(source, 200)[0], source.replace("-large", "-t200x200"));
});

test("artwork selection leaves unrelated images intact and preserves the CDN query", () => {
  assert.deepEqual(artworkCandidates("https://example.com/cover-large.jpg", 1080), ["https://example.com/cover-large.jpg"]);
  assert.deepEqual(artworkCandidates("https://i2.sndcdn.com/cover.jpg", 1080), ["https://i2.sndcdn.com/cover.jpg"]);
  assert.equal(artworkCandidates("https://i2.sndcdn.com/avatars-example-t50x50.png?x=1", 500)[0], "https://i2.sndcdn.com/avatars-example-t500x500.png?x=1");
});
