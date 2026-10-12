import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyCloud, type Feedback } from "../src/types.ts";
import {
  mergeCloud,
  acknowledge,
  blocked,
  shuffled,
  importScore,
  patchBatch,
} from "../src/contracts.ts";
import { moodQuery } from "../src/mood.ts";
import { parseLrc, currentLyricLine } from "../src/lyricsTiming.ts";
const feedback = (
  disliked: boolean,
  updatedAt: number,
  device = "a".repeat(32),
): Feedback => ({
  disliked,
  updatedAt,
  device,
  track: {
    id: 1,
    title: "Song",
    artist: "Artist",
    durationMs: 180000,
    genre: "",
    artworkUrl: null,
    permalinkUrl: null,
    isrc: null,
  },
});

test("large offline patches fit server limits without losing pending edits", () => {
  const dirty = {
    likedAt: Object.fromEntries(
      Array.from({ length: 237 }, (_, i) => [String(i + 1), 100]),
    ),
  };
  let remaining = dirty;
  const sizes: number[] = [];
  while (Object.keys(remaining.likedAt).length) {
    const batch = patchBatch(remaining);
    sizes.push(Object.keys(batch.likedAt!).length);
    remaining = acknowledge(remaining, batch) as typeof dirty;
  }
  assert.deepEqual(sizes, [100, 100, 37]);
  assert.equal(Object.keys(dirty.likedAt).length, 237);
});

test("deleted folders disappear locally while their tombstone still reaches the server", () => {
  const remote = emptyCloud();
  remote.folders.saved = {
    name: "Old folder",
    playlistIds: [1],
    pinned: false,
    order: 0,
  };
  const pending = { folders: { saved: null } };
  const value = mergeCloud(remote, remote, pending);
  assert.deepEqual(value.folders, {});
  assert.deepEqual(patchBatch(pending), pending);
  assert.ok(remote.folders.saved);
});
test("fresh mobile cache receives desktop preferences without sending defaults", () => {
  const remote = emptyCloud();
  remote.preferences = {
    theme: "Light",
    language: "English",
    wave_mode: "Discover",
  };
  const result = mergeCloud(remote, emptyCloud(), {});
  assert.deepEqual(result.preferences, remote.preferences);
  assert.notEqual(result.preferences, remote.preferences);
});
test("edits made while a request is in flight survive its acknowledgement", () => {
  const remaining = acknowledge(
    { preferences: { language: "English", theme: "Light" } },
    { preferences: { language: "Russian", theme: "Light" } },
  );
  assert.deepEqual(remaining.preferences, { language: "English" });
});
test("newer cloud dislike removal wins over an old offline retry", () => {
  const remote = emptyCloud(),
    local = emptyCloud();
  remote.trackFeedback["1"] = feedback(false, 200);
  local.trackFeedback["1"] = feedback(true, 100);
  assert.equal(
    mergeCloud(remote, local, {
      trackFeedback: { "1": local.trackFeedback["1"] },
    }).trackFeedback["1"].disliked,
    false,
  );
});
test("dislike filters matching reuploads and keeps unrelated performers", () => {
  const cloud = emptyCloud();
  cloud.trackFeedback["1"] = feedback(true, 100);
  assert.equal(
    blocked(
      { id: 2, title: "Song", metadata_artist: "Artist", duration: 181000 },
      cloud,
    ),
    true,
  );
  assert.equal(
    blocked(
      { id: 3, title: "Song", metadata_artist: "Another", duration: 181000 },
      cloud,
    ),
    false,
  );
});
test("removing a dislike permits the original recording again", () => {
  const cloud = emptyCloud();
  cloud.trackFeedback["1"] = feedback(false, 200);
  assert.equal(blocked({ id: 1, title: "Song" }, cloud), false);
});
test("imports reject previews, covers and incorrect recording lengths", () => {
  const item = { title: "Song", artist: "Artist", durationMs: 180000 };
  assert.equal(
    importScore(item, {
      id: 1,
      title: "Artist - Song",
      access: "playable",
      duration: 181000,
    }),
    100,
  );
  for (const track of [
    {
      id: 2,
      title: "Song",
      metadata_artist: "Artist",
      access: "preview",
      duration: 180000,
    },
    {
      id: 3,
      title: "Song (Remix)",
      metadata_artist: "Artist",
      access: "playable",
      duration: 180000,
    },
    {
      id: 4,
      title: "Song",
      metadata_artist: "Artist",
      access: "playable",
      duration: 90000,
    },
  ])
    assert.equal(importScore(item, track), 0);
});
test("mood queries accept Russian and English phrases", () => {
  for (const query of ["в зале", "на тренировке", "gym workout"])
    assert.equal(moodQuery(query), "workout energetic");
  for (const query of ["грустное", "печальная музыка", "sad songs"])
    assert.equal(moodQuery(query), "sad melancholic");
  assert.equal(moodQuery("Lil Peep white wine"), "Lil Peep white wine");
});
test("lyrics use milliseconds and repeated timestamps without lag", () => {
  const lines = parseLrc("[00:01.20][00:03.50]One\n[00:05.00]Two");
  assert.equal(currentLyricLine(lines, 1199), -1);
  assert.equal(currentLyricLine(lines, 1200), 0);
  assert.equal(currentLyricLine(lines, 3500), 1);
  assert.equal(currentLyricLine(lines, 5000), 2);
});
test("shuffle preserves the exact set and does not mutate saved order", () => {
  const original = [1, 2, 3, 4];
  const result = shuffled(original, () => 0);
  assert.deepEqual(original, [1, 2, 3, 4]);
  assert.deepEqual([...result].sort(), original);
  assert.notDeepEqual(result, original);
});
