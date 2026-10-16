import test from "node:test";
import assert from "node:assert/strict";
import {
  artistCollections,
  filterArtistItems,
  popularTracks,
} from "../src/artistCollections.ts";

test("artist releases recognize every API album flag and keep ordinary playlists separate", () => {
  const rows = [
    { id: 1, title: "Album", is_album: true },
    { id: 2, title: "EP", playlist_type: "ep" },
    { id: 3, title: "Release", set_type: "album" },
    { id: 4, title: "Mix", playlist_type: "playlist" },
    { id: 5, title: "Single", playlist_type: " single " },
    { id: 4, title: "Mix updated" },
  ];
  const grouped = artistCollections(rows);
  assert.deepEqual(
    grouped.albums.map((row) => row.id),
    [1, 2, 3, 5],
  );
  assert.deepEqual(
    grouped.playlists.map((row) => row.id),
    [4],
  );
  assert.equal(grouped.playlists[0].title, "Mix updated");
});

test("profile search matches performer credits and popularity never reorders uploads", () => {
  const rows = [
    {
      id: 1,
      title: "Track one",
      metadata_artist: "Lil Peep",
      playback_count: 4,
    },
    { id: 2, title: "Трек два", genre: "Рок", playback_count: 12 },
    { id: 3, title: "Track three" },
  ];
  assert.deepEqual(
    filterArtistItems(rows, "lil peep").map((row) => row.id),
    [1],
  );
  assert.deepEqual(
    filterArtistItems(rows, "рок").map((row) => row.id),
    [2],
  );
  assert.deepEqual(
    popularTracks(rows).map((row) => row.id),
    [2, 1, 3],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    [1, 2, 3],
  );
});
test("artist catalog search accepts Russian or English words without changing catalog order", () => {
  const rows = [
    { id: 1, title: "Ещё один вечер" },
    { id: 2, title: "WHITE WINE" },
    { id: 3, title: "Вечерний свет" },
  ];
  assert.deepEqual(
    filterArtistItems(rows, "еще вечер").map((row) => row.id),
    [1],
  );
  assert.deepEqual(
    filterArtistItems(rows, "white wine").map((row) => row.id),
    [2],
  );
  assert.deepEqual(filterArtistItems(rows, ""), rows);
  assert.deepEqual(filterArtistItems([], "x"), []);
});
