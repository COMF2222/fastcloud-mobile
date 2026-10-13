import test from "node:test";
import assert from "node:assert/strict";
import { pushPage, popPage } from "../src/navigation.ts";
test("back returns from an artist to the exact song and collection that opened it", () => {
  const home = { page: "home", detail: null as number | null },
    playlist = { page: "playlist", detail: 12 },
    track = { page: "track", detail: 77 },
    artist = { page: "artist", detail: 33 };
  let history = pushPage([], home, playlist);
  history = pushPage(history, playlist, track);
  history = pushPage(history, track, artist);
  let back = popPage(history, home);
  assert.deepEqual(back.entry, track);
  back = popPage(back.history, home);
  assert.deepEqual(back.entry, playlist);
  back = popPage(back.history, home);
  assert.deepEqual(back.entry, home);
  assert.deepEqual(popPage(back.history, home).entry, home);
});
test("tab changes reset history and deep browsing keeps a bounded stack", () => {
  let history = [{ page: "home", detail: null }];
  for (let i = 0; i < 100; i++)
    history = pushPage(
      history,
      { page: String(i), detail: null },
      { page: String(i + 1), detail: null },
    );
  assert.equal(history.length, 30);
  assert.deepEqual(
    pushPage(
      history,
      { page: "artist", detail: null },
      { page: "home", detail: null },
      true,
    ),
    [],
  );
});
test("fresh metadata for the same song does not add a duplicate Back entry", () => {
  const history = [{ page: "home", detail: { id: 0 } }];
  assert.equal(
    pushPage(
      history,
      { page: "track", detail: { id: 17 } },
      { page: "track", detail: { id: 17 } },
    ),
    history,
  );
});
