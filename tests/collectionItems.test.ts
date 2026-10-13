import test from "node:test";
import assert from "node:assert/strict";
import { collectionItems } from "../src/collectionItems.ts";
test("feed origins and comments retain their own record type", () => {
  assert.deepEqual(
    collectionItems(
      [{ origin: { id: 3, title: "Feed", urn: "soundcloud:tracks:3" } }],
      "tracks",
    ).map((row) => row.id),
    [3],
  );
  assert.deepEqual(
    collectionItems(
      [
        { id: 4, body: "Hello", user: { id: 8, username: "Listener" } },
        { id: 5, body: "Nice" },
      ],
      "comments",
    ).map((row) => row.id),
    [4, 5],
  );
});
test("likes and saved playlists unwrap their actual records without collapsing into one undefined id", () => {
  const rows = [
    { playlist: { id: 12, title: "Saved", track_count: 40 } },
    { playlist: { id: 13, title: "Second", track_count: 17 } },
    { id: 12, title: "Duplicate" },
  ];
  assert.deepEqual(
    collectionItems(rows, "playlists").map((row) => row.id),
    [12, 13],
  );
  assert.deepEqual(
    collectionItems(
      [
        { track: { id: 77, title: "Song" } },
        { user: { id: 88, username: "Artist" } },
      ],
      "tracks",
    ).map((row) => row.id),
    [77],
  );
});
test("search lists cannot render stale tracks or malformed identities as playlists", () => {
  assert.deepEqual(
    collectionItems(
      [
        { id: 1, title: "Song", urn: "soundcloud:tracks:1" },
        { id: 2, title: "Mix", urn: "soundcloud:playlists:2" },
        { id: undefined, title: "Broken" },
        null,
      ],
      "playlists",
    ).map((row) => row.id),
    [2],
  );
});
